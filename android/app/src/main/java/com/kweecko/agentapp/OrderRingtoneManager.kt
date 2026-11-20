package com.kweecko.agentapp

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Continuous sound and vibration manager for new dispatch orders.
 * Keeps ringing/vibrating like an incoming emergency call until the user
 * explicitly accepts or declines the order, or until the 5-minute expiration timer passes.
 */
object OrderRingtoneManager {
    private const val TAG = "OrderRingtoneManager"
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var isRinging = false

    // Auto-stop ringing after 5 minutes (300,000 ms) when order auto-declines
    private val timeoutRunnable = Runnable {
        Log.d(TAG, "5-minute ringing timeout reached. Automatically stopping ringtone.")
        stopRinging()
    }

    @Synchronized
    fun startRinging(context: Context) {
        if (isRinging) return
        isRinging = true

        try {
            // Cancel previous timeout and set fresh 5-minute timeout
            mainHandler.removeCallbacks(timeoutRunnable)
            mainHandler.postDelayed(timeoutRunnable, 300_000L)

            // 1. Setup Looping Ringtone via MediaPlayer
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(context.applicationContext, ringtoneUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
            Log.d(TAG, "Order dispatch ringtone started looping successfully.")

            // 2. Setup Continuous Pulsing Vibration
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            // Pattern: wait 0ms, vibrate 1000ms, pause 500ms, vibrate 1000ms, pause 500ms...
            val pattern = longArrayOf(0, 1000, 500, 1000, 500)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0)) // 0 = repeat from index 0
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting continuous order ringtone: ${e.message}", e)
        }
    }

    @Synchronized
    fun stopRinging() {
        if (!isRinging) return
        isRinging = false

        mainHandler.removeCallbacks(timeoutRunnable)

        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.reset()
                it.release()
            }
            mediaPlayer = null
            Log.d(TAG, "Order dispatch ringtone stopped successfully.")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping mediaPlayer: ${e.message}")
        }

        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping vibrator: ${e.message}")
        }
    }

    fun isCurrentlyRinging(): Boolean = isRinging
}
