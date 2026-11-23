package com.kweecko.agentapp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Dedicated Front-Camera-Only Selfie Capture Activity.
 * Strictly locks capture to the device front camera with NO back camera or switch option.
 */
class FrontSelfieActivity : AppCompatActivity() {

    private val TAG = "FrontSelfieActivity"
    private var imageCapture: ImageCapture? = null
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var previewView: PreviewView
    private lateinit var captureButton: View
    private lateinit var progressBar: ProgressBar
    private var isCapturing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make full screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.hide(WindowInsets.Type.statusBars())
        } else {
            @Suppress("DEPRECATION")
            window.setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
            )
        }

        cameraExecutor = Executors.newSingleThreadExecutor()

        // Build UI programmatically
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

        // 2. Custom face oval frame overlay
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

        // Top Row: Cancel Button & Title
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

        // Guidance banner
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

        // Shutter Button (Outer ring + Inner white circle)
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

        setContentView(rootLayout)

        startFrontCamera()
    }

    private fun startFrontCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setTargetRotation(previewView.display?.rotation ?: windowManager.defaultDisplay.rotation)
                    .build()

                // EXCLUSIVELY select FRONT camera (no back camera option permitted)
                val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    this,
                    cameraSelector,
                    preview,
                    imageCapture
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start front camera: ${e.message}", e)
                Toast.makeText(
                    this,
                    "Could not access front camera: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                setResult(Activity.RESULT_CANCELED)
                finish()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun takePhoto() {
        val imageCapture = this.imageCapture ?: return
        isCapturing = true
        captureButton.isEnabled = false
        captureButton.alpha = 0.5f
        progressBar.visibility = View.VISIBLE

        val photoFile = File(cacheDir, "selfie_front_${System.currentTimeMillis()}.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

        imageCapture.takePicture(
            outputOptions,
            cameraExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    try {
                        val bytes = photoFile.readBytes()
                        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                        val dataUri = "data:image/jpeg;base64,$base64"

                        val resultIntent = Intent().apply {
                            putExtra("uri", Uri.fromFile(photoFile).toString())
                            putExtra("fileName", "selfie.jpg")
                            putExtra("type", "image/jpeg")
                            putExtra("base64", base64)
                            putExtra("dataUri", dataUri)
                            putExtra("fileSize", photoFile.length())
                        }
                        runOnUiThread {
                            setResult(Activity.RESULT_OK, resultIntent)
                            finish()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error encoding captured selfie: ${e.message}", e)
                        runOnUiThread {
                            Toast.makeText(
                                this@FrontSelfieActivity,
                                "Failed to process photo: ${e.message}",
                                Toast.LENGTH_SHORT
                            ).show()
                            isCapturing = false
                            captureButton.isEnabled = true
                            captureButton.alpha = 1.0f
                            progressBar.visibility = View.GONE
                        }
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
        cameraExecutor.shutdown()
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
     */
    inner class FaceOverlayView(context: Context) : View(context) {
        private val maskPaint = Paint().apply {
            color = Color.parseColor("#99000000") // 60% black outside the oval
            style = Paint.Style.FILL
        }
        private val strokePaint = Paint().apply {
            color = Color.parseColor("#4D44E3") // Brand primary color border
            style = Paint.Style.STROKE
            strokeWidth = 6f
            isAntiAlias = true
        }
        private val clearPaint = Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
            isAntiAlias = true
        }

        init {
            // Enable hardware acceleration layer for PorterDuff mode
            setLayerType(LAYER_TYPE_HARDWARE, null)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)

            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), maskPaint)

            // Oval dimensions for human face fitting
            val ovalWidth = width * 0.72f
            val ovalHeight = ovalWidth * 1.35f
            val left = (width - ovalWidth) / 2f
            val top = (height - ovalHeight) / 2.3f
            val ovalRect = RectF(left, top, left + ovalWidth, top + ovalHeight)

            // Transparent hole for user face
            canvas.drawOval(ovalRect, clearPaint)
            // Clean guide border
            canvas.drawOval(ovalRect, strokePaint)
        }
    }
}
