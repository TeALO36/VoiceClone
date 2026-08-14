package expo.modules.qwen3tts

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Turns any audio or video the user picked into the one shape the cloning
 * engines accept: 24 kHz mono 16-bit WAV.
 *
 * Everything goes through MediaExtractor + MediaCodec, so mp3, m4a, aac, ogg,
 * mp4 and mkv all work with no extra dependency and no visible step for the
 * user — a video is just a container we pull the audio track out of.
 */
object AudioConverter {

    const val TARGET_SAMPLE_RATE = 24000

    /** Reference clips beyond this are trimmed: cloning needs seconds, not minutes. */
    private const val MAX_SECONDS = 30

    /**
     * Below this there is not enough voice to characterise a speaker.
     *
     * Was 0.5 while the rejection message promised 3 seconds, so a clip six
     * times shorter than the stated minimum was accepted without comment. A
     * reference that brief carries almost no speaker evidence and the model
     * falls back on its prior, which reaches the user as "the clone sounds
     * nothing like me" with nothing on screen explaining why.
     */
    private const val MIN_SECONDS = 3.0

    private const val TIMEOUT_US = 10_000L

    class ConversionError(message: String) : Exception(message)

    /**
     * Decode [sourceUri] and write a 24 kHz mono WAV to [outFile].
     * Returns [outFile] for chaining.
     */
    fun toReferenceWav(context: Context, sourceUri: String, outFile: File): File {
        val (samples, sampleRate) = decodePcm(context, sourceUri)

        if (samples.isEmpty()) {
            throw ConversionError("Aucun son exploitable dans ce fichier.")
        }

        val seconds = samples.size.toDouble() / sampleRate
        if (seconds < MIN_SECONDS) {
            throw ConversionError(
                "Extrait trop court (${"%.1f".format(seconds)} s). Il faut au moins 3 secondes de voix.")
        }

        var mono = resample(samples, sampleRate, TARGET_SAMPLE_RATE)

        val maxSamples = MAX_SECONDS * TARGET_SAMPLE_RATE
        if (mono.size > maxSamples) {
            mono = mono.copyOf(maxSamples)
        }

        normalise(mono)
        writeWav(outFile, mono, TARGET_SAMPLE_RATE)
        return outFile
    }

    /**
     * Pull the first audio track out of the container and decode it to mono
     * float PCM at whatever rate the source uses.
     */
    private fun decodePcm(context: Context, sourceUri: String): Pair<FloatArray, Int> {
        val extractor = MediaExtractor()
        try {
            when {
                sourceUri.startsWith("content://") ->
                    extractor.setDataSource(context, Uri.parse(sourceUri), null)
                sourceUri.startsWith("file://") ->
                    extractor.setDataSource(sourceUri.substring(7))
                else ->
                    extractor.setDataSource(sourceUri)
            }
        } catch (e: Exception) {
            extractor.release()
            throw ConversionError("Fichier illisible : ${e.message}")
        }

        var trackIndex = -1
        var inputFormat: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(i)
            if (format.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                trackIndex = i
                inputFormat = format
                break
            }
        }

        if (trackIndex < 0 || inputFormat == null) {
            extractor.release()
            throw ConversionError("Ce fichier ne contient aucune piste audio.")
        }

