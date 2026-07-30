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
    private external fun nativeInitModel(modelDir: String, modelPath: String, codecPath: String, engine: String): Boolean
    private external fun nativeSynthesize(text: String, lang: String, instruct: String, steps: Int, outPath: String): Int
    private external fun nativeCloneVoice(text: String, lang: String, refPath: String, refText: String, steps: Int, outPath: String): Int
    private external fun nativeReleaseModel()
    private external fun nativeIsModelReady(): Boolean
    private external fun nativeGetSampleRate(): Int
    private external fun nativeGetLastError(): String

    private fun cleanupOldAudioFiles() {
        val cacheDir = appContext.reactContext?.cacheDir ?: return
        val files = cacheDir.listFiles { _, name ->
            name.startsWith("synth_") || name.startsWith("clone_") || name.startsWith("ref_")
        }
        if (files != null) {
            val now = System.currentTimeMillis()
            // Delete files older than 1 hour (3600000 ms)
            for (file in files) {
                if (now - file.lastModified() > 3600000) {
                    file.delete()
                }
            }
        }
    }

    /**
     * Convert whatever the user picked into the 24 kHz mono WAV the engines
     * need. Already-converted references (our own ref_*.wav) pass straight
     * through so re-cloning the same clip does not decode it twice.
     */
    private fun resolveReference(sourceUri: String): java.io.File {
        val context = appContext.reactContext
            ?: throw IllegalStateException("No Android context available")
        val cacheDir = context.cacheDir

        val plainPath = if (sourceUri.startsWith("file://")) sourceUri.substring(7) else sourceUri
        val existing = java.io.File(plainPath)
        if (existing.parentFile == cacheDir && existing.name.startsWith("ref_") && existing.exists()) {
            return existing
        }

        val outFile = java.io.File.createTempFile("ref_", ".wav", cacheDir)
        try {
            return AudioConverter.toReferenceWav(context, sourceUri, outFile)
        } catch (e: Exception) {
            outFile.delete()   // createTempFile already made it; don't leave an empty stub
            throw e
        }
    }
    override fun definition() = ModuleDefinition {
        Name("ExpoQwen3Tts")

        // `engine` is "omnivoice" or "qwen3". It comes from the model catalog
        // rather than being sniffed from the files: an OmniVoice loader handed a
        // Qwen3 checkpoint fails deep inside pipeline_tts_load with an opaque error.
        AsyncFunction("initModel") { modelDir: String, engine: String ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            val actualDir = if (modelDir.startsWith("file://")) modelDir.substring(7) else modelDir
            val dir = java.io.File(actualDir)
            if (!dir.exists() || !dir.isDirectory) throw IllegalArgumentException("modelDir must be a directory (got $actualDir)")

            val files = dir.listFiles { _, name -> name.endsWith(".gguf") }
            if (files == null || files.isEmpty()) throw IllegalArgumentException("No .gguf files found in $actualDir")

            var modelPath = ""
            var codecPath = ""

            for (file in files) {
                val lower = file.name.lowercase()
                if (lower.contains("tokenizer") || lower.contains("codec")) {
                    codecPath = file.absolutePath
                } else {
                    modelPath = file.absolutePath
                }
            }

            if (modelPath.isEmpty() && files.isNotEmpty()) modelPath = files[0].absolutePath
            if (codecPath.isEmpty() && files.size >= 2) codecPath = files[1].absolutePath

            if (engine != "qwen3" && codecPath.isEmpty()) {
                throw IllegalArgumentException(
                    "OmniVoice needs both a base and a tokenizer .gguf in $actualDir " +
                    "(found ${files.size}: ${files.joinToString { it.name }})")
            }

            if (!nativeInitModel(actualDir, modelPath, codecPath, engine)) {
                throw RuntimeException("Init failed: " + nativeGetLastError())
            }
        }

        AsyncFunction("synthesize") { text: String, lang: String, instruct: String, steps: Int ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            cleanupOldAudioFiles()
            val cacheDir = appContext.reactContext?.cacheDir
            val outFile = java.io.File.createTempFile("synth_", ".wav", cacheDir)
            val outPath = outFile.absolutePath

            val numSamples = nativeSynthesize(text, lang, instruct, steps, outPath)
            if (numSamples < 0) {
                throw RuntimeException("Synthesis failed: " + nativeGetLastError())
            }
            
            val sampleRate = nativeGetSampleRate()
            
            mapOf(
                "audioUri" to "file://$outPath",
                "sampleRate" to sampleRate,
                "duration" to (numSamples.toDouble() / sampleRate),
                "frameCount" to numSamples,
                "text" to text
            )
        }

        // Decode any audio or video the user picked into a 24 kHz mono WAV.
        // Exposed separately so the UI can show the conversion and the clip
        // duration before asking for a synthesis.
        AsyncFunction("prepareReference") { sourceUri: String ->
            cleanupOldAudioFiles()
            val wav = resolveReference(sourceUri)
            val samples = ((wav.length() - 44).coerceAtLeast(0)) / 2
            mapOf(
                "uri" to "file://${wav.absolutePath}",
                "sampleRate" to AudioConverter.TARGET_SAMPLE_RATE,
                "duration" to (samples.toDouble() / AudioConverter.TARGET_SAMPLE_RATE)
            )
        }

        AsyncFunction("cloneVoice") { text: String, lang: String, refText: String, referencePath: String, steps: Int ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            cleanupOldAudioFiles()
            val cacheDir = appContext.reactContext?.cacheDir
            val outFile = java.io.File.createTempFile("clone_", ".wav", cacheDir)
            val outPath = outFile.absolutePath

            // Converts on the spot when the caller hands over a raw mp3/m4a/mp4.
            val actualRefPath = resolveReference(referencePath).absolutePath

            val numSamples = nativeCloneVoice(text, lang, actualRefPath, refText, steps, outPath)
            if (numSamples < 0) {
                throw RuntimeException("Voice cloning failed: " + nativeGetLastError())
            }
            
            val sampleRate = nativeGetSampleRate()

            mapOf(
                "audioUri" to "file://$outPath",
                "sampleRate" to sampleRate,
                "duration" to (numSamples.toDouble() / sampleRate),
                "frameCount" to numSamples,
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
