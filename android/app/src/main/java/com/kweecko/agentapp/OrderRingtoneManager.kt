package com.kweecko.agentapp

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Continuous persistent alarm sound and vibration manager for new dispatch orders.
 * Keeps ringing the custom order MP3 and vibrating continuously like an emergency alarm
 * until the user explicitly accepts or declines the order, or until the 5-minute timeout.
 */
object OrderRingtoneManager {
    private const val TAG = "OrderRingtoneManager"
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
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

            // 1. Acquire partial wake lock so playback continues reliably even with screen off
            try {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                wakeLock = powerManager?.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "Kweecko:OrderAlarmWakeLock"
                )?.apply {
                    setReferenceCounted(false)
                    acquire(300_000L)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not acquire WakeLock: ${e.message}")
            }

            // 2. Ensure alarm audio stream has sufficient volume
            try {
                val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
                if (audioManager != null) {
                    val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
                    val currentVol = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
                    if (currentVol < (maxVol * 0.4).toInt()) {
                        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, (maxVol * 0.85).toInt(), 0)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not adjust alarm volume: ${e.message}")
            }

            // 3. Play Persistent Looping Ringtone via MediaPlayer with bundled MP3 (R.raw.order_ringtone)
            mediaPlayer?.release()
            mediaPlayer = null

            try {
                val afd = context.resources.openRawResourceFd(R.raw.order_ringtone)
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    isLooping = true
                    setVolume(1.0f, 1.0f)
                    prepare()
                    start()
                }
                Log.d(TAG, "Order dispatch MP3 alarm started looping successfully via raw FD.")
            } catch (fdErr: Exception) {
                Log.w(TAG, "Raw FD playback error, falling back to MediaPlayer.create: ${fdErr.message}")
                mediaPlayer = MediaPlayer.create(context.applicationContext, R.raw.order_ringtone)?.apply {
                    isLooping = true
                    setVolume(1.0f, 1.0f)
                    start()
                }
                Log.d(TAG, "Order dispatch MP3 alarm started looping via MediaPlayer.create.")
            }

            // 4. Setup Continuous Pulsing Vibration
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

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
            Log.d(TAG, "Order dispatch MP3 alarm stopped successfully.")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping mediaPlayer: ${e.message}")
        }

        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping vibrator: ${e.message}")
        }

        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing WakeLock: ${e.message}")
        }
    }

    fun isCurrentlyRinging(): Boolean = isRinging
}
