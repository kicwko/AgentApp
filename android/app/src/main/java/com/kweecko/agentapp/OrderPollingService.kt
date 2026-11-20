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

        private const val ONGOING_NOTIFICATION_ID = 1001
        private const val ORDER_ALERT_NOTIFICATION_ID = 1002

        const val CHANNEL_DUTY_ID = "kweecko_duty_channel"
        const val CHANNEL_ORDERS_ID = "kweecko_order_persistent_alarm_v3"

        private const val DEFAULT_BASE_URL = "https://kweecko.com/api"
        private const val POLL_INTERVAL_SECONDS = 30L

        @Volatile
        var isServiceRunning = false
            private set
    }

    private var scheduler: ScheduledExecutorService? = null
    private var agentPhone: String? = null
    private var agentUserId: String? = null
    private var authToken: String? = null
    private var apiBaseUrl: String = DEFAULT_BASE_URL

    private var lastNotifiedOrderId: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START_POLLING

        if (action == ACTION_STOP_POLLING) {
            stopPolling()
            stopSelf()
            return START_NOT_STICKY
        }

        agentPhone = intent?.getStringExtra("phone") ?: agentPhone
        agentUserId = intent?.getStringExtra("userId") ?: agentUserId
        authToken = intent?.getStringExtra("token") ?: authToken
        intent?.getStringExtra("baseUrl")?.let {
            if (it.isNotBlank()) apiBaseUrl = it.trimEnd('/')
        }

        startForegroundServiceWithNotification()
        startPolling()

        return START_STICKY
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Ongoing Duty Channel (Low/Silent priority)
            val dutyChannel = NotificationChannel(
                CHANNEL_DUTY_ID,
                "Kweecko Service Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows live duty status and background dispatch polling."
                setShowBadge(false)
            }
            manager.createNotificationChannel(dutyChannel)

            // 2. High-Priority Order Alerts Channel (Persistent Alarm Sound & Vibrate)
            try {
                manager.deleteNotificationChannel("kweecko_orders_channel")
            } catch (_: Exception) {}

            val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${packageName}/${R.raw.order_ringtone}")
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build()

            val ordersChannel = NotificationChannel(
                CHANNEL_ORDERS_ID,
                "Persistent Order Alarm",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent alerts when a new order is dispatched to you."
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

    private fun startForegroundServiceWithNotification() {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_DUTY_ID)
            .setContentTitle("Kweecko Partner Active")
            .setContentText("Polling for nearby dispatches with live GPS...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ requires specifying foreground service types
                startForeground(
                    ONGOING_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(ONGOING_NOTIFICATION_ID, notification)
            }
            isServiceRunning = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to startForeground: ${e.message}", e)
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
    }

    private fun executePollCycle() {
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
                Log.d(TAG, "Poll returned status: $statusCode")
            }
        } catch (e: Exception) {
            Log.d(TAG, "Poll connection exception: ${e.message}")
        } finally {
            conn?.disconnect()
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

                if (orderId.isNotBlank() && orderId != lastNotifiedOrderId) {
                    lastNotifiedOrderId = orderId
                    // Start continuous ringing until user accepts or declines!
                    OrderRingtoneManager.startRinging(applicationContext)

                    showNewOrderAlertNotification(orderId, title, price)
                    BackgroundPollingModule.emitOrderEvent("onNewPendingOrder", pendingOrderObj.toString())
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing poll response: ${e.message}")
        }
    }

    private fun showNewOrderAlertNotification(orderId: String, taskTitle: String, price: Double) {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("orderId", orderId)
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

        val alertNotification = NotificationCompat.Builder(this, CHANNEL_ORDERS_ID)
            .setContentTitle("🔔 New Service Order Assigned!")
            .setContentText("$taskTitle • $formattedPrice. Tap to accept within 5 mins.")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("$taskTitle\nValue: $formattedPrice\nPersistent Alarm: Tap ACCEPT or DECLINE. Ringtone repeats until you respond.")
            )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 1000, 500, 1000, 500))
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .setDeleteIntent(dismissPendingIntent)
            .addAction(R.mipmap.ic_launcher, "ACCEPT", acceptPendingIntent)
            .addAction(R.mipmap.ic_launcher, "DECLINE", declinePendingIntent)
            .build()

        alertNotification.flags = alertNotification.flags or
            Notification.FLAG_INSISTENT or
            Notification.FLAG_NO_CLEAR or
            Notification.FLAG_ONGOING_EVENT

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
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() {
        stopPolling()
        super.onDestroy()
    }
}
