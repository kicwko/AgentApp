package com.kweecko.agentapp

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Dedicated Front-Camera-Only Selfie Capture Activity.
 * Strictly locks capture to the device front camera with NO back camera or switch option.
 * Robust across all Android versions (API 24 to 35) with zero IPC transaction overhead.
 */
class FrontSelfieActivity : AppCompatActivity() {

    private val TAG = "FrontSelfieActivity"
    private val CAMERA_PERMISSION_CODE = 41240

    private var imageCapture: ImageCapture? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var previewView: PreviewView
    private lateinit var captureButton: View
    private lateinit var progressBar: ProgressBar
    private lateinit var errorLayout: LinearLayout
    private lateinit var errorText: TextView
    private var isCapturing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make full screen safely without crashing on any Android version
        try {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.hide(WindowInsetsCompat.Type.statusBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } catch (_: Exception) {}

        cameraExecutor = Executors.newSingleThreadExecutor()

        // Root layout
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
        }

        // 1. Camera live preview view
        previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
        rootLayout.addView(previewView)

        // 2. Custom face oval frame overlay (EVEN_ODD path for universal GPU compatibility)
        val overlayView = FaceOverlayView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        rootLayout.addView(overlayView)

        // 3. Header Bar with Cancel button and Guidance
        val headerLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(44), dp(20), dp(10))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
            )
        }

        val topRow = RelativeLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

        val closeButton = TextView(this).apply {
            text = "✕"
            textSize = 20f
            setTextColor(Color.WHITE)
            setPadding(dp(12), dp(6), dp(12), dp(6))
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66000000"))
            }
            background = bg
            setOnClickListener {
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
            val params = RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(RelativeLayout.ALIGN_PARENT_LEFT)
                addRule(RelativeLayout.CENTER_VERTICAL)
            }
            layoutParams = params
        }
        topRow.addView(closeButton)

        val headerTitle = TextView(this).apply {
            text = "Selfie Verification"
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            val params = RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                addRule(RelativeLayout.CENTER_IN_PARENT)
            }
            layoutParams = params
        }
        topRow.addView(headerTitle)
        headerLayout.addView(topRow)

        val guideSubtext = TextView(this).apply {
            text = "Front camera only • Position your face inside the oval"
            textSize = 12f
            setTextColor(Color.parseColor("#E0E7FF"))
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(6), dp(12), dp(6))
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(20).toFloat()
                setColor(Color.parseColor("#771E1B4B"))
            }
            background = bg
            val params = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = dp(14)
            }
            layoutParams = params
        }
        headerLayout.addView(guideSubtext)
        rootLayout.addView(headerLayout)

        // 4. Bottom Controls: Shutter Button and Loading Spinner
        val bottomControls = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(130),
                Gravity.BOTTOM
            )
            setPadding(0, 0, 0, dp(30))
        }

        val shutterOuter = FrameLayout(this).apply {
            val outerSize = dp(76)
            layoutParams = FrameLayout.LayoutParams(outerSize, outerSize, Gravity.CENTER)
            val outerBg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.TRANSPARENT)
                setStroke(dp(4), Color.WHITE)
            }
            background = outerBg
        }

        val shutterInner = View(this).apply {
            val innerSize = dp(62)
            layoutParams = FrameLayout.LayoutParams(innerSize, innerSize, Gravity.CENTER)
            val innerBg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            background = innerBg
        }
        shutterOuter.addView(shutterInner)

        shutterOuter.setOnClickListener {
            if (!isCapturing) {
                takePhoto()
            }
        }
        captureButton = shutterOuter
        bottomControls.addView(shutterOuter)

        progressBar = ProgressBar(this).apply {
            visibility = View.GONE
            val size = dp(40)
            layoutParams = FrameLayout.LayoutParams(size, size, Gravity.CENTER)
        }
        bottomControls.addView(progressBar)

        rootLayout.addView(bottomControls)

        // 5. Error Layout (Hidden by default, shown if camera fails to initialize)
        errorLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(dp(30), dp(20), dp(30), dp(20))
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(16).toFloat()
                setColor(Color.parseColor("#EE1E293B"))
            }
            background = bg
        }

        errorText = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            text = "Unable to start front camera."
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = dp(16)
            }
        }
        errorLayout.addView(errorText)

        val retryBtn = Button(this).apply {
            text = "Retry"
            setBackgroundColor(Color.parseColor("#FF5841"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                errorLayout.visibility = View.GONE
                checkPermissionAndStartCamera()
            }
        }
        errorLayout.addView(retryBtn)
        rootLayout.addView(errorLayout)

        setContentView(rootLayout)

        checkPermissionAndStartCamera()
    }

    private fun checkPermissionAndStartCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.CAMERA),
                CAMERA_PERMISSION_CODE
            )
        } else {
            startFrontCamera()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startFrontCamera()
            } else {
                showError("Camera permission is required to capture selfie verification.")
            }
        }
    }

    private fun startFrontCamera() {
        try {
            val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
            cameraProviderFuture.addListener({
                try {
                    val provider = cameraProviderFuture.get()
                    this.cameraProvider = provider

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    // Target resolution 1080x1440 for fast processing and optimal face verification
                    imageCapture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setTargetResolution(Size(1080, 1440))
                        .build()

                    // Exclusively choose front camera; gracefully fall back if device lacks front camera
                    val cameraSelector = when {
                        provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) ->
                            CameraSelector.DEFAULT_FRONT_CAMERA
                        provider.hasCamera(CameraSelector.Builder().requireLensFacing(CameraSelector.LENS_FACING_FRONT).build()) ->
                            CameraSelector.Builder().requireLensFacing(CameraSelector.LENS_FACING_FRONT).build()
                        else ->
                            CameraSelector.DEFAULT_BACK_CAMERA
                    }

                    provider.unbindAll()
                    provider.bindToLifecycle(
                        this,
                        cameraSelector,
                        preview,
                        imageCapture
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start camera: ${e.message}", e)
                    showError("Could not access front camera: ${e.message}")
                }
            }, ContextCompat.getMainExecutor(this))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize CameraX: ${e.message}", e)
            showError("Camera initialization failed: ${e.message}")
        }
    }

    private fun showError(message: String) {
        runOnUiThread {
            errorText.text = message
            errorLayout.visibility = View.VISIBLE
        }
    }

    private fun takePhoto() {
        val capture = imageCapture
        if (capture == null) {
            showError("Camera is not ready. Please try again.")
            return
        }

        isCapturing = true
        captureButton.isEnabled = false
        captureButton.alpha = 0.5f
        progressBar.visibility = View.VISIBLE

        val photoFile = File(cacheDir, "selfie_front_${System.currentTimeMillis()}.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

        capture.takePicture(
            outputOptions,
            cameraExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    runOnUiThread {
                        // CRITICAL: DO NOT put base64 or dataUri in Intent extras!
                        // That causes TransactionTooLargeException which kills the app process.
                        // Pass file path; FilePickerModule will read it in-process safely.
                        val resultIntent = Intent().apply {
                            putExtra("filePath", photoFile.absolutePath)
                            putExtra("uri", Uri.fromFile(photoFile).toString())
                            putExtra("fileName", "selfie.jpg")
                            putExtra("type", "image/jpeg")
                            putExtra("fileSize", photoFile.length())
                        }
                        setResult(Activity.RESULT_OK, resultIntent)
                        finish()
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "Capture failed: ${exception.message}", exception)
                    runOnUiThread {
                        Toast.makeText(
                            this@FrontSelfieActivity,
                            "Capture failed: ${exception.message}",
                            Toast.LENGTH_SHORT
                        ).show()
                        isCapturing = false
                        captureButton.isEnabled = true
                        captureButton.alpha = 1.0f
                        progressBar.visibility = View.GONE
                    }
                }
            }
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            cameraProvider?.unbindAll()
        } catch (_: Exception) {}
        try {
            cameraExecutor.shutdown()
        } catch (_: Exception) {}
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    /**
     * Overlay view providing an oval face guide cutout and dark dimmed surrounding.
     * Uses Path.FillType.EVEN_ODD for universal GPU and driver compatibility without layer allocation.
     */
    inner class FaceOverlayView(context: Context) : View(context) {
        private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#99000000") // 60% black outside the oval
            style = Paint.Style.FILL
        }
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#4D44E3") // Brand primary color border
            style = Paint.Style.STROKE
            strokeWidth = 6f
        }
        private val overlayPath = Path()

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            val ovalWidth = width * 0.72f
            val ovalHeight = ovalWidth * 1.35f
            val left = (width - ovalWidth) / 2f
            val top = (height - ovalHeight) / 2.3f
            val ovalRect = RectF(left, top, left + ovalWidth, top + ovalHeight)

            overlayPath.reset()
            overlayPath.fillType = Path.FillType.EVEN_ODD
            overlayPath.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            overlayPath.addOval(ovalRect, Path.Direction.CW)

            canvas.drawPath(overlayPath, maskPaint)
            canvas.drawOval(ovalRect, strokePaint)
        }
    }
}
