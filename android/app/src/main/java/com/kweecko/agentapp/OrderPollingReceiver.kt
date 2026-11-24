package com.kweecko.agentapp

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * High-reliability BroadcastReceiver for background order polling alarms and service resurrection.
 * Unlike PendingIntent.getService(), PendingIntent.getBroadcast() is fully exempt from
 * Android 12+ ForegroundServiceStartNotAllowedException when triggered by AlarmManager.
 */
class OrderPollingReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "OrderPollingReceiver"
        const val ACTION_POLL_ALARM = "com.kweecko.agentapp.ACTION_POLL_ALARM"
        const val ACTION_RESURRECT = "com.kweecko.agentapp.ACTION_RESURRECT"
        const val ALARM_REQUEST_CODE = 2001
        const val POLL_INTERVAL_SECONDS = 25L

        /**
         * Schedules the next periodic wake-up alarm via BroadcastReceiver.
         * Works across all Android versions even when app is killed or device is in Doze mode.
         */
        fun scheduleNextAlarm(context: Context, delaySeconds: Long = POLL_INTERVAL_SECONDS) {
            val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            val onDuty = prefs.getBoolean("onDuty", true)
            val phone = prefs.getString("phone", null)
            if (!onDuty || phone.isNullOrBlank()) {
                Log.d(TAG, "Not scheduling alarm: onDuty=$onDuty, hasPhone=${!phone.isNullOrBlank()}")
                return
            }

            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
                val intent = Intent(context, OrderPollingReceiver::class.java).apply {
                    action = ACTION_POLL_ALARM
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    ALARM_REQUEST_CODE,
                    intent,
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
                Log.d(TAG, "Scheduled next broadcast alarm in ${delaySeconds}s")
            } catch (e: Exception) {
                Log.w(TAG, "Failed scheduling next alarm: ${e.message}")
            }
        }

        /**
         * Cancels any pending broadcast alarms (e.g. when user goes off-duty).
         */
        fun cancelAlarms(context: Context) {
            try {
                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
                val intent = Intent(context, OrderPollingReceiver::class.java).apply {
                    action = ACTION_POLL_ALARM
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    ALARM_REQUEST_CODE,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                alarmManager.cancel(pendingIntent)
                Log.d(TAG, "Cancelled broadcast alarms")
            } catch (_: Exception) {}
        }

        /**
         * Starts or resurrects OrderPollingService safely using startForegroundService.
         */
        fun startOrResurrectService(context: Context) {
            val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
            val phone = prefs.getString("phone", null)
            val onDuty = prefs.getBoolean("onDuty", true)
            if (!onDuty || phone.isNullOrBlank()) return

            val userId = prefs.getString("userId", null)
            val token = prefs.getString("token", null)
            val baseUrl = prefs.getString("baseUrl", null)

            val serviceIntent = Intent(context, OrderPollingService::class.java).apply {
                action = OrderPollingService.ACTION_START_POLLING
                putExtra("phone", phone)
                putExtra("userId", userId)
                putExtra("token", token)
                putExtra("baseUrl", baseUrl)
            }

            try {
                ContextCompat.startForegroundService(context, serviceIntent)
                Log.d(TAG, "Successfully started foreground OrderPollingService")
            } catch (e: Exception) {
                Log.w(TAG, "Failed starting OrderPollingService: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.d(TAG, "onReceive: action=$action")

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Kwiqo:OrderPollingReceiverWakeLock"
        )
        wakeLock?.acquire(20000L) // 20s wake lock for network request & notification display

        val pendingResult = goAsync()

        Thread {
            try {
                val prefs = context.getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
                val onDuty = prefs.getBoolean("onDuty", true)
                val phone = prefs.getString("phone", null)

                if (!onDuty || phone.isNullOrBlank()) {
                    Log.d(TAG, "Partner off-duty or no phone saved, skipping poll cycle")
                    cancelAlarms(context)
                    return@Thread
                }

                // 1. Ensure Foreground Service is alive
                if (!OrderPollingService.isServiceRunning) {
                    startOrResurrectService(context)
                }

                // 2. Perform direct poll cycle via static service helper to guarantee
                // order is checked immediately even if service is booting
                OrderPollingService.executeDirectPoll(context)

                // 3. Schedule next periodic alarm
                scheduleNextAlarm(context, POLL_INTERVAL_SECONDS)
            } catch (t: Throwable) {
                Log.w(TAG, "Error in OrderPollingReceiver async block: ${t.message}")
                scheduleNextAlarm(context, POLL_INTERVAL_SECONDS)
            } finally {
                try {
                    if (wakeLock?.isHeld == true) wakeLock.release()
                } catch (_: Exception) {}
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
        }.start()
    }
}
