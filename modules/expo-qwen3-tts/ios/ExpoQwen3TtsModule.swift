import ExpoModulesCore
import AVFoundation
import SherpaOnnxC

/**
 * iOS implementation of the on-device TTS module.
 *
 * Pocket TTS runs through the vendored SherpaOnnxC framework (see
 * scripts/fetch-sherpa-onnx-ios.sh). The OmniVoice and Qwen3-TTS engines are
 * built for Android only — on iOS those models report a clear error rather
 * than the old behaviour of returning fake silence.
 *
 * Everything else mirrors the Android module: `prepareReference` decodes any
 * audio/video the user picked into a 24 kHz mono WAV, and synthesis writes the
 * generated WAV to the cache directory and returns its file:// URI.
 */

private let TARGET_SAMPLE_RATE: Double = 24000

public class ExpoQwen3TtsModule: Module {
    private var pocketTts: OpaquePointer?
    private var pocketEngine = false

    public func definition() -> ModuleDefinition {
        Name("ExpoQwen3Tts")

        AsyncFunction("initModel") { (modelDir: String, engine: String) in
            let dir = modelDir.replacingOccurrences(of: "file://", with: "")
            guard FileManager.default.fileExists(atPath: dir) else {
                throw NSError(domain: "ExpoQwen3Tts", code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "modelDir must be an existing directory (got \(dir))"])
            }

            if engine == "pocket" {
                try self.initPocket(dir)
            } else {
                // OmniVoice / Qwen3-TTS are Android-only builds in this app.
                throw NSError(domain: "ExpoQwen3Tts", code: -3,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Le moteur \(engine) n'est pas disponible sur iOS. Utilisez Pocket TTS."])
            }
        }

        AsyncFunction("prepareReference") { (sourceUri: String) -> [String: Any] in
            let wav = try self.prepareReference(sourceUri)
            let duration = try Self.wavDuration(wav)
            return [
                "uri": "file://\(wav)",
                "sampleRate": TARGET_SAMPLE_RATE,
                "duration": duration,
            ]
        }

        AsyncFunction("synthesize") { (text: String, lang: String, instruct: String, steps: Int) -> [String: Any] in
            guard self.pocketEngine, let tts = self.pocketTts else {
                throw NSError(domain: "ExpoQwen3Tts", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Model not loaded"])
            }
            // Pocket TTS needs a reference voice; plain TTS resolves the
            // bundled default in the JS layer and routes through cloneVoice.
            throw NSError(domain: "ExpoQwen3Tts", code: -4,
                userInfo: [NSLocalizedDescriptionKey: "Pocket TTS requires a reference voice"])
        }

        AsyncFunction("cloneVoice") { (text: String, lang: String, refText: String, referencePath: String, steps: Int) -> [String: Any] in
            guard self.pocketEngine, let tts = self.pocketTts else {
                throw NSError(domain: "ExpoQwen3Tts", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Model not loaded"])
            }

            let path = referencePath.replacingOccurrences(of: "file://", with: "")
            let (samples, sampleRate) = try Self.readWav(path)
            let outPath = try Self.tempWavPath(prefix: "clone_")

            let result = try Self.generate(tts, text: text, refSamples: samples,
                                           refSampleRate: sampleRate, steps: steps,
                                           outPath: outPath)
            return result
        }

        AsyncFunction("releaseModel") {
            if let tts = self.pocketTts {
                SherpaOnnxDestroyOfflineTts(tts)
            }
            self.pocketTts = nil
            self.pocketEngine = false
        }

        AsyncFunction("isModelReady") { () -> Bool in
            return self.pocketEngine && self.pocketTts != nil
        }

        AsyncFunction("getSampleRate") { () -> Int in
            if self.pocketEngine, let tts = self.pocketTts {
                return Int(SherpaOnnxOfflineTtsSampleRate(tts))
            }
            return 24000
        }
    }

    // ── Pocket TTS ──────────────────────────────────────────────────────

    private func initPocket(_ modelDir: String) throws {
        func path(_ name: String) -> String { return "\(modelDir)/\(name)" }

        // The C API keeps pointers to these strings only during create(); the
        // C++ side copies them into std::string, so we can free them right
        // after. strdup returns UnsafeMutablePointer<CChar>; fields are
        // UnsafePointer<CChar>? — the implicit conversion is fine.
        var pocket = SherpaOnnxOfflineTtsPocketModelConfig()
        pocket.lm_flow           = strdup(path("lm_flow.int8.onnx"))
        pocket.lm_main           = strdup(path("lm_main.int8.onnx"))
        pocket.encoder           = strdup(path("encoder.onnx"))
        pocket.decoder           = strdup(path("decoder.int8.onnx"))
        pocket.text_conditioner  = strdup(path("text_conditioner.onnx"))
        pocket.vocab_json        = strdup(path("vocab.json"))
        pocket.token_scores_json = strdup(path("token_scores.json"))

        var model = SherpaOnnxOfflineTtsModelConfig()
        model.num_threads = 2
        model.debug = 0
        model.pocket = pocket

        var config = SherpaOnnxOfflineTtsConfig()
        config.model = model
        config.max_num_sentences = 1
        config.silence_scale = 0.2

        defer {
            free(pocket.lm_flow)
            free(pocket.lm_main)
            free(pocket.encoder)
            free(pocket.decoder)
            free(pocket.text_conditioner)
            free(pocket.vocab_json)
            free(pocket.token_scores_json)
        }

        guard let tts = SherpaOnnxCreateOfflineTts(&config) else {
            throw NSError(domain: "ExpoQwen3Tts", code: -5,
                userInfo: [NSLocalizedDescriptionKey: "Échec de chargement du modèle Pocket TTS (sherpa-onnx)."])
        }

        if let old = self.pocketTts { SherpaOnnxDestroyOfflineTts(old) }
        self.pocketTts = tts
        self.pocketEngine = true
    }

    private static func generate(
        _ tts: OpaquePointer,
        text: String,
        refSamples: [Float],
        refSampleRate: Int,
        steps: Int,
        outPath: String
    ) throws -> [String: Any] {
        var gen = SherpaOnnxGenerationConfig()
        gen.silence_scale = 0.2
        gen.speed = 1.0
        gen.num_steps = Int32(steps > 0 ? steps : 4)
        gen.reference_sample_rate = Int32(refSampleRate)

        let result: [String: Any] = try refSamples.withUnsafeBufferPointer { buf in
            gen.reference_audio = buf.baseAddress
            gen.reference_audio_len = Int32(buf.count)

            guard let audio = SherpaOnnxOfflineTtsGenerateWithConfig(tts, text, &gen, nil, nil),
                  audio.pointee.n > 0 else {
                throw NSError(domain: "ExpoQwen3Tts", code: -6,
                    userInfo: [NSLocalizedDescriptionKey: "Pocket TTS generation failed"])
            }

            let n = audio.pointee.n
            let sampleRate = audio.pointee.sample_rate > 0 ? audio.pointee.sample_rate : 24000
            let ok = SherpaOnnxWriteWave(audio.pointee.samples, n, sampleRate, outPath)
            SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio)

            guard ok else {
                throw NSError(domain: "ExpoQwen3Tts", code: -7,
                    userInfo: [NSLocalizedDescriptionKey: "Could not write output WAV"])
            }
            return [
                "audioUri": "file://\(outPath)",
                "sampleRate": sampleRate,
                "duration": Double(n) / Double(sampleRate),
                "frameCount": Int(n),
                "text": text,
            ]
        }
        return result
    }

    // ── Reference conversion (audio/video → 24 kHz mono WAV) ───────────

    private func prepareReference(_ sourceUri: String) throws -> String {
        let outPath = try Self.tempWavPath(prefix: "ref_")
        let url: URL
        if sourceUri.hasPrefix("file://") {
            url = URL(fileURLWithPath: String(sourceUri.dropFirst("file://".count)))
        } else {
            url = URL(string: sourceUri)!
        }

        let asset = AVURLAsset(url: url)
        guard let reader = try? AVAssetReader(asset: asset),
              let track = asset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "ExpoQwen3Tts", code: -8,
                userInfo: [NSLocalizedDescriptionKey: "Ce fichier ne contient aucune piste audio."])
        }

