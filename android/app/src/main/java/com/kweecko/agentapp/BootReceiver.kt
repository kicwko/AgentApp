package com.kweecko.agentapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Resurrects OrderPollingService on device boot or app update/replacement,
 * ensuring agents receive push notifications even if the phone was restarted
 * or the app was closed.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.d("BootReceiver", "Received broadcast action: $action")

        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            val phone = prefs.getString("phone", null)
            val userId = prefs.getString("userId", null)
            val token = prefs.getString("token", null)
            val baseUrl = prefs.getString("baseUrl", null)

            // Resurrect service if phone / credentials exist
            if (!phone.isNullOrBlank()) {
                val serviceIntent = Intent(context, OrderPollingService::class.java).apply {
                    this.action = OrderPollingService.ACTION_START_POLLING
                    putExtra("phone", phone)
                    putExtra("userId", userId)
                    putExtra("token", token)
                    putExtra("baseUrl", baseUrl)
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                    Log.d("BootReceiver", "Successfully started OrderPollingService on $action")
                } catch (e: Exception) {
                    Log.w("BootReceiver", "Failed starting OrderPollingService on $action: ${e.message}")
                }
            }
        }
    }
}
