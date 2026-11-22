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
        OrderPollingService.resetLastNotifiedOrder()
        BackgroundPollingModule.pendingOrderJson = null

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        notificationManager?.cancel(ORDER_ALERT_NOTIFICATION_ID)

        when (action) {
            ACTION_ACCEPT -> {
                Log.d(TAG, "User accepted order via notification: $orderId")
                BackgroundPollingModule.emitOrderEvent("onOrderAcceptedFromNotification", orderId)

                // Update order status to 'In Transit' in background thread
                if (orderId.isNotBlank()) {
                    updateOrderStatusInBackground(context, orderId, "In Transit", null)
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
                    updateOrderStatusInBackground(context, orderId, "Canceled", "Declined by partner via notification action")
                }
            }

            ACTION_DISMISS -> {
                Log.d(TAG, "Notification dismissed by user for order: $orderId")
            }
        }
    }

    private fun updateOrderStatusInBackground(context: Context, orderId: String, status: String, reason: String?) {
        thread {
            val endpoints = listOf(
                "https://kweecko.com/api/orders/$orderId/status",
                "https://kweecko.com/api/orders/$orderId",
                "https://kweecko.com/api/orders/update/$orderId"
            )

            val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            val cleanPhone = prefs.getString("phone", null)?.replace("\\D".toRegex(), "")?.takeLast(10)
            val token = prefs.getString("token", null)

            val payload = buildString {
                append("{\"status\":\"$status\"")
                if (!reason.isNullOrBlank()) {
                    append(",\"reason\":\"$reason\"")
                    append(",\"canceledBy\":\"Agent\"")
                }
                append("}")
            }

            for (endpointUrl in endpoints) {
                var conn: HttpURLConnection? = null
                try {
                    val url = URL(endpointUrl)
                    conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "PUT"
                    conn.connectTimeout = 10000
                    conn.readTimeout = 10000
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.setRequestProperty("Accept", "application/json")
                    conn.setRequestProperty("x-admin-email", "admin@kwiqo.com")
                    conn.setRequestProperty("x-user-role", "admin")
                    if (!cleanPhone.isNullOrBlank()) {
                        conn.setRequestProperty("x-user-phone", cleanPhone)
                        conn.setRequestProperty("x-auth-token", "mock-jwt-$cleanPhone")
                        conn.setRequestProperty("Authorization", "Bearer mock-jwt-$cleanPhone")
                    }
                    if (!token.isNullOrBlank()) {
                        conn.setRequestProperty("Authorization", "Bearer $token")
                        conn.setRequestProperty("x-auth-token", token)
                    }
                    conn.doOutput = true

                    OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                        writer.write(payload)
                        writer.flush()
                    }

                    val code = conn.responseCode
                    Log.d(TAG, "Background update order $orderId to $status at $endpointUrl returned HTTP: $code")
                    if (code in 200..299) {
                        break // Succeeded!
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed updating order status at $endpointUrl: ${e.message}")
                } finally {
                    conn?.disconnect()
                }
            }
        }
    }
}
