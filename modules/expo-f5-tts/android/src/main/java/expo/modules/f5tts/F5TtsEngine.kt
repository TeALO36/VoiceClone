package expo.modules.f5tts

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.io.RandomAccessFile
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.nio.LongBuffer
import java.nio.ShortBuffer
import java.util.Optional

/**
 * On-device F5-TTS engine (DakeQQ ONNX port of the official SWivid checkpoint).
 *
 * The port splits the model in three ONNX graphs:
 *  - F5_Preprocess.onnx : reference-audio mel + text conditioning + initial
 *    noise + RoPE tables (the STFT/mel extraction lives inside this graph, so
 *    no DSP code is needed on this side);
 *  - F5_Transformer.onnx : ONE flow-matching step (DiT block). The ODE solver
 *    is the loop below — the official sampler runs 32 steps by default;
 *  - F5_Decode.onnx : the vocoder turning the final mel into a waveform.
 *
 * The official Python reference passes the reference audio as int16-range
 * float32 samples (the graph divides by 32768 internally) and concatenates
 * ref_text + gen_text into one token sequence. We mirror that exactly, with a
 * faithful-enough char tokenizer for Latin text (the Chinese pinyin path of
 * the official code is not needed for fr/en and the accented-char handling
 * matches the official "mixed" branch).
 */
class F5TtsEngine {

    companion object {
        const val SAMPLE_RATE = 24000
        const val HOP_LENGTH = 256
        const val DEFAULT_NFE = 32
        const val TAG = "F5Tts"
    }

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private var preprocess: OrtSession? = null
    private var transformer: OrtSession? = null
    private var decode: OrtSession? = null
    private val vocab = HashMap<String, Int>()

    @Volatile
    var modelDir: String? = null
        private set

    val isLoaded: Boolean
        get() = preprocess != null && transformer != null && decode != null && vocab.isNotEmpty()

    fun load(dir: String) {
        release()
        val f = File(dir)
        if (!f.isDirectory) throw IllegalArgumentException("F5-TTS model dir introuvable : $dir")

        val opts = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(Runtime.getRuntime().availableProcessors().coerceAtLeast(2))
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            addConfigEntry("session.intra_op.allow_spinning", "1")
        }
        preprocess = env.createSession(File(f, "F5_Preprocess.onnx").absolutePath, opts)
        // The shipped transformer is the MatMul/Gemm int8-quantized build
        // (5× faster on CPU, near-identical quality) — accept either name.
        val transformerFile = f.listFiles { _, name ->
            name.startsWith("F5_Transformer") && name.endsWith(".onnx")
        }?.firstOrNull() ?: throw IllegalArgumentException("F5_Transformer.onnx manquant dans $dir")
        transformer = env.createSession(transformerFile.absolutePath, opts)
        decode = env.createSession(File(f, "F5_Decode.onnx").absolutePath, opts)

