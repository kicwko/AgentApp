package com.kweecko.agentapp

import android.Manifest
import android.app.*
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class OrderPollingService : Service() {

    companion object {
        const val TAG = "OrderPollingService"
        const val ACTION_START_POLLING = "com.kweecko.agentapp.START_POLLING"
        const val ACTION_STOP_POLLING = "com.kweecko.agentapp.STOP_POLLING"
        const val ACTION_POLL_ALARM = "com.kweecko.agentapp.ACTION_POLL_ALARM"

        private const val ONGOING_NOTIFICATION_ID = 1001
        private const val ORDER_ALERT_NOTIFICATION_ID = 1002
        private const val ALARM_REQUEST_CODE = 2001
        private const val RESURRECTION_REQUEST_CODE = 9999

        const val CHANNEL_DUTY_ID = "kweecko_duty_channel"
        const val CHANNEL_ORDERS_ID = "kweecko_order_alerts_v6"

        private const val DEFAULT_BASE_URL = "https://kweecko.com/api"
        private const val POLL_INTERVAL_SECONDS = 25L

        @Volatile
        var isServiceRunning = false
            private set

        @Volatile
        var isOrderAlertActive = false

        @Volatile
        var lastNotifiedOrderId: String? = null

        private var instance: OrderPollingService? = null

        fun resetLastNotifiedOrder() {
            lastNotifiedOrderId = null
            isOrderAlertActive = false
            instance?.cancelAlertAutoExpiry()
        }
    }

    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var scheduler: ScheduledExecutorService? = null
    private var agentPhone: String? = null
    private var agentUserId: String? = null
    private var authToken: String? = null
    private var apiBaseUrl: String = DEFAULT_BASE_URL

    private val alertAutoExpiryRunnable = Runnable {
        Log.d(TAG, "5-minute alert auto-expiry reached. Resetting alert active flag and stopping sound.")
        isOrderAlertActive = false
        lastNotifiedOrderId = null
        OrderRingtoneManager.stopRinging()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
    }

    fun startAlertAutoExpiry() {
        mainHandler.removeCallbacks(alertAutoExpiryRunnable)
        mainHandler.postDelayed(alertAutoExpiryRunnable, 300_000L) // 5 minutes
    }

    fun cancelAlertAutoExpiry() {
        mainHandler.removeCallbacks(alertAutoExpiryRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_POLLING

        if (action == ACTION_STOP_POLLING) {
            stopPolling()
            stopSelf()
            return START_NOT_STICKY
        }

        if (action == ACTION_POLL_ALARM) {
            // Heartbeat wake-up alarm executed even when phone is locked or deep in Doze mode
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wakeLock = powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "Kwiqo:OrderPollWakeLock"
            )
            wakeLock?.acquire(15000L) // 15-second partial wake lock to guarantee CPU stays active during network call
            try {
                executePollCycle()
            } catch (t: Throwable) {
                Log.w(TAG, "Error in alarm poll cycle: ${t.message}")
            } finally {
                scheduleNextAlarm(POLL_INTERVAL_SECONDS)
                try {
                    if (wakeLock?.isHeld == true) wakeLock.release()
                } catch (_: Exception) {}
            }
            return START_STICKY
        }

        agentPhone = intent?.getStringExtra("phone") ?: agentPhone
        agentUserId = intent?.getStringExtra("userId") ?: agentUserId
        authToken = intent?.getStringExtra("token") ?: authToken
        intent?.getStringExtra("baseUrl")?.let {
            if (it.isNotBlank()) apiBaseUrl = it.trimEnd('/')
        }

        // Load persisted credentials from SharedPreferences if missing
        val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
        if (agentPhone.isNullOrBlank()) {
            agentPhone = prefs.getString("phone", null)
        }
        if (agentUserId.isNullOrBlank()) {
            agentUserId = prefs.getString("userId", null)
        }
        if (authToken.isNullOrBlank()) {
            authToken = prefs.getString("token", null)
        }
        val savedBaseUrl = prefs.getString("baseUrl", null)
        if (!savedBaseUrl.isNullOrBlank()) {
            apiBaseUrl = savedBaseUrl.trimEnd('/')
        }

        // Persist fresh credentials back if provided in intent
        if (!agentPhone.isNullOrBlank()) {
            prefs.edit().apply {
                putString("phone", agentPhone)
                putString("userId", agentUserId)
                putString("token", authToken)
                putString("baseUrl", apiBaseUrl)
                apply()
            }
        }

        // Satisfy Android Foreground Service requirement with a completely silent, minimal notification
        val dutyNotification = createDutyNotification()
        startForeground(ONGOING_NOTIFICATION_ID, dutyNotification)

        isServiceRunning = true
        startPolling()

        return START_STICKY
    }

    private fun createDutyNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val dutyChannel = NotificationChannel(
                CHANNEL_DUTY_ID,
                "Duty Status",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Silent background duty monitoring"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            manager.createNotificationChannel(dutyChannel)
        }

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            100,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_DUTY_ID)
            .setContentTitle("Kweecko Partner Online")
            .setContentText("Monitoring live dispatch requests")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Remove legacy channels if present
            try {
                manager.deleteNotificationChannel(CHANNEL_DUTY_ID)
                manager.deleteNotificationChannel("kweecko_orders_channel")
                manager.deleteNotificationChannel("kweecko_order_persistent_alarm_v3")
                manager.deleteNotificationChannel("kweecko_order_alerts_v4")
                manager.deleteNotificationChannel("kweecko_order_alerts_v5")
            } catch (_: Exception) {}

            // High-Priority Order Alerts Channel (v5)
            // Configured with custom order_ringtone and high importance so Android OS
            // presents a loud, heads-up banner notification immediately.
            val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${packageName}/${R.raw.order_ringtone}")
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val ordersChannel = NotificationChannel(
                CHANNEL_ORDERS_ID,
                "Order Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alerts when a new order is dispatched to you."
                setSound(soundUri, audioAttributes)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500)
                setBypassDnd(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
            manager.createNotificationChannel(ordersChannel)
        }
    }

    private fun startPolling() {
        scheduler?.shutdownNow()
        scheduler = Executors.newSingleThreadScheduledExecutor()

        scheduler?.scheduleWithFixedDelay(
            {
                try {
                    executePollCycle()
                } catch (t: Throwable) {
                    Log.w(TAG, "Error in background poll cycle: ${t.message}")
                }
            },
            0L,
            POLL_INTERVAL_SECONDS,
            TimeUnit.SECONDS
        )

        // Schedule exact hardware wakeup alarm so Doze Mode / deep sleep cannot freeze polling
        scheduleNextAlarm(POLL_INTERVAL_SECONDS)
    }

    private fun scheduleNextAlarm(delaySeconds: Long = POLL_INTERVAL_SECONDS) {
        if (!isServiceRunning) return
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val alarmIntent = Intent(applicationContext, OrderPollingService::class.java).apply {
                action = ACTION_POLL_ALARM
            }
            val pendingIntent = PendingIntent.getService(
                applicationContext,
                ALARM_REQUEST_CODE,
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerTime = SystemClock.elapsedRealtime() + delaySeconds * 1000L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error scheduling next alarm: ${e.message}")
        }
    }

    private fun executePollCycle() {
        if (isOrderAlertActive) {
            Log.d(TAG, "Order alert is actively running on user's device. Skipping poll cycle.")
            return
        }

        val coords = getCurrentCoordinates()
        val lat = coords.first
        val lng = coords.second

        val queryUrl = "${apiBaseUrl}/orders/poll?lat=$lat&lng=$lng&role=agent&limit=20"
        var conn: HttpURLConnection? = null

        try {
            val url = URL(queryUrl)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
            conn.setRequestProperty("x-user-role", "admin")

            if (agentPhone.isNullOrBlank()) {
                val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
                agentPhone = prefs.getString("phone", null)
                if (agentUserId.isNullOrBlank()) agentUserId = prefs.getString("userId", null)
                if (authToken.isNullOrBlank()) authToken = prefs.getString("token", null)
            }

            val cleanPhone = agentPhone?.replace("\\D".toRegex(), "")?.takeLast(10)
            if (!cleanPhone.isNullOrBlank()) {
                conn.setRequestProperty("x-user-phone", cleanPhone)
                conn.setRequestProperty("x-auth-token", "mock-jwt-$cleanPhone")
                if (authToken.isNullOrBlank()) {
                    conn.setRequestProperty("Authorization", "Bearer mock-jwt-$cleanPhone")
                }
            }
            if (!agentUserId.isNullOrBlank()) {
                conn.setRequestProperty("x-user-id", agentUserId)
            }
            if (!authToken.isNullOrBlank()) {
                conn.setRequestProperty("Authorization", "Bearer $authToken")
                conn.setRequestProperty("x-auth-token", authToken)
            }

            val statusCode = conn.responseCode
            if (statusCode in 200..299) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val responseBody = reader.use { it.readText() }
                parseAndHandlePollResponse(responseBody)
            } else {
                Log.d(TAG, "Poll returned status: $statusCode, triggering fallback")
                executeFallbackPendingOrdersCheck()
            }
        } catch (e: Exception) {
            Log.d(TAG, "Poll connection exception: ${e.message}, triggering fallback")
            executeFallbackPendingOrdersCheck()
        } finally {
            conn?.disconnect()
        }
    }

    private fun executeFallbackPendingOrdersCheck() {
        var fallbackConn: HttpURLConnection? = null
        try {
            val fallbackUrl = "${apiBaseUrl}/orders?status=Pending&limit=20"
            val url = URL(fallbackUrl)
            fallbackConn = url.openConnection() as HttpURLConnection
            fallbackConn.requestMethod = "GET"
            fallbackConn.connectTimeout = 10000
            fallbackConn.readTimeout = 10000
            fallbackConn.setRequestProperty("Accept", "application/json")
            fallbackConn.setRequestProperty("Content-Type", "application/json")
            fallbackConn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
            fallbackConn.setRequestProperty("x-user-role", "admin")

            val cleanPhone = agentPhone?.replace("\\D".toRegex(), "")?.takeLast(10)
            if (!cleanPhone.isNullOrBlank()) {
                fallbackConn.setRequestProperty("x-user-phone", cleanPhone)
                fallbackConn.setRequestProperty("x-auth-token", "mock-jwt-$cleanPhone")
                if (authToken.isNullOrBlank()) {
                    fallbackConn.setRequestProperty("Authorization", "Bearer mock-jwt-$cleanPhone")
                }
            }
            if (!agentUserId.isNullOrBlank()) {
                fallbackConn.setRequestProperty("x-user-id", agentUserId)
            }
            if (!authToken.isNullOrBlank()) {
                fallbackConn.setRequestProperty("Authorization", "Bearer $authToken")
                fallbackConn.setRequestProperty("x-auth-token", authToken)
            }

            val statusCode = fallbackConn.responseCode
            if (statusCode in 200..299) {
                val reader = BufferedReader(InputStreamReader(fallbackConn.inputStream))
                val responseBody = reader.use { it.readText() }
                parseAndHandlePollResponse(responseBody)
            } else {
                Log.d(TAG, "Fallback poll status: $statusCode")
            }
        } catch (e: Exception) {
            Log.d(TAG, "Fallback poll exception: ${e.message}")
        } finally {
            fallbackConn?.disconnect()
        }
    }

    private fun parseAndHandlePollResponse(jsonStr: String) {
        try {
            val root = JSONObject(jsonStr)
            val success = root.optBoolean("success", false)
            if (!success) return

            // Broadcast response to React Native JS layer
            BackgroundPollingModule.emitOrderEvent("onOrdersPolled", root.toString())

            // Inspect for pending orders
            var pendingOrderObj: JSONObject? = null

            // 1. Check latestOrder
            if (root.has("latestOrder") && !root.isNull("latestOrder")) {
                val latest = root.getJSONObject("latestOrder")
                if (latest.optString("status") == "Pending") {
                    pendingOrderObj = latest
                }
            }

            // 2. Check candidate array if latestOrder wasn't Pending
            if (pendingOrderObj == null) {
                val ordersArray: JSONArray? = root.optJSONArray("orders") ?: root.optJSONArray("data")
                if (ordersArray != null) {
                    for (i in 0 until ordersArray.length()) {
                        val item = ordersArray.optJSONObject(i)
                        if (item != null && item.optString("status") == "Pending") {
                            pendingOrderObj = item
                            break
                        }
                    }
                }
            }

            // If a pending order is present and hasn't been notified yet, notify user!
            if (pendingOrderObj != null) {
                val orderId = pendingOrderObj.optString("_id", pendingOrderObj.optString("orderId", ""))
                val title = pendingOrderObj.optString("taskTitle", "New Service Order")
                val price = pendingOrderObj.optDouble("totalPrice", 0.0)

                if (orderId.isNotBlank()) {
                    isOrderAlertActive = true
                    startAlertAutoExpiry()

                    val orderJson = pendingOrderObj.toString()
                    BackgroundPollingModule.pendingOrderJson = orderJson

                    val activeAlertVisible = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                        manager?.activeNotifications?.any { it.id == ORDER_ALERT_NOTIFICATION_ID } ?: false
                    } else {
                        false
                    }

                    if (orderId != lastNotifiedOrderId || !activeAlertVisible) {
                        lastNotifiedOrderId = orderId

                        // 1. Start continuous ringing persistent alarm
                        if (!OrderRingtoneManager.isCurrentlyRinging()) {
                            OrderRingtoneManager.startRinging(applicationContext)
                        }

                        // 2. Display high-priority heads-up order alert notification
                        showNewOrderAlertNotification(orderId, title, price, orderJson)
                    }

                    BackgroundPollingModule.emitOrderEvent("onNewPendingOrder", orderJson)
                }
            } else {
                // If there was a pending order that was accepted, declined, or canceled elsewhere, reset
                if (lastNotifiedOrderId != null || isOrderAlertActive) {
                    lastNotifiedOrderId = null
                    isOrderAlertActive = false
                    cancelAlertAutoExpiry()
                    OrderRingtoneManager.stopRinging()
                    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                    manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing poll response: ${e.message}")
        }
    }

    private fun showNewOrderAlertNotification(orderId: String, taskTitle: String, price: Double, orderJson: String) {
        createNotificationChannels() // Always ensure channel is active before notifying

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("orderId", orderId)
            putExtra("orderJson", orderJson)
            putExtra("openOrder", true)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            orderId.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // ACCEPT Action Intent
        val acceptIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_ACCEPT
            putExtra("orderId", orderId)
        }
        val acceptPendingIntent = PendingIntent.getBroadcast(
            this,
            orderId.hashCode() + 1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // DECLINE Action Intent
        val declineIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_DECLINE
            putExtra("orderId", orderId)
        }
        val declinePendingIntent = PendingIntent.getBroadcast(
            this,
            orderId.hashCode() + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // DISMISS Delete Intent (stops ringing if notification dismissed)
        val dismissIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_DISMISS
            putExtra("orderId", orderId)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            this,
            orderId.hashCode() + 3,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val formattedPrice = if (price > 0) "₹${price.toInt()}" else "Immediate Dispatch"
        val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${packageName}/${R.raw.order_ringtone}")

        // Order Alert Notification:
        // - autoCancel(true) & ongoing(false): Cleared immediately when user clicks on it or swipes it away.
        // - PRIORITY_MAX & CATEGORY_CALL & fullScreenIntent: Guarantees heads-up banner display over apps.
        // - setSound(soundUri): Plays custom dispatch audio immediately with push alert.
        val alertNotification = NotificationCompat.Builder(this, CHANNEL_ORDERS_ID)
            .setContentTitle("🔔 New Service Order Assigned!")
            .setContentText("$taskTitle • $formattedPrice. Tap to view and respond.")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("$taskTitle\nValue: $formattedPrice\nTap ACCEPT or DECLINE to respond.")
            )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(soundUri)
            .setOngoing(false)
            .setAutoCancel(true)
            .setVibrate(longArrayOf(0, 1000, 500, 1000, 500))
            .setContentIntent(pendingIntent)
            .setDeleteIntent(dismissPendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .addAction(R.mipmap.ic_launcher, "ACCEPT", acceptPendingIntent)
            .addAction(R.mipmap.ic_launcher, "DECLINE", declinePendingIntent)
            .build()

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(ORDER_ALERT_NOTIFICATION_ID, alertNotification)
    }

    private fun getCurrentCoordinates(): Pair<Double, Double> {
        try {
            val locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: return Pair(28.4595, 77.0266)

            val hasFine = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            val hasCoarse = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                return Pair(28.4595, 77.0266)
            }

            var loc: Location? = null
            if (hasFine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                loc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            }
            if (loc == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                loc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }

            if (loc != null) {
                return Pair(loc.latitude, loc.longitude)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Error getting location: ${e.message}")
        }
        return Pair(28.4595, 77.0266)
    }

    private fun stopPolling() {
        scheduler?.shutdownNow()
        scheduler = null
        isServiceRunning = false

        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val alarmIntent = Intent(applicationContext, OrderPollingService::class.java).apply {
                action = ACTION_POLL_ALARM
            }
            val pendingIntent = PendingIntent.getService(
                applicationContext,
                ALARM_REQUEST_CODE,
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager?.cancel(pendingIntent)
        } catch (_: Exception) {}

        OrderRingtoneManager.stopRinging()
        stopForeground(STOP_FOREGROUND_REMOVE)
        try {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.cancel(ONGOING_NOTIFICATION_ID)
            manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {}
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "onTaskRemoved: app closed/swiped from recents, scheduling service resurrection")
        try {
            val restartIntent = Intent(applicationContext, OrderPollingService::class.java).apply {
                action = ACTION_START_POLLING
                putExtra("phone", agentPhone)
                putExtra("userId", agentUserId)
                putExtra("token", authToken)
                putExtra("baseUrl", apiBaseUrl)
            }
            val restartPendingIntent = PendingIntent.getService(
                applicationContext,
                RESURRECTION_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val triggerTime = SystemClock.elapsedRealtime() + 1000L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager?.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerTime,
                    restartPendingIntent
                )
            } else {
                alarmManager?.set(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerTime,
                    restartPendingIntent
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed scheduling resurrection onTaskRemoved: ${e.message}")
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (instance == this) instance = null
        cancelAlertAutoExpiry()
        stopPolling()
        super.onDestroy()
    }
}
