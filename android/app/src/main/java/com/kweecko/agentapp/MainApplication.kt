package com.kweecko.agentapp

import android.app.Application
import android.content.Context
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(FilePickerPackage())
          add(OrderPollingPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)

    // Ensure background polling continues even if app process is started without UI
    try {
      val prefs = getSharedPreferences("KwiqoAgentPrefs", Context.MODE_PRIVATE)
      val phone = prefs.getString("phone", null)
      val onDuty = prefs.getBoolean("onDuty", true)
      if (!phone.isNullOrBlank() && onDuty) {
        OrderPollingReceiver.startOrResurrectService(this)
        OrderPollingReceiver.scheduleNextAlarm(this, 5L)
      }
    } catch (_: Exception) {}
  }
}
