package com.kweecko.agentapp

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
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window?.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    applyLightSystemBars()
  }

  override fun onResume() {
    super.onResume()
    applyLightSystemBars()
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
