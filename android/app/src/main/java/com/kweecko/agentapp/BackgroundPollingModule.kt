package com.kweecko.agentapp

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class BackgroundPollingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "BackgroundPollingModule"
        private var instance: BackgroundPollingModule? = null

        fun emitOrderEvent(eventName: String, jsonPayload: String) {
            val inst = instance ?: return
            try {
                if (inst.reactContext.hasActiveReactInstance()) {
                    inst.reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(eventName, jsonPayload)
                }
            } catch (e: Exception) {
                // Ignore if JS context not ready
            }
        }
    }

    init {
        instance = this
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun startBackgroundPolling(config: ReadableMap, promise: Promise) {
        try {
            val intent = Intent(reactContext, OrderPollingService::class.java).apply {
                action = OrderPollingService.ACTION_START_POLLING
                if (config.hasKey("phone")) putExtra("phone", config.getString("phone"))
                if (config.hasKey("userId")) putExtra("userId", config.getString("userId"))
                if (config.hasKey("token")) putExtra("token", config.getString("token"))
                if (config.hasKey("baseUrl")) putExtra("baseUrl", config.getString("baseUrl"))
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(reactContext, intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopBackgroundPolling(promise: Promise) {
        try {
            val intent = Intent(reactContext, OrderPollingService::class.java).apply {
                action = OrderPollingService.ACTION_STOP_POLLING
            }
            reactContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isPollingRunning(promise: Promise) {
        promise.resolve(OrderPollingService.isServiceRunning)
    }

    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        try {
            val locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (locationManager == null) {
                val fallback = Arguments.createMap().apply {
                    putDouble("latitude", 28.4595)
                    putDouble("longitude", 77.0266)
                    putDouble("accuracy", 20.0)
                }
                promise.resolve(fallback)
                return
            }

            val hasFine = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            val hasCoarse = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                promise.reject("PERMISSION_DENIED", "Location permissions are not granted.")
                return
            }

            var bestLocation: Location? = null
            if (hasFine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            }
            if (bestLocation == null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                bestLocation = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }

            if (bestLocation != null) {
                val map = Arguments.createMap().apply {
                    putDouble("latitude", bestLocation.latitude)
                    putDouble("longitude", bestLocation.longitude)
                    putDouble("accuracy", bestLocation.accuracy.toDouble())
                    putDouble("timestamp", bestLocation.time.toDouble())
                }
                promise.resolve(map)
            } else {
                // Request a fresh location fix
                requestFreshLocationFix(locationManager, promise)
            }
        } catch (e: Exception) {
            promise.reject("LOCATION_ERROR", e.message, e)
        }
    }

    private fun requestFreshLocationFix(locationManager: LocationManager, promise: Promise) {
        val mainHandler = Handler(Looper.getMainLooper())
        var resolved = false

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (!resolved) {
                    resolved = true
                    try {
                        locationManager.removeUpdates(this)
                    } catch (_: Exception) {}

                    val map = Arguments.createMap().apply {
                        putDouble("latitude", location.latitude)
                        putDouble("longitude", location.longitude)
                        putDouble("accuracy", location.accuracy.toDouble())
                        putDouble("timestamp", location.time.toDouble())
                    }
                    promise.resolve(map)
                }
            }

            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }

        try {
            val provider = when {
                locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }

            if (provider != null) {
                locationManager.requestSingleUpdate(provider, listener, Looper.getMainLooper())

                // 4-second timeout fallback
                mainHandler.postDelayed({
                    if (!resolved) {
                        resolved = true
                        try {
                            locationManager.removeUpdates(listener)
                        } catch (_: Exception) {}

                        val fallback = Arguments.createMap().apply {
                            putDouble("latitude", 28.4595)
                            putDouble("longitude", 77.0266)
                            putDouble("accuracy", 30.0)
                        }
                        promise.resolve(fallback)
                    }
                }, 4000)
            } else {
                val fallback = Arguments.createMap().apply {
                    putDouble("latitude", 28.4595)
                    putDouble("longitude", 77.0266)
                    putDouble("accuracy", 30.0)
                }
                promise.resolve(fallback)
            }
        } catch (e: Exception) {
            val fallback = Arguments.createMap().apply {
                putDouble("latitude", 28.4595)
                putDouble("longitude", 77.0266)
                putDouble("accuracy", 30.0)
            }
            promise.resolve(fallback)
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) {}

    @ReactMethod
    fun removeListeners(count: Int?) {}
}
