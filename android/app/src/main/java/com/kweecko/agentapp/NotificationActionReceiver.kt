package com.kweecko.agentapp

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Handles push notification CTA actions (ACCEPT, DECLINE, DISMISS) directly
 * from the Android notification shade or lock screen.
 */
class NotificationActionReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "NotificationActionReceiver"
        const val ACTION_ACCEPT = "com.kweecko.agentapp.ACTION_ACCEPT_ORDER"
        const val ACTION_DECLINE = "com.kweecko.agentapp.ACTION_DECLINE_ORDER"
        const val ACTION_DISMISS = "com.kweecko.agentapp.ACTION_DISMISS_ORDER"
        const val ORDER_ALERT_NOTIFICATION_ID = 1002
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val orderId = intent.getStringExtra("orderId") ?: ""

        Log.d(TAG, "Notification action received: $action for orderId: $orderId")

        // 1. Immediately stop ringing and cancel notification
        OrderRingtoneManager.stopRinging()

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        notificationManager?.cancel(ORDER_ALERT_NOTIFICATION_ID)

        when (action) {
            ACTION_ACCEPT -> {
                Log.d(TAG, "User accepted order via notification: $orderId")
                BackgroundPollingModule.emitOrderEvent("onOrderAcceptedFromNotification", orderId)

                // Update order status to 'In Transit' in background thread
                if (orderId.isNotBlank()) {
                    updateOrderStatusInBackground(orderId, "In Transit", null)
                }

                // Bring MainActivity to foreground
                val appIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("orderId", orderId)
                    putExtra("accepted", true)
                }
                context.startActivity(appIntent)
            }

            ACTION_DECLINE -> {
                Log.d(TAG, "User declined order via notification: $orderId")
                BackgroundPollingModule.emitOrderEvent("onOrderDeclinedFromNotification", orderId)

                // Update order status to 'Canceled' in background thread
                if (orderId.isNotBlank()) {
                    updateOrderStatusInBackground(orderId, "Canceled", "Declined by partner via notification action")
                }
            }

            ACTION_DISMISS -> {
                Log.d(TAG, "Notification dismissed by user for order: $orderId")
            }
        }
    }

    private fun updateOrderStatusInBackground(orderId: String, status: String, reason: String?) {
        thread {
            var conn: HttpURLConnection? = null
            try {
                val url = URL("https://kweecko.com/api/orders/$orderId/status")
                conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "PUT"
                conn.connectTimeout = 12000
                conn.readTimeout = 12000
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
                conn.setRequestProperty("x-user-role", "admin")
                conn.doOutput = true

                val payload = buildString {
                    append("{\"status\":\"$status\"")
                    if (!reason.isNullOrBlank()) {
                        append(",\"reason\":\"$reason\"")
                    }
                    append("}")
                }

                OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                    writer.write(payload)
                    writer.flush()
                }

                val code = conn.responseCode
                Log.d(TAG, "Background update order $orderId to $status completed with HTTP: $code")
            } catch (e: Exception) {
                Log.w(TAG, "Failed updating order status in background: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }
}