        vocab.clear()
        File(f, "vocab.txt").forEachLine { raw ->
            val key = raw.trimEnd('\r')
            if (key.isNotEmpty() && !vocab.containsKey(key)) vocab[key] = vocab.size
        }
        if (vocab.isEmpty()) throw IllegalArgumentException("vocab.txt vide dans $dir")
        modelDir = dir
    }

    fun release() {
        preprocess?.close(); preprocess = null
        transformer?.close(); transformer = null
        decode?.close(); decode = null
        vocab.clear()
        modelDir = null
    }

    // ─── Tokenizer (French/English) ───
    // Mirrors the official `convert_char_to_pinyin` "pure alphabets" branch:
    // words (including accented letters) are emitted char-by-char, a single
    // space separates words, and punctuation is attached. OOV chars fall back
    // to token 0 exactly like the reference `vocab_char_map.get(c, 0)`.

    private fun mapChar(c: Char): Char = when (c) {
        ';' -> ','
        '\u201C' -> '"'
        '\u201D' -> '"'
        '\u2018' -> '\''
        '\u2019' -> '\''
        else -> c
    }

    private fun isWordChar(c: Char): Boolean = c.isLetter() || c.isDigit() || c == '\''

    internal fun tokenize(text: String): IntArray {
        val src = text.map(::mapChar)
        val out = ArrayList<Char>(src.size * 2)
        val n = src.size
        var i = 0
        while (i < n) {
            val c = src[i]
            when {
                c == ' ' -> { out.add(' '); i++ }
                isWordChar(c) -> {
                    var j = i
                    while (j < n && isWordChar(src[j])) j++
                    // Official rule: a space is inserted before a segment only
                    // when the segment is longer than one char and the previous
                    // emitted char is not a space / colon / quote.
                    if (out.isNotEmpty() && (j - i) > 1) {
                        val last = out[out.size - 1]
                        if (last != ' ' && last != ':' && last != '\'' && last != '"') {
                            out.add(' ')
                        }
                    }
                    for (k in i until j) out.add(src[k])
                    i = j
                }
                else -> { out.add(c); i++ }
            }
        }
        return out.map { vocab[it.toString()] ?: 0 }.toIntArray()
    }

    // ─── WAV I/O (16-bit PCM) ───

    internal data class Wav(val samples: IntArray, val sampleRate: Int)

    internal fun readWav(path: String): Wav {
        val raf = RandomAccessFile(path, "r")
        try {
            if (raf.length() < 44) throw IllegalArgumentException("WAV trop petit : $path")
            raf.seek(0)
            val riff = ByteArray(4); raf.readFully(riff)
            if (String(riff) != "RIFF") throw IllegalArgumentException("Pas un fichier WAV : $path")
            raf.skipBytes(4)
            val wave = ByteArray(4); raf.readFully(wave)
            if (String(wave) != "WAVE") throw IllegalArgumentException("Pas un fichier WAVE : $path")

            var channels = 1
            var sampleRate = SAMPLE_RATE
            var bits = 16
            var dataOffset = -1L
            var dataLen = 0L
            // Walk chunks until the "data" chunk.
            while (raf.filePointer < raf.length()) {
                val id = ByteArray(4); raf.readFully(id)
                val size = readLEInt(raf).toLong() and 0xFFFFFFFFL
                val chunk = String(id)
                when (chunk) {
                    "fmt " -> {
                        raf.skipBytes(2) // audioFormat (PCM = 1)
                        channels = readLEShort(raf)
                        sampleRate = readLEInt(raf)
                        raf.skipBytes(6) // byteRate + blockAlign
                        bits = readLEShort(raf)
                        if (size > 16) raf.skipBytes((size - 16).toInt())
                    }
                    "data" -> { dataOffset = raf.filePointer; dataLen = size; raf.skipBytes(size.toInt()) }
                    else -> raf.skipBytes(size.toInt())
                }
            }
            if (dataOffset < 0) throw IllegalArgumentException("Pas de chunk data : $path")
            if (bits != 16) throw IllegalArgumentException("WAV 16-bit requis (trouvé $bits) : $path")

            raf.seek(dataOffset)
            val sampleCount = (dataLen / 2).toInt()
            val raw = ByteArray(sampleCount * 2)
            raf.readFully(raw)
            val pcm = IntArray(sampleCount)
            for (k in 0 until sampleCount) {
                pcm[k] = (raw[k * 2].toInt() and 0xFF) or (raw[k * 2 + 1].toInt() shl 8)
            }
            // Average channels down to mono if the file happens to be stereo.
            val mono = if (channels > 1) {
                IntArray(sampleCount / channels) { i ->
                    var acc = 0
                    for (ch in 0 until channels) acc += pcm[i * channels + ch]
                    acc / channels
                }
            } else pcm
            return Wav(mono, sampleRate)
        } finally {
            raf.close()
        }
    }

    private fun readLEInt(raf: RandomAccessFile): Int {
        val b = ByteArray(4); raf.readFully(b)
        return (b[0].toInt() and 0xFF) or ((b[1].toInt() and 0xFF) shl 8) or
                ((b[2].toInt() and 0xFF) shl 16) or ((b[3].toInt() and 0xFF) shl 24)
    }

    private fun readLEShort(raf: RandomAccessFile): Int {
        val b = ByteArray(2); raf.readFully(b)
        return (b[0].toInt() and 0xFF) or ((b[1].toInt() and 0xFF) shl 8)
    }

    internal fun writeWav16(path: String, samples: ShortArray, sampleRate: Int) {
        val raf = RandomAccessFile(path, "rw")
        try {
            raf.setLength(0)
            val byteCount = samples.size * 2
            raf.write("RIFF".toByteArray())
            raf.write(leInt(36 + byteCount))
            raf.write("WAVE".toByteArray())
            raf.write("fmt ".toByteArray())
            raf.write(leInt(16))
            raf.write(leShort(1))          // PCM
            raf.write(leShort(1))          // mono
            raf.write(leInt(sampleRate))
            raf.write(leInt(sampleRate * 2))
            raf.write(leShort(2))
            raf.write(leShort(16))
            raf.write("data".toByteArray())
            raf.write(leInt(byteCount))
            val buf = ByteArray(byteCount)
            for (i in samples.indices) {
                val v = samples[i].toInt()
                buf[i * 2] = (v and 0xFF).toByte()
                buf[i * 2 + 1] = ((v shr 8) and 0xFF).toByte()
            }
            raf.write(buf)
        } finally {
            raf.close()
        }
    }

    private fun leInt(v: Int): ByteArray = byteArrayOf(
        (v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte(),
        ((v shr 16) and 0xFF).toByte(), ((v shr 24) and 0xFF).toByte()
    )

    private fun leShort(v: Int): ByteArray = byteArrayOf(
        (v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte()
    )

    /**
     * onnxruntime >= 1.22 changed `Result.get(String)` to return
     * `Optional<OnnxValue>` instead of `OnnxValue` — unwrap it here so the
     * synthesis code below reads naturally (and fails loudly on a missing
     * output instead of crashing with a ClassCastException).
     */
    private fun OrtSession.Result.tensor(name: String): OnnxTensor {
        val v = get(name)
        if (v is Optional<*>) {
            @Suppress("UNCHECKED_CAST")
            return v.get() as OnnxTensor
        }
        @Suppress("UNCHECKED_CAST")
        return v as OnnxTensor
    }

    /** Concrete shape of a tensor (output shapes are fully known at runtime). */
    private fun shapeOf(t: OnnxTensor): LongArray =
        (t.info as ai.onnxruntime.TensorInfo).shape

    /** Number of elements of a concrete output tensor. */
    private fun elementCountOf(t: OnnxTensor): Int {
        var n = 1L
        for (d in shapeOf(t)) n *= d
        return n.toInt()
    }

    // ─── Synthesis ───

    internal fun textLenBytes(t: String): Int = t.toByteArray(Charsets.UTF_8).size

    internal fun computeMaxDuration(refSamples: Int, refText: String, genText: String, speed: Float): Long {
        val refAudioLen = refSamples / HOP_LENGTH + 1
        val refLen = textLenBytes(refText).coerceAtLeast(1)
        val genLen = textLenBytes(genText).coerceAtLeast(1)
        return (refAudioLen + (refAudioLen.toDouble() / refLen * genLen / speed).toInt()).toLong()
    }

    /**
     * Run the full F5-TTS pipeline.
     * @return number of audio samples written.
     */
    fun synthesize(
        text: String,
        refText: String,
        refWavPath: String,
        outWavPath: String,
        speed: Float,
        nfeSteps: Int
    ): Long {
        val pre = preprocess ?: throw IllegalStateException("F5-TTS non initialisé")
        val tr = transformer ?: throw IllegalStateException("F5-TTS non initialisé")
        val dec = decode ?: throw IllegalStateException("F5-TTS non initialisé")

        val wav = readWav(refWavPath)
        if (wav.samples.isEmpty()) throw IllegalArgumentException("Extrait de référence vide")
        android.util.Log.i(TAG, "ref wav: ${wav.samples.size} samples @ ${wav.sampleRate}Hz (${wav.samples.size / 24000f}s)")

        val preIn = pre.inputNames.toList()
        val preOut = pre.outputNames.toList()
        val trIn = tr.inputNames.toList()
        val trOut = tr.outputNames.toList()
        val decIn = dec.inputNames.toList()
        val decOut = dec.outputNames.toList()

        // 1. Reference audio as int16 samples — the graph takes tensor(int16)
        // directly (the STFT/mel extraction happens inside the graph).
        val audioS = ShortArray(wav.samples.size)
        for (i in audioS.indices) audioS[i] = wav.samples[i].toShort()
        var audioTensor: OnnxTensor? = null
        var textTensor: OnnxTensor? = null
        var maxDurTensor: OnnxTensor? = null
        var preResult: OrtSession.Result? = null
        try {
            audioTensor = OnnxTensor.createTensor(env, ShortBuffer.wrap(audioS), longArrayOf(1, 1, audioS.size.toLong()))
            val textIds = tokenize(refText + text)
            textTensor = OnnxTensor.createTensor(env, IntBuffer.wrap(textIds), longArrayOf(1, textIds.size.toLong()))
            val maxDur = computeMaxDuration(wav.samples.size, refText, text, speed)
            android.util.Log.i(TAG, "tokens=${textIds.size} refTextLen=${textLenBytes(refText)} genLen=${textLenBytes(text)} maxDuration=$maxDur")
            maxDurTensor = OnnxTensor.createTensor(
                env, LongBuffer.wrap(longArrayOf(maxDur)), longArrayOf(1)
            )
            val preInputs = mapOf(
                preIn[0] to audioTensor,
                preIn[1] to textTensor,
                preIn[2] to maxDurTensor
            )
            preResult = pre.run(preInputs)

            // 2. Flow-matching loop over the transformer graph.
            val noiseOut = preResult.tensor(preOut[0])
            android.util.Log.i(TAG, "preprocess noise shape=${shapeOf(noiseOut).joinToString()}")
            val rq = preResult.tensor(preOut[1])
            val sq = preResult.tensor(preOut[2])
            val rk = preResult.tensor(preOut[3])
            val sk = preResult.tensor(preOut[4])
            val catMel = preResult.tensor(preOut[5])
            val catMelDrop = preResult.tensor(preOut[6])
            val refLenOut = preResult.tensor(preOut[7])

            val noiseShape = shapeOf(noiseOut)
            val noiseData = FloatArray(elementCountOf(noiseOut))
            noiseOut.floatBuffer.rewind()
            noiseOut.floatBuffer.get(noiseData)

            var noiseTensor = OnnxTensor.createTensor(
                env, FloatBuffer.wrap(noiseData), noiseShape
            )
            var timeStepTensor = OnnxTensor.createTensor(
                env, IntBuffer.wrap(intArrayOf(0)), longArrayOf(1)
            )
            // The official sampler runs range(0, NFE_STEP - 1): the graph's
            // time-embedding table has exactly NFE_STEP entries, so the valid
            // timestep range is 0..NFE_STEP-2 (a 32nd call crashes the Gather).
            val steps = (nfeSteps.coerceIn(1, 64)) - 1
            try {
                for (step in 0 until steps) {
                    val runInputs = mapOf(
                        trIn[0] to noiseTensor,
                        trIn[1] to rq,
                        trIn[2] to sq,
                        trIn[3] to rk,
                        trIn[4] to sk,
                        trIn[5] to catMel,
                        trIn[6] to catMelDrop,
                        trIn[7] to timeStepTensor
                    )
                    val result = tr.run(runInputs)
                    try {
                        val newNoise = result.tensor(trOut[0])
                        val newStep = result.tensor(trOut[1])
                        val nextShape = shapeOf(newNoise)
                        val nextData = FloatArray(elementCountOf(newNoise))
                        newNoise.floatBuffer.rewind()
                        newNoise.floatBuffer.get(nextData)
                        val nextStep = IntArray(elementCountOf(newStep))
                        newStep.intBuffer.rewind()
                        newStep.intBuffer.get(nextStep)

                        noiseTensor.close()
                        timeStepTensor.close()
                        noiseTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(nextData), nextShape)
                        timeStepTensor = OnnxTensor.createTensor(
                            env, IntBuffer.wrap(nextStep), shapeOf(newStep)
                        )
                    } finally {
                        result.close()
                    }
                }

                // 3. Vocoder. ref_signal_len is a scalar (shape []); pass it
                // with the exact shape the preprocess produced.
                val refLenShape = shapeOf(refLenOut)
                val refLenData = LongArray(elementCountOf(refLenOut))
                refLenOut.longBuffer.rewind()
                refLenOut.longBuffer.get(refLenData)
                val refLenTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(refLenData), refLenShape)
                val decInputs = mapOf(decIn[0] to noiseTensor, decIn[1] to refLenTensor)
                val decResult = dec.run(decInputs)
                try {
                    val waveOut = decResult.tensor(decOut[0])
                    // The vocoder outputs int16 PCM directly.
                    val waveData = ShortArray(elementCountOf(waveOut))
                    waveOut.shortBuffer.rewind()
                    waveOut.shortBuffer.get(waveData)
                    waveOut.close()
                    android.util.Log.i(TAG, "decoded ${waveData.size} samples (${waveData.size / 24000f}s)")
                    writeWav16(outWavPath, waveData, SAMPLE_RATE)
                    return waveData.size.toLong()
                } finally {
                    decResult.close()
                    refLenTensor.close()
                }
            } finally {
                noiseTensor.close()
                timeStepTensor.close()
            }
        } finally {
            audioTensor?.close()
            textTensor?.close()
            maxDurTensor?.close()
            preResult?.close()
        }
    }
}
