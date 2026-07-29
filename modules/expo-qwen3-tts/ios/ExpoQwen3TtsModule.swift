import ExpoModulesCore
import AVFoundation

// Stub bridging header for Qwen3-TTS C++ engine.
// When qwen3-tts.cpp source is available as a static library,
// import the C bridge header: #import "qwen3_tts_bridge.h"

public class ExpoQwen3TtsModule: Module {
    private var modelReady = false
    private let sampleRate: Int = 24000

    public func definition() -> ModuleDefinition {
        Name("ExpoQwen3Tts")

        AsyncFunction("initModel") { (modelDir: String) -> Bool in
            // TODO: Call C++ qwen3_tts_init(modelDir) when linked
            print("[ExpoQwen3Tts] initModel: \(modelDir)")
            self.modelReady = true
            return true
        }

        AsyncFunction("synthesize") { (text: String) -> [String: Any] in
            guard self.modelReady else {
                throw NSError(domain: "ExpoQwen3Tts", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Model not loaded"])
            }

            // TODO: Call C++ qwen3_tts_synthesize(text) when linked
            // For now, generate 1 second of silence
            let frameCount = self.sampleRate
            var samples = [Float](repeating: 0.0, count: frameCount)

            return [
                "samples": samples,
                "sampleRate": self.sampleRate,
                "duration": Double(frameCount) / Double(self.sampleRate),
                "frameCount": frameCount,
                "text": text
            ]
        }

        AsyncFunction("cloneVoice") { (text: String, referencePath: String) -> [String: Any] in
            guard self.modelReady else {
                throw NSError(domain: "ExpoQwen3Tts", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Model not loaded"])
            }

            // TODO: Call C++ qwen3_tts_clone(text, refPath) when linked
            let frameCount = self.sampleRate
            var samples = [Float](repeating: 0.0, count: frameCount)

            return [
                "samples": samples,
                "sampleRate": self.sampleRate,
                "duration": Double(frameCount) / Double(self.sampleRate),
                "frameCount": frameCount,
                "text": text
            ]
        }

        AsyncFunction("releaseModel") {
            self.modelReady = false
        }

        AsyncFunction("isModelReady") { () -> Bool in
            return self.modelReady
        }

        AsyncFunction("getSampleRate") { () -> Int in
            return self.sampleRate
        }
    }
}