        let inputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: TARGET_SAMPLE_RATE,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: inputSettings)
        reader.add(output)
        reader.startReading()

        var samples = [Float]()
        while let buffer = output.copyNextSampleBuffer() {
            if let block = CMSampleBufferGetDataBuffer(buffer) {
                var length = 0
                var data: UnsafeMutablePointer<Int8>?
                CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil,
                                            totalLengthOut: &length, dataPointerOut: &data)
                if let data = data {
                    let count = length / 2
                    data.withMemoryRebound(to: Int16.self, capacity: count) { pcm in
                        for i in 0..<count {
                            samples.append(Float(pcm[i]) / 32768.0)
                        }
                    }
                }
            }
            CMSampleBufferInvalidate(buffer)
        }
        reader.cancelReading()

        guard samples.count > 0 else {
            throw NSError(domain: "ExpoQwen3Tts", code: -9,
                userInfo: [NSLocalizedDescriptionKey: "Aucun son exploitable dans ce fichier."])
        }

        try Self.writeWav(samples, sampleRate: Int(TARGET_SAMPLE_RATE), to: outPath)
        return outPath
    }

    // ── WAV helpers ─────────────────────────────────────────────────────

    private static func tempWavPath(prefix: String) throws -> String {
        let dir = NSTemporaryDirectory()
        let name = "\(prefix)\(Int(Date().timeIntervalSince1970 * 1000))_\(Int.random(in: 1000...9999)).wav"
        return (dir as NSString).appendingPathComponent(name)
    }

    private static func writeWav(_ samples: [Float], sampleRate: Int, to path: String) throws {
        let dataBytes = samples.count * 2
        var header = Data()
        func u32(_ v: UInt32) { var le = v.littleEndian; withUnsafeBytes(of: &le) { header.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { var le = v.littleEndian; withUnsafeBytes(of: &le) { header.append(contentsOf: $0) } }

        header.append(contentsOf: [0x52, 0x49, 0x46, 0x46])   // "RIFF"
        u32(UInt32(36 + dataBytes))
        header.append(contentsOf: [0x57, 0x41, 0x56, 0x45])   // "WAVE"
        header.append(contentsOf: [0x66, 0x6d, 0x74, 0x20])   // "fmt "
        u32(16)
        u16(1)                                                // PCM
        u16(1)                                                // mono
        u32(UInt32(sampleRate))
        u32(UInt32(sampleRate * 2))
        u16(2)
        u16(16)
        header.append(contentsOf: [0x64, 0x61, 0x74, 0x61])   // "data"
        u32(UInt32(dataBytes))

        var body = Data(capacity: dataBytes)
        for s in samples {
            let clamped = max(-1.0, min(1.0, Double(s)))
            var v = Int16(clamped * 32767.0)
            withUnsafeBytes(of: &v) { body.append(contentsOf: $0) }
        }
        try (header + body).write(to: URL(fileURLWithPath: path))
    }

    private static func readWav(_ path: String) throws -> ([Float], Int) {
        let url = URL(fileURLWithPath: path)
        let file = try AVAudioFile(forReading: url)
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: file.fileFormat.sampleRate,
                                   channels: 1, interleaved: false)!
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length)) else {
            throw NSError(domain: "ExpoQwen3Tts", code: -10,
                userInfo: [NSLocalizedDescriptionKey: "Impossible de lire l'extrait de référence"])
        }
        try file.read(into: buffer)
        let samples = Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
        return (samples, Int(file.fileFormat.sampleRate))
    }

    private static func wavDuration(_ path: String) throws -> Double {
        let url = URL(fileURLWithPath: path)
        let file = try AVAudioFile(forReading: url)
        return Double(file.length) / file.fileFormat.sampleRate
    }
}