        extractor.selectTrack(trackIndex)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME)!!

        val codec = try {
            MediaCodec.createDecoderByType(mime).apply {
                configure(inputFormat, null, null, 0)
                start()
            }
        } catch (e: Exception) {
            extractor.release()
            throw ConversionError("Format audio non pris en charge ($mime).")
        }

        // The decoder may report a different rate/channel count than the
        // container did, so these are refreshed from the output format.
        var sampleRate = inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = runCatching { inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) }.getOrDefault(1)

        val out = ArrayList<Float>(sampleRate * 10)
        val info = MediaCodec.BufferInfo()
        var sawInputEos = false
        var sawOutputEos = false

        try {
            while (!sawOutputEos) {
                if (!sawInputEos) {
                    val inIndex = codec.dequeueInputBuffer(TIMEOUT_US)
                    if (inIndex >= 0) {
                        val buffer = codec.getInputBuffer(inIndex)!!
                        val size = extractor.readSampleData(buffer, 0)
                        if (size < 0) {
                            codec.queueInputBuffer(
                                inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            sawInputEos = true
                        } else {
                            codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                when (val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        val f = codec.outputFormat
                        sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = runCatching { f.getInteger(MediaFormat.KEY_CHANNEL_COUNT) }
                            .getOrDefault(channels)
                    }
                    MediaCodec.INFO_TRY_AGAIN_LATER -> { /* keep pumping */ }
                    else -> {
                        if (outIndex >= 0) {
                            if (info.size > 0) {
                                val buffer = codec.getOutputBuffer(outIndex)!!
                                appendMono(buffer, info, channels, out)
                            }
                            codec.releaseOutputBuffer(outIndex, false)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                                sawOutputEos = true
                            }
                        }
                    }
                }

                // Hard stop well past MAX_SECONDS so a long video cannot pin
                // an unbounded amount of memory before the trim step.
                if (out.size > sampleRate * MAX_SECONDS * 4) sawOutputEos = true
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
            extractor.release()
        }

        return Pair(out.toFloatArray(), sampleRate)
    }

    /** Read 16-bit PCM out of [buffer], averaging channels down to mono. */
    private fun appendMono(
        buffer: ByteBuffer,
        info: MediaCodec.BufferInfo,
        channels: Int,
        out: ArrayList<Float>
    ) {
        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)
        val shorts = buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()

        val frames = shorts.remaining() / channels
        for (i in 0 until frames) {
            var sum = 0f
            for (c in 0 until channels) {
                sum += shorts.get(i * channels + c) / 32768f
            }
            out.add(sum / channels)
        }
    }

    /**
     * Rate conversion with a box filter over the source window. Plain linear
     * interpolation aliases badly going from 44.1 kHz down to 24 kHz; averaging
     * the samples that fall inside each output step is cheap and avoids the
     * worst of it.
     */
    private fun resample(input: FloatArray, fromRate: Int, toRate: Int): FloatArray {
        if (fromRate == toRate || input.isEmpty()) return input

        val ratio = fromRate.toDouble() / toRate
        val outLength = (input.size / ratio).toInt()
        if (outLength <= 0) return FloatArray(0)

        val output = FloatArray(outLength)

        if (ratio > 1.0) {
            for (i in 0 until outLength) {
                val start = (i * ratio).toInt()
                val end = minOf(((i + 1) * ratio).toInt(), input.size)
                var sum = 0f
                var count = 0
                for (j in start until maxOf(end, start + 1)) {
                    if (j < input.size) { sum += input[j]; count++ }
                }
                output[i] = if (count > 0) sum / count else 0f
            }
        } else {
            // Upsampling: linear interpolation is fine, nothing to alias.
            for (i in 0 until outLength) {
                val pos = i * ratio
                val idx = pos.toInt()
                val frac = (pos - idx).toFloat()
                val a = input[minOf(idx, input.size - 1)]
                val b = input[minOf(idx + 1, input.size - 1)]
                output[i] = a + (b - a) * frac
            }
        }

        return output
    }

    /** Bring the clip to a consistent level so quiet recordings still clone well. */
    private fun normalise(samples: FloatArray) {
        var peak = 0f
        for (s in samples) {
            val a = kotlin.math.abs(s)
            if (a > peak) peak = a
        }
        if (peak < 1e-4f) return

        val gain = (0.95f / peak).coerceAtMost(8f)
        if (gain <= 1.01f) return
        for (i in samples.indices) samples[i] = samples[i] * gain
    }

    private fun writeWav(file: File, samples: FloatArray, sampleRate: Int) {
        val dataBytes = samples.size * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray())
        header.putInt(36 + dataBytes)
        header.put("WAVE".toByteArray())
        header.put("fmt ".toByteArray())
        header.putInt(16)
        header.putShort(1)                       // PCM
        header.putShort(1)                       // mono
        header.putInt(sampleRate)
        header.putInt(sampleRate * 2)            // byte rate
        header.putShort(2)                       // block align
        header.putShort(16)                      // bits per sample
        header.put("data".toByteArray())
        header.putInt(dataBytes)

        val body = ByteBuffer.allocate(dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        for (s in samples) {
            body.putShort((s.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        }

        FileOutputStream(file).use { stream ->
            stream.write(header.array())
            stream.write(body.array())
        }
    }
}
