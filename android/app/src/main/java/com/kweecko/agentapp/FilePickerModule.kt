package com.kweecko.agentapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.*
import java.io.InputStream

class FilePickerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pickerPromise: Promise? = null
    private val PICK_FILE_REQUEST = 41238

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "FilePickerModule"

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

    override fun onNewIntent(intent: Intent) {}
}
