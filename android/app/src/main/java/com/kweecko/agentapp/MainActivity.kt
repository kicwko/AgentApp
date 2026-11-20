package com.kweecko.agentapp

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Ensure app is NOT displayed on top of the device lock screen
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(false)
      setTurnScreenOn(false)
    } else {
      @Suppress("DEPRECATION")
      window?.clearFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    handleDismissNotification()
    applyLightSystemBars()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleDismissNotification()
  }

  override fun onResume() {
    super.onResume()
    handleDismissNotification()
    applyLightSystemBars()
  }

  /**
   * When user clicks on the push notification or returns to app,
   * immediately dismiss the order alert notification and silence any active ringtone.
   */
  private fun handleDismissNotification() {
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      manager?.cancel(1002) // OrderPollingService.ORDER_ALERT_NOTIFICATION_ID
      OrderRingtoneManager.stopRinging()

      val orderJson = intent?.getStringExtra("orderJson")
      if (!orderJson.isNullOrBlank()) {
        intent?.removeExtra("orderJson")
        intent?.removeExtra("orderId")
        intent?.removeExtra("openOrder")
        BackgroundPollingModule.pendingOrderJson = orderJson
        BackgroundPollingModule.emitOrderEvent("onNewPendingOrder", orderJson)
      }
    } catch (_: Exception) {}
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      applyLightSystemBars()
    }
  }

  /**
   * Enforces dark navigation icons (back, home, recents) and dark status bar icons
   * so they are always clearly visible against white/light backgrounds in full height mode.
   */
  private fun applyLightSystemBars() {
    val win = window ?: return
    try {
      win.statusBarColor = Color.WHITE
      win.navigationBarColor = Color.WHITE

      val insetsController = WindowInsetsControllerCompat(win, win.decorView)
      insetsController.isAppearanceLightStatusBars = true
      insetsController.isAppearanceLightNavigationBars = true
    } catch (_: Exception) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        @Suppress("DEPRECATION")
        win.decorView.systemUiVisibility = (
          win.decorView.systemUiVisibility
            or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        )
      }
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AgentApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
