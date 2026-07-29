package expo.modules.qwen3tts

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoQwen3TtsModule : Module() {
    companion object {
        private var nativeLoaded = false

        init {
            try {
                System.loadLibrary("qwen3tts")
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
            mapOf(
                "samples" to samples.toList(),
                "sampleRate" to sampleRate,
                "duration" to (samples.size.toDouble() / sampleRate),
                "frameCount" to (samples.size / 16),
                "text" to text
            )
        }

        AsyncFunction("cloneVoice") { text: String, referencePath: String ->
            if (!nativeLoaded) throw IllegalStateException("Native library not loaded")
            val samples = nativeCloneVoice(text, referencePath)
                ?: throw RuntimeException("Voice cloning failed")
            val sampleRate = nativeGetSampleRate()
            mapOf(
                "samples" to samples.toList(),
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
