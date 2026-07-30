package expo.modules.qwen3tts

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoQwen3TtsModule : Module() {
    companion object {
        private var nativeLoaded = false

        init {
            try {
                System.loadLibrary("qwen3tts_jni")
                nativeLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                android.util.Log.w("ExpoQwen3Tts", "Failed to load qwen3tts library: ${e.message}")
                nativeLoaded = false
            }
        }
    }

    // Native methods bridged to C++ via JNI
    private external fun nativeInitModel(modelDir: String): Boolean
    private external fun nativeSynthesize(text: String): FloatArray?
    private external fun nativeCloneVoice(text: String, referencePath: String): FloatArray?
    private external fun nativeReleaseModel()
    private external fun nativeIsModelReady(): Boolean
    private external fun nativeGetSampleRate(): Int

    private fun writeWavFile(samples: FloatArray, sampleRate: Int, cacheDir: java.io.File?): String {
        val pcmData = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            var s = (samples[i] * 32767.0f).toInt()
            if (s > 32767) s = 32767
            if (s < -32768) s = -32768
            pcmData[i * 2] = (s and 0xFF).toByte()
            pcmData[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
        }

        val numChannels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * numChannels * bitsPerSample / 8
        val blockAlign = numChannels * bitsPerSample / 8
        val dataSize = pcmData.size
        val chunkSize = 36 + dataSize

        val header = java.nio.ByteBuffer.allocate(44)
        header.order(java.nio.ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray())
        header.putInt(chunkSize)
        header.put("WAVE".toByteArray())
        header.put("fmt ".toByteArray())
        header.putInt(16)
        header.putShort(1)
        header.putShort(numChannels.toShort())
        header.putInt(sampleRate)
        header.putInt(byteRate)
        header.putShort(blockAlign.toShort())
        header.putShort(bitsPerSample.toShort())
        header.put("data".toByteArray())
        header.putInt(dataSize)

        val file = java.io.File.createTempFile("synth_", ".wav", cacheDir)
        java.io.FileOutputStream(file).use { out ->
            out.write(header.array())
            out.write(pcmData)
        }
        return file.absolutePath
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoQwen3Tts")

        AsyncFunction("initModel") { modelDir: String ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            nativeInitModel(modelDir)
        }

        AsyncFunction("synthesize") { text: String ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            val samples = nativeSynthesize(text)
                ?: throw RuntimeException("Synthesis failed")
            val sampleRate = nativeGetSampleRate()
            val cacheDir = appContext.reactContext?.cacheDir
            val path = writeWavFile(samples, sampleRate, cacheDir)

            mapOf(
                "audioUri" to "file://$path",
                "sampleRate" to sampleRate,
                "duration" to (samples.size.toDouble() / sampleRate),
                "frameCount" to (samples.size / 16),
                "text" to text
            )
        }

        AsyncFunction("cloneVoice") { text: String, referencePath: String ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            
            val actualRefPath = if (referencePath.startsWith("file://")) {
                referencePath.substring(7)
            } else {
                referencePath
            }

            val samples = nativeCloneVoice(text, actualRefPath)
                ?: throw RuntimeException("Voice cloning failed")
            val sampleRate = nativeGetSampleRate()
            val cacheDir = appContext.reactContext?.cacheDir
            val path = writeWavFile(samples, sampleRate, cacheDir)

            mapOf(
                "audioUri" to "file://$path",
                "sampleRate" to sampleRate,
                "duration" to (samples.size.toDouble() / sampleRate),
                "frameCount" to (samples.size / 16),
                "text" to text
            )
        }

        AsyncFunction("releaseModel") {
            nativeReleaseModel()
        }

        AsyncFunction("isModelReady") {
            nativeLoaded && nativeIsModelReady()
        }

        AsyncFunction("getSampleRate") {
            if (nativeLoaded) nativeGetSampleRate() else 24000
        }
    }
}
