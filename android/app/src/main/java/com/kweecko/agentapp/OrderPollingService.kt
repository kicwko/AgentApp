package com.kweecko.agentapp

import android.Manifest
import android.app.*
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.media.AudioAttributes
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

        const val CHANNEL_DUTY_ID = "kweecko_duty_channel"
        const val CHANNEL_ORDERS_ID = "kweecko_order_alerts_v6"

        const val DEFAULT_BASE_URL = "https://kweecko.com/api"
        const val POLL_INTERVAL_SECONDS = 25L

        @Volatile
        var isServiceRunning = false
            private set

        @Volatile
        var isOrderAlertActive = false

        @Volatile
        var lastNotifiedOrderId: String? = null

        val acceptedOrderIds: MutableSet<String> = java.util.Collections.synchronizedSet(mutableSetOf<String>())
        val declinedOrderIds: MutableSet<String> = java.util.Collections.synchronizedSet(mutableSetOf<String>())

        @Volatile
        private var instance: OrderPollingService? = null

        fun loadHandledOrders(context: Context) {
            try {
                val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
                val savedAccepted = prefs.getStringSet("accepted_order_ids", null)
                if (savedAccepted != null) {
                    acceptedOrderIds.addAll(savedAccepted)
                }
                val savedDeclined = prefs.getStringSet("declined_order_ids", null)
                if (savedDeclined != null) {
                    declinedOrderIds.addAll(savedDeclined)
                }
            } catch (_: Exception) {}
        }

        private fun persistHandledOrderId(context: Context, type: String, id: String) {
            try {
                val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
                val key = if (type == "accepted") "accepted_order_ids" else "declined_order_ids"
                val existing = prefs.getStringSet(key, mutableSetOf())?.toMutableSet() ?: mutableSetOf()
                existing.add(id)
                prefs.edit().putStringSet(key, existing).apply()
            } catch (_: Exception) {}
        }

        fun markOrderAccepted(context: Context?, orderId: String) {
            val cleanId = orderId.trim()
            if (cleanId.isNotBlank()) {
                acceptedOrderIds.add(cleanId)
                if (context != null) {
                    persistHandledOrderId(context, "accepted", cleanId)
                }
            }
            if (lastNotifiedOrderId == cleanId) {
                lastNotifiedOrderId = null
            }
            isOrderAlertActive = false
            instance?.cancelAlertAutoExpiry()
            OrderRingtoneManager.stopRinging()
            if (context != null) {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
            }
            Log.d(TAG, "Order $cleanId marked as ACCEPTED. Ringtone and alert stopped.")
        }

        fun markOrderDeclined(orderId: String) {
            markOrderDeclined(instance?.applicationContext, orderId)
        }

        fun markOrderDeclined(context: Context?, orderId: String) {
            val cleanId = orderId.trim()
            if (cleanId.isNotBlank()) {
                declinedOrderIds.add(cleanId)
                if (context != null) {
                    persistHandledOrderId(context, "declined", cleanId)
                }
            }
            if (lastNotifiedOrderId == cleanId) {
                lastNotifiedOrderId = null
            }
            isOrderAlertActive = false
            instance?.cancelAlertAutoExpiry()
            OrderRingtoneManager.stopRinging()
            if (context != null) {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
            }
            Log.d(TAG, "Order $cleanId marked as DECLINED. Ringtone and alert stopped.")
        }

        fun resetLastNotifiedOrder() {
            lastNotifiedOrderId = null
            isOrderAlertActive = false
            instance?.cancelAlertAutoExpiry()
            OrderRingtoneManager.stopRinging()
        }

        fun createNotificationChannels(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

                // Duty channel (silent minimal foreground notification)
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

                // High-Priority Order Alerts Channel
                val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.order_ringtone}")
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

        fun showNewOrderAlertNotification(
            context: Context,
            orderId: String,
            taskTitle: String,
            price: Double,
            orderJson: String
        ) {
            createNotificationChannels(context)

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("orderId", orderId)
                putExtra("orderJson", orderJson)
                putExtra("openOrder", true)
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                orderId.hashCode(),
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // ACCEPT Action Intent
            val acceptIntent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = NotificationActionReceiver.ACTION_ACCEPT
                putExtra("orderId", orderId)
            }
            val acceptPendingIntent = PendingIntent.getBroadcast(
                context,
                orderId.hashCode() + 1,
                acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // DECLINE Action Intent
            val declineIntent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = NotificationActionReceiver.ACTION_DECLINE
                putExtra("orderId", orderId)
            }
            val declinePendingIntent = PendingIntent.getBroadcast(
                context,
                orderId.hashCode() + 2,
                declineIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // DISMISS Delete Intent
            val dismissIntent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = NotificationActionReceiver.ACTION_DISMISS
                putExtra("orderId", orderId)
            }
            val dismissPendingIntent = PendingIntent.getBroadcast(
                context,
                orderId.hashCode() + 3,
                dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val formattedPrice = if (price > 0) "₹${price.toInt()}" else "Immediate Dispatch"
            val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.order_ringtone}")

            val alertNotification = NotificationCompat.Builder(context, CHANNEL_ORDERS_ID)
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

            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(ORDER_ALERT_NOTIFICATION_ID, alertNotification)
        }

        fun executeDirectPoll(context: Context) {
            val inst = instance
            if (inst != null && isServiceRunning) {
                inst.executePollCycle()
                return
            }

            val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            val onDuty = prefs.getBoolean("onDuty", true)
            if (!onDuty) return

            val phone = prefs.getString("phone", null) ?: return
            val cleanPhone = phone.replace("\\D".toRegex(), "").takeLast(10)
            val userId = prefs.getString("userId", null)
            val token = prefs.getString("token", null)
            val baseUrl = (prefs.getString("baseUrl", DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL).trimEnd('/')

            val coords = getCoordinatesHelper(context)
            val queryUrl = "$baseUrl/orders/poll?lat=${coords.first}&lng=${coords.second}&role=agent&limit=20"
            var conn: HttpURLConnection? = null

            try {
                val url = URL(queryUrl)
                conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 60000
                conn.readTimeout = 60000
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
                conn.setRequestProperty("x-user-role", "admin")
                conn.setRequestProperty("x-user-phone", cleanPhone)
                conn.setRequestProperty("x-auth-token", token ?: "mock-jwt-$cleanPhone")
                conn.setRequestProperty("Authorization", "Bearer ${token ?: "mock-jwt-$cleanPhone"}")
                if (!userId.isNullOrBlank()) conn.setRequestProperty("x-user-id", userId)

                val code = conn.responseCode
                if (code in 200..299) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val body = reader.use { it.readText() }
                    handlePollResponseStatic(context, body)
                }
            } catch (e: Exception) {
                Log.d(TAG, "Direct poll exception: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }

        fun handlePollResponseStatic(context: Context, jsonStr: String) {
            try {
                val root = JSONObject(jsonStr)
                val success = root.optBoolean("success", false)
                if (!success) return

                BackgroundPollingModule.emitOrderEvent("onOrdersPolled", root.toString())

                var pendingOrderObj: JSONObject? = null
                if (root.has("latestOrder") && !root.isNull("latestOrder")) {
                    val latest = root.getJSONObject("latestOrder")
                    if (latest.optString("status") == "Pending") {
                        pendingOrderObj = latest
                    }
                }
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

                if (pendingOrderObj != null) {
                    val orderId = pendingOrderObj.optString("_id", pendingOrderObj.optString("orderId", ""))
                    val humanOrderId = pendingOrderObj.optString("orderId", "")
                    val mongoId = pendingOrderObj.optString("_id", "")

                    loadHandledOrders(context)

                    val isDeclined = declinedOrderIds.contains(orderId) ||
                        (humanOrderId.isNotBlank() && declinedOrderIds.contains(humanOrderId)) ||
                        (mongoId.isNotBlank() && declinedOrderIds.contains(mongoId))

                    val isAccepted = acceptedOrderIds.contains(orderId) ||
                        (humanOrderId.isNotBlank() && acceptedOrderIds.contains(humanOrderId)) ||
                        (mongoId.isNotBlank() && acceptedOrderIds.contains(mongoId))

                    if (isDeclined || isAccepted) {
                        Log.d(TAG, "Order $orderId has already been handled (accepted=$isAccepted, declined=$isDeclined). Ignoring.")
                        if (isOrderAlertActive || OrderRingtoneManager.isCurrentlyRinging()) {
                            OrderRingtoneManager.stopRinging()
                            isOrderAlertActive = false
                            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                            manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
                        }
                        return
                    }

                    val title = pendingOrderObj.optString("taskTitle", "New Service Order")
                    val price = pendingOrderObj.optDouble("totalPrice", 0.0)

                    if (orderId.isNotBlank()) {
                        isOrderAlertActive = true
                        instance?.startAlertAutoExpiry()

                        val orderJson = pendingOrderObj.toString()
                        BackgroundPollingModule.pendingOrderJson = orderJson

                        if (orderId != lastNotifiedOrderId) {
                            lastNotifiedOrderId = orderId
                            if (!OrderRingtoneManager.isCurrentlyRinging()) {
                                OrderRingtoneManager.startRinging(context)
                            }
                            showNewOrderAlertNotification(context, orderId, title, price, orderJson)
                        }

                        BackgroundPollingModule.emitOrderEvent("onNewPendingOrder", orderJson)
                    }
                } else {
                    if (lastNotifiedOrderId != null || isOrderAlertActive) {
                        lastNotifiedOrderId = null
                        isOrderAlertActive = false
                        instance?.cancelAlertAutoExpiry()
                        OrderRingtoneManager.stopRinging()
                        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                        manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling poll response static: ${e.message}")
            }
        }

        fun getCoordinatesHelper(context: Context): Pair<Double, Double> {
            try {
                val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                    ?: return Pair(28.4595, 77.0266)

                val hasFine = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                val hasCoarse = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED

                if (!hasFine && !hasCoarse) return Pair(28.4595, 77.0266)

                var bestLocation: Location? = null
                val providers = listOf(
                    LocationManager.GPS_PROVIDER,
                    LocationManager.NETWORK_PROVIDER,
                    LocationManager.PASSIVE_PROVIDER
                )
                for (provider in providers) {
                    try {
                        if (locationManager.isProviderEnabled(provider)) {
                            val loc = locationManager.getLastKnownLocation(provider)
                            if (loc != null) {
                                if (bestLocation == null || loc.accuracy < bestLocation.accuracy) {
                                    bestLocation = loc
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }
                if (bestLocation != null) {
                    return Pair(bestLocation.latitude, bestLocation.longitude)
                }
            } catch (_: Exception) {}
            return Pair(28.4595, 77.0266)
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
        val expiredOrderId = lastNotifiedOrderId
        isOrderAlertActive = false
        lastNotifiedOrderId = null
        OrderRingtoneManager.stopRinging()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(ORDER_ALERT_NOTIFICATION_ID)

        if (!expiredOrderId.isNullOrBlank()) {
            NotificationActionReceiver.updateOrderStatusInBackground(
                applicationContext,
                expiredOrderId,
                "Canceled",
                "Auto-declined: 5-minute timeout reached"
            )
        }
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
        createNotificationChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_POLLING

        if (action == ACTION_STOP_POLLING) {
            val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("onDuty", false).apply()
            stopPolling()
            stopSelf()
            return START_NOT_STICKY
        }

        if (action == ACTION_POLL_ALARM) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            val wakeLock = powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "Kwiqo:OrderPollWakeLock"
            )
            wakeLock?.acquire(15000L)
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

        val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
        if (agentPhone.isNullOrBlank()) agentPhone = prefs.getString("phone", null)
        if (agentUserId.isNullOrBlank()) agentUserId = prefs.getString("userId", null)
        if (authToken.isNullOrBlank()) authToken = prefs.getString("token", null)
        val savedBaseUrl = prefs.getString("baseUrl", null)
        if (!savedBaseUrl.isNullOrBlank()) apiBaseUrl = savedBaseUrl.trimEnd('/')

        prefs.edit().apply {
            putBoolean("onDuty", true)
            if (!agentPhone.isNullOrBlank()) putString("phone", agentPhone)
            if (!agentUserId.isNullOrBlank()) putString("userId", agentUserId)
            if (!authToken.isNullOrBlank()) putString("token", authToken)
            putString("baseUrl", apiBaseUrl)
            apply()
        }

        val dutyNotification = createDutyNotification()
        startForeground(ONGOING_NOTIFICATION_ID, dutyNotification)

        isServiceRunning = true
        startPolling()

        return START_STICKY
    }

    private fun createDutyNotification(): Notification {
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

        scheduleNextAlarm(POLL_INTERVAL_SECONDS)
    }

    private fun scheduleNextAlarm(delaySeconds: Long = POLL_INTERVAL_SECONDS) {
        OrderPollingReceiver.scheduleNextAlarm(applicationContext, delaySeconds)
    }

    fun executePollCycle() {
        if (!isServiceRunning || isOrderAlertActive) {
            return
        }

        val coords = getCoordinatesHelper(this)
        val lat = coords.first
        val lng = coords.second

        val queryUrl = "${apiBaseUrl}/orders/poll?lat=$lat&lng=$lng&role=agent&limit=20"
        var conn: HttpURLConnection? = null

        try {
            val url = URL(queryUrl)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 60000
            conn.readTimeout = 60000
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
                handlePollResponseStatic(this, responseBody)
            } else {
                executeFallbackPendingOrdersCheck()
            }
        } catch (e: Exception) {
            executeFallbackPendingOrdersCheck()
        } finally {
            conn?.disconnect()
        }
    }

    private fun executeFallbackPendingOrdersCheck() {
        var fallbackConn: HttpURLConnection? = null
        try {
            if (agentPhone.isNullOrBlank()) {
                val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
                agentPhone = prefs.getString("phone", null)
                if (agentUserId.isNullOrBlank()) agentUserId = prefs.getString("userId", null)
                if (authToken.isNullOrBlank()) authToken = prefs.getString("token", null)
            }

            val cleanPhone = agentPhone?.replace("\\D".toRegex(), "")?.takeLast(10)
            val agentParam = if (!cleanPhone.isNullOrBlank()) "agentId=$cleanPhone" else if (!agentUserId.isNullOrBlank()) "agentId=$agentUserId" else null
            if (agentParam == null) {
                Log.d(TAG, "No agent identifier found for fallback orders check, skipping global query.")
                return
            }

            val fallbackUrl = "${apiBaseUrl}/orders?$agentParam&status=Pending&limit=20"
            val url = URL(fallbackUrl)
            fallbackConn = url.openConnection() as HttpURLConnection
            fallbackConn.requestMethod = "GET"
            fallbackConn.connectTimeout = 60000
            fallbackConn.readTimeout = 60000
            fallbackConn.setRequestProperty("Accept", "application/json")
            fallbackConn.setRequestProperty("Content-Type", "application/json")
            fallbackConn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
            fallbackConn.setRequestProperty("x-user-role", "admin")

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
                handlePollResponseStatic(this, responseBody)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Fallback poll exception: ${e.message}")
        } finally {
            fallbackConn?.disconnect()
        }
    }

    private fun stopPolling() {
        scheduler?.shutdownNow()
        scheduler = null
        isServiceRunning = false

        OrderPollingReceiver.cancelAlarms(applicationContext)

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
        val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
        val onDuty = prefs.getBoolean("onDuty", true)
        if (onDuty) {
            OrderPollingReceiver.scheduleNextAlarm(applicationContext, 1L)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        if (instance == this) instance = null
        cancelAlertAutoExpiry()
        scheduler?.shutdownNow()
        scheduler = null
        isServiceRunning = false

        val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
        val onDuty = prefs.getBoolean("onDuty", true)
        if (onDuty) {
            // Resurrect via broadcast alarm immediately if partner was still on-duty
            OrderPollingReceiver.scheduleNextAlarm(applicationContext, 1L)
        } else {
            stopPolling()
        }

        super.onDestroy()
    }
}
