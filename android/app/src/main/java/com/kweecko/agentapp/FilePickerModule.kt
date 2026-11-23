package com.kweecko.agentapp

import android.app.Activity
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class FilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pickerPromise: Promise? = null
    private var selfiePromise: Promise? = null
    private val PICK_FILE_REQUEST = 41238
    private val FRONT_SELFIE_REQUEST = 41239

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "FilePickerModule"

    @ReactMethod
    fun captureFrontSelfie(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("ACTIVITY_NOT_FOUND", "Activity doesn't exist")
            return
        }

        selfiePromise = promise
        try {
            val intent = Intent(activity, FrontSelfieActivity::class.java)
            activity.startActivityForResult(intent, FRONT_SELFIE_REQUEST)
        } catch (e: Exception) {
            selfiePromise?.reject("CAMERA_ERROR", "Failed to launch front selfie camera: ${e.message}")
            selfiePromise = null
        }
    }

    @ReactMethod
    fun pickFile(mimeType: String?, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("ACTIVITY_NOT_FOUND", "Activity doesn't exist")
            return
        }

        pickerPromise = promise

        try {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = if (!mimeType.isNullOrBlank()) mimeType else "*/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            activity.startActivityForResult(
                Intent.createChooser(intent, "Select Document or File"),
                PICK_FILE_REQUEST
            )
        } catch (e: Exception) {
            pickerPromise?.reject("PICKER_ERROR", e.message)
            pickerPromise = null
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode == FRONT_SELFIE_REQUEST) {
            if (resultCode != Activity.RESULT_OK || data == null) {
                selfiePromise?.resolve(null)
                selfiePromise = null
                return
            }

            try {
                val uriStr = data.getStringExtra("uri") ?: ""
                val base64 = data.getStringExtra("base64") ?: ""
                val dataUri = data.getStringExtra("dataUri") ?: ""
                val fileName = data.getStringExtra("fileName") ?: "selfie.jpg"
                val mimeType = data.getStringExtra("type") ?: "image/jpeg"
                val fileSize = data.getLongExtra("fileSize", 0L)

                val result = Arguments.createMap().apply {
                    putString("uri", uriStr)
                    putString("fileName", fileName)
                    putString("type", mimeType)
                    putDouble("size", fileSize.toDouble())
                    if (base64.isNotEmpty()) {
                        putString("base64", base64)
                        putString("dataUri", dataUri)
                    }
                }
                selfiePromise?.resolve(result)
            } catch (e: Exception) {
                selfiePromise?.reject("CAPTURE_PARSE_ERROR", e.message)
            } finally {
                selfiePromise = null
            }
            return
        }

        if (requestCode != PICK_FILE_REQUEST) return

        if (resultCode != Activity.RESULT_OK || data == null || data.data == null) {
            pickerPromise?.resolve(null)
            pickerPromise = null
            return
        }

        val uri: Uri = data.data!!
        try {
            var fileName = "document"
            var fileSize = 0L

            reactContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIndex != -1) fileName = cursor.getString(nameIndex)
                    if (sizeIndex != -1) fileSize = cursor.getLong(sizeIndex)
                }
            }

            val mimeType = reactContext.contentResolver.getType(uri) ?: "application/octet-stream"
            val inputStream: InputStream? = reactContext.contentResolver.openInputStream(uri)
            val bytes = inputStream?.readBytes()
            inputStream?.close()

            val base64 = if (bytes != null) Base64.encodeToString(bytes, Base64.NO_WRAP) else null

            val result = Arguments.createMap().apply {
                putString("uri", uri.toString())
                putString("fileName", fileName)
                putString("type", mimeType)
                putDouble("size", fileSize.toDouble())
                if (base64 != null) {
                    putString("base64", base64)
                    putString("dataUri", "data:$mimeType;base64,$base64")
                }
            }

            pickerPromise?.resolve(result)
        } catch (e: Exception) {
            pickerPromise?.reject("READ_ERROR", "Failed to read file: ${e.message}")
        } finally {
            pickerPromise = null
        }
    }

    @ReactMethod
    fun generateMonthlyOrdersPdf(
        monthTitle: String,
        ordersJson: String,
        partnerName: String?,
        partnerPhone: String?,
        promise: Promise
    ) {
        try {
            val orders = try {
                JSONArray(ordersJson)
            } catch (_: Exception) {
                JSONArray()
            }

            val doc = PdfDocument()
            val pageWidth = 595
            val pageHeight = 842

            var pageNumber = 1
            var pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
            var page = doc.startPage(pageInfo)
            var canvas: Canvas = page.canvas

            val paint = Paint()

            // Header Background Bar
            paint.color = Color.parseColor("#4f46e5")
            paint.style = Paint.Style.FILL
            canvas.drawRect(0f, 0f, pageWidth.toFloat(), 72f, paint)

            // Header Title
            paint.color = Color.WHITE
            paint.textSize = 17f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            canvas.drawText("KWIQO PARTNER DISPATCH STATEMENT", 24f, 34f, paint)

            // Header Subtitle
            paint.textSize = 11f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            canvas.drawText("Statement Period: $monthTitle  •  GST Ready", 24f, 54f, paint)

            // Partner Info Card
            paint.color = Color.parseColor("#f8fafc")
            paint.style = Paint.Style.FILL
            canvas.drawRoundRect(RectF(24f, 84f, (pageWidth - 24).toFloat(), 132f), 8f, 8f, paint)
            paint.color = Color.parseColor("#e2e8f0")
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1f
            canvas.drawRoundRect(RectF(24f, 84f, (pageWidth - 24).toFloat(), 132f), 8f, 8f, paint)

            paint.style = Paint.Style.FILL
            paint.color = Color.parseColor("#1e293b")
            paint.textSize = 10f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val pName = if (!partnerName.isNullOrBlank()) partnerName else "Kwiqo Field Partner"
            canvas.drawText("Partner: $pName", 36f, 104f, paint)

            paint.color = Color.parseColor("#64748b")
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            val pPhone = if (!partnerPhone.isNullOrBlank()) partnerPhone else "Registered Mobile"
            canvas.drawText("Mobile: $pPhone", 36f, 120f, paint)

            val nowStr = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(Date())
            canvas.drawText("Generated: $nowStr", 340f, 104f, paint)
            canvas.drawText("Total Tasks: ${orders.length()}", 340f, 120f, paint)

            // Financial Summary Block
            var totalPayout = 0.0
            var completedCount = 0
            for (i in 0 until orders.length()) {
                val o = orders.optJSONObject(i) ?: continue
                val st = o.optString("status", "")
                if (st.equals("Done", ignoreCase = true) || st.equals("Completed", ignoreCase = true)) {
                    completedCount++
                }
                val p = o.optJSONObject("agentPayment")?.optDouble("amount")
                    ?: (o.optDouble("totalPrice", 0.0) * 0.85)
                totalPayout += p
            }

            paint.color = Color.parseColor("#ecfdf5")
            canvas.drawRoundRect(RectF(24f, 142f, (pageWidth - 24).toFloat(), 182f), 8f, 8f, paint)
            paint.color = Color.parseColor("#a7f3d0")
            paint.style = Paint.Style.STROKE
            canvas.drawRoundRect(RectF(24f, 142f, (pageWidth - 24).toFloat(), 182f), 8f, 8f, paint)

            paint.style = Paint.Style.FILL
            paint.color = Color.parseColor("#065f46")
            paint.textSize = 11f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            canvas.drawText("Total Orders: ${orders.length()}   |   Completed: $completedCount   |   Estimated Net Earnings: ₹${Math.round(totalPayout)}", 36f, 166f, paint)

            // Table Header Bar
            var currentY = 205f
            paint.color = Color.parseColor("#f1f5f9")
            paint.style = Paint.Style.FILL
            canvas.drawRect(24f, currentY, (pageWidth - 24).toFloat(), currentY + 22f, paint)

            paint.color = Color.parseColor("#334155")
            paint.textSize = 9.5f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            canvas.drawText("DATE", 28f, currentY + 15f, paint)
            canvas.drawText("ORDER ID", 90f, currentY + 15f, paint)
            canvas.drawText("SERVICE / TASK", 185f, currentY + 15f, paint)
            canvas.drawText("SOCIETY", 330f, currentY + 15f, paint)
            canvas.drawText("STATUS", 445f, currentY + 15f, paint)
            canvas.drawText("PAYOUT", 515f, currentY + 15f, paint)

            currentY += 24f

            // Table Rows
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            for (i in 0 until orders.length()) {
                if (currentY > pageHeight - 50) {
                    // New page required
                    doc.finishPage(page)
                    pageNumber++
                    pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
                    page = doc.startPage(pageInfo)
                    canvas = page.canvas

                    // Mini Header on subsequent pages
                    paint.color = Color.parseColor("#4f46e5")
                    paint.style = Paint.Style.FILL
                    canvas.drawRect(0f, 0f, pageWidth.toFloat(), 36f, paint)
                    paint.color = Color.WHITE
                    paint.textSize = 11f
                    paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    canvas.drawText("KWIQO STATEMENT • $monthTitle (Page $pageNumber)", 24f, 22f, paint)

                    currentY = 56f
                    // Repeat table header
                    paint.color = Color.parseColor("#f1f5f9")
                    paint.style = Paint.Style.FILL
                    canvas.drawRect(24f, currentY, (pageWidth - 24).toFloat(), currentY + 20f, paint)
                    paint.color = Color.parseColor("#334155")
                    paint.textSize = 9.5f
                    canvas.drawText("DATE", 28f, currentY + 14f, paint)
                    canvas.drawText("ORDER ID", 90f, currentY + 14f, paint)
                    canvas.drawText("SERVICE / TASK", 185f, currentY + 14f, paint)
                    canvas.drawText("SOCIETY", 330f, currentY + 14f, paint)
                    canvas.drawText("STATUS", 445f, currentY + 14f, paint)
                    canvas.drawText("PAYOUT", 515f, currentY + 14f, paint)
                    currentY += 24f
                    paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
                }

                val o = orders.optJSONObject(i) ?: continue

                // Alternating row background
                if (i % 2 == 1) {
                    paint.color = Color.parseColor("#f8fafc")
                    paint.style = Paint.Style.FILL
                    canvas.drawRect(24f, currentY - 3f, (pageWidth - 24).toFloat(), currentY + 17f, paint)
                }

                // Date
                val dStr = o.optString("scheduledDate", o.optString("createdAt", ""))
                val simpleDate = if (dStr.length >= 10) dStr.substring(0, 10) else dStr
                paint.color = Color.parseColor("#475569")
                paint.textSize = 8.5f
                canvas.drawText(simpleDate.take(10), 28f, currentY + 11f, paint)

                // Order ID
                val oid = o.optString("orderId", o.optString("_id", "")).takeLast(12)
                paint.color = Color.parseColor("#1e293b")
                paint.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
                canvas.drawText(oid, 90f, currentY + 11f, paint)
                paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)

                // Task Title
                val title = o.optString("taskTitle", "Task").take(24)
                paint.color = Color.parseColor("#0f172a")
                canvas.drawText(title, 185f, currentY + 11f, paint)

                // Society / Area
                val locObj = o.optJSONObject("location")
                val soc = (locObj?.optString("cluster") ?: locObj?.optString("city") ?: "Site").take(18)
                paint.color = Color.parseColor("#64748b")
                canvas.drawText(soc, 330f, currentY + 11f, paint)

                // Status
                val status = o.optString("status", "Done")
                if (status.equals("Done", ignoreCase = true) || status.equals("Completed", ignoreCase = true)) {
                    paint.color = Color.parseColor("#059669")
                } else if (status.equals("Canceled", ignoreCase = true) || status.equals("Cancelled", ignoreCase = true)) {
                    paint.color = Color.parseColor("#e11d48")
                } else {
                    paint.color = Color.parseColor("#2563eb")
                }
                canvas.drawText(status, 445f, currentY + 11f, paint)

                // Payout
                val payoutVal = o.optJSONObject("agentPayment")?.optDouble("amount")
                    ?: (o.optDouble("totalPrice", 0.0) * 0.85)
                paint.color = Color.parseColor("#0f172a")
                canvas.drawText("₹${Math.round(payoutVal)}", 515f, currentY + 11f, paint)

                // Row bottom separator line
                paint.color = Color.parseColor("#f1f5f9")
                paint.strokeWidth = 0.5f
                paint.style = Paint.Style.STROKE
                canvas.drawLine(24f, currentY + 17f, (pageWidth - 24).toFloat(), currentY + 17f, paint)
                paint.style = Paint.Style.FILL

                currentY += 20f
            }

            // Footer
            paint.color = Color.parseColor("#94a3b8")
            paint.textSize = 8f
            canvas.drawText("Kwiqo Agent Services • GST Registered Dispatch Network • Page $pageNumber", 24f, pageHeight - 20f, paint)

            doc.finishPage(page)

            // Save PDF to Downloads folder
            val safeMonth = monthTitle.replace("[^a-zA-Z0-9_]".toRegex(), "_")
            val fileName = "Kwiqo_Orders_${safeMonth}.pdf"

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            var targetFile = File(downloadsDir, fileName)

            try {
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs()
                }
                val fos = FileOutputStream(targetFile)
                doc.writeTo(fos)
                fos.close()
            } catch (_: Exception) {
                // Fallback to app external files dir
                val fallbackDir = reactContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: reactContext.filesDir
                targetFile = File(fallbackDir, fileName)
                val fos = FileOutputStream(targetFile)
                doc.writeTo(fos)
                fos.close()
            } finally {
                doc.close()
            }

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("filePath", targetFile.absolutePath)
                putString("fileName", targetFile.name)
                putInt("orderCount", orders.length())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PDF_ERROR", "Failed generating PDF: ${e.message}", e)
        }
    }

    override fun onNewIntent(intent: Intent) {}
}
