package com.kweecko.agentapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
            val onDuty = prefs.getBoolean("onDuty", true)

            if (!phone.isNullOrBlank() && onDuty) {
                try {
                    OrderPollingReceiver.startOrResurrectService(context)
                    OrderPollingReceiver.scheduleNextAlarm(context, 2L)
                    Log.d("BootReceiver", "Successfully scheduled resurrection on $action")
                } catch (e: Exception) {
                    Log.w("BootReceiver", "Failed starting OrderPollingService on $action: ${e.message}")
                }
            }
        }
    }
}
