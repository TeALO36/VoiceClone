package expo.modules.f5tts

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Expo bridge to the on-device F5-TTS engine (onnxruntime).
 *
 * Unlike the OmniVoice/Qwen3/Pocket engines (one shared native slot), F5-TTS
 * keeps its own sessions, so it can be loaded independently. The model dir
 * contains F5_Preprocess.onnx, F5_Transformer.onnx, F5_Decode.onnx, vocab.txt
 * and optionally voices/ref.wav (the bundled default voice + its transcript in
 * voices/ref.txt).
 */
class F5TtsModule : Module() {

    private val engine = F5TtsEngine()

    override fun definition() = ModuleDefinition {
        Name("ExpoF5Tts")

        AsyncFunction("initModel") { modelDir: String ->
            val actualDir = if (modelDir.startsWith("file://")) modelDir.substring(7) else modelDir
            engine.load(actualDir)
        }

        // F5-TTS always conditions on a reference voice: refWavPath (24 kHz mono
        // WAV) + refText (what the reference clip says). `text` is the target
        // utterance. `speed` scales the estimated duration; `steps` is the
        // number of flow-matching ODE steps (official default: 32).
        AsyncFunction("synthesize") { text: String, refText: String, refWavPath: String, speed: Double, steps: Int ->
            if (!engine.isLoaded) throw IllegalStateException("F5-TTS non initialisé")
            if (text.isBlank()) throw IllegalArgumentException("Le texte ne peut pas être vide")
            cleanupOldAudioFiles()

            val actualRef = if (refWavPath.startsWith("file://")) refWavPath.substring(7) else refWavPath
            if (!File(actualRef).exists()) {
                throw IllegalArgumentException("Extrait de référence introuvable : $actualRef")
            }

            val cacheDir = appContext.reactContext?.cacheDir
                ?: throw IllegalStateException("No Android context available")
            val outFile = File.createTempFile("f5_", ".wav", cacheDir)
            val outPath = outFile.absolutePath

            val numSamples = try {
                engine.synthesize(text, refText, actualRef, outPath, speed.toFloat(), steps)
            } catch (e: Exception) {
                outFile.delete()
                throw e
            }

            mapOf(
                "audioUri" to "file://$outPath",
                "sampleRate" to F5TtsEngine.SAMPLE_RATE,
                "duration" to (numSamples.toDouble() / F5TtsEngine.SAMPLE_RATE),
                "frameCount" to numSamples,
                "text" to text
            )
        }

        AsyncFunction("releaseModel") {
            engine.release()
        }

        AsyncFunction("isModelReady") {
            engine.isLoaded
        }

        AsyncFunction("getSampleRate") {
            F5TtsEngine.SAMPLE_RATE
        }
    }

    private fun cleanupOldAudioFiles() {
        val cacheDir = appContext.reactContext?.cacheDir ?: return
        val files = cacheDir.listFiles { _, name -> name.startsWith("f5_") }
        if (files != null) {
            val now = System.currentTimeMillis()
            for (file in files) {
                if (now - file.lastModified() > 3_600_000) file.delete()
            }
        }
    }
}
