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
    handleNotificationIntent()
    applyLightSystemBars()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleNotificationIntent()
  }

  override fun onResume() {
    super.onResume()
    val isAccepted = intent?.getBooleanExtra("accepted", false) ?: false
    if (isAccepted) {
      OrderRingtoneManager.stopRinging()
      OrderPollingService.resetLastNotifiedOrder()
    }
    handleNotificationIntent()
    applyLightSystemBars()
  }

  /**
   * When user clicks on the push notification banner to open the app,
   * extract the dispatched order payload and emit to React Native so the full-screen
   * incoming dispatch alert modal appears immediately.
   * If the order has already been accepted or handled, sound is stopped immediately.
   */
  private fun handleNotificationIntent() {
    try {
      val isAccepted = intent?.getBooleanExtra("accepted", false) ?: false
      val orderId = intent?.getStringExtra("orderId") ?: ""
      if (isAccepted) {
        OrderRingtoneManager.stopRinging()
        if (orderId.isNotBlank()) {
          OrderPollingService.markOrderAccepted(this, orderId)
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(1002)
        intent?.removeExtra("accepted")
        intent?.removeExtra("orderId")
        return
      }

      val orderJson = intent?.getStringExtra("orderJson")
      if (!orderJson.isNullOrBlank()) {
        intent?.removeExtra("orderJson")
        intent?.removeExtra("orderId")
        intent?.removeExtra("openOrder")

        // If this order is already in acceptedOrderIds, stop ringing immediately and do not re-emit
        OrderPollingService.loadHandledOrders(this)
        var isAlreadyHandled = false
        try {
          val obj = org.json.JSONObject(orderJson)
          val id = obj.optString("_id", obj.optString("orderId", ""))
          val humanId = obj.optString("orderId", "")
          val mongoId = obj.optString("_id", "")
          if (OrderPollingService.acceptedOrderIds.contains(id) ||
              (humanId.isNotBlank() && OrderPollingService.acceptedOrderIds.contains(humanId)) ||
              (mongoId.isNotBlank() && OrderPollingService.acceptedOrderIds.contains(mongoId))) {
            isAlreadyHandled = true
          }
        } catch (_: Exception) {}

        if (isAlreadyHandled) {
          OrderRingtoneManager.stopRinging()
          val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
          manager?.cancel(1002)
          return
        }

        BackgroundPollingModule.pendingOrderJson = orderJson
        BackgroundPollingModule.emitOrderEvent("onNewPendingOrder", orderJson)

        // Clear notification banner from shade once app is opened to inspect the order
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        manager?.cancel(1002) // OrderPollingService.ORDER_ALERT_NOTIFICATION_ID
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
