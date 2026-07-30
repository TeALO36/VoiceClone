/**
 * JNI bridge between the Expo module (Kotlin) and the OmniVoice engine.
 *
 * Two rules shape this file:
 *  - Audio never crosses the JS bridge. Synthesis writes a 24 kHz mono WAV
 *    straight to a path chosen by Kotlin and returns only the sample count;
 *    JavaScript receives a file URI it can hand to a player as-is.
 *  - The cloning reference arrives as a jfloatArray already decoded and
 *    resampled to 24 kHz mono by the Kotlin side, so nothing here has to
 *    parse container formats.
 */

#include <jni.h>
#include <android/log.h>

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "omnivoice.h"

#define LOG_TAG "VoxCloneJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

ov_context * g_ov = nullptr;
std::string  g_last_error;

void set_error(const char * what) {
    const char * detail = ov_last_error();
    g_last_error = what;
    if (detail && *detail) {
        g_last_error += ": ";
        g_last_error += detail;
    }
    LOGE("%s", g_last_error.c_str());
}

std::string jstr(JNIEnv * env, jstring s) {
    if (!s) return {};
    const char * raw = env->GetStringUTFChars(s, nullptr);
    std::string out = raw ? raw : "";
    if (raw) env->ReleaseStringUTFChars(s, raw);
    return out;
}

void put_u32(uint8_t * p, uint32_t v) {
    p[0] = (uint8_t)(v      ); p[1] = (uint8_t)(v >>  8);
    p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24);
}

void put_u16(uint8_t * p, uint16_t v) {
    p[0] = (uint8_t)(v); p[1] = (uint8_t)(v >> 8);
}

/** Write mono float PCM as a 16-bit WAV. Returns false on any I/O failure. */
bool write_wav(const std::string & path, const float * samples, int n, int sample_rate) {
    if (n <= 0) return false;

    const uint32_t data_bytes = (uint32_t)n * 2u;
    uint8_t header[44];
    std::memcpy(header, "RIFF", 4);
    put_u32(header + 4, 36u + data_bytes);
    std::memcpy(header + 8, "WAVEfmt ", 8);
    put_u32(header + 16, 16);                                   // fmt chunk size
    put_u16(header + 20, 1);                                    // PCM
    put_u16(header + 22, 1);                                    // mono
    put_u32(header + 24, (uint32_t)sample_rate);
    put_u32(header + 28, (uint32_t)sample_rate * 2u);           // byte rate
    put_u16(header + 32, 2);                                    // block align
    put_u16(header + 34, 16);                                   // bits per sample
    std::memcpy(header + 36, "data", 4);
    put_u32(header + 40, data_bytes);

    FILE * f = std::fopen(path.c_str(), "wb");
    if (!f) {
        LOGE("Cannot open output WAV: %s", path.c_str());
        return false;
    }

    bool ok = std::fwrite(header, 1, sizeof(header), f) == sizeof(header);

    std::vector<int16_t> pcm((size_t)n);
    for (int i = 0; i < n; i++) {
        float s = samples[i];
        if (s >  1.0f) s =  1.0f;
        if (s < -1.0f) s = -1.0f;
        pcm[(size_t)i] = (int16_t)(s * 32767.0f);
    }
    ok = ok && std::fwrite(pcm.data(), sizeof(int16_t), (size_t)n, f) == (size_t)n;
    std::fclose(f);

    if (!ok) LOGE("Short write on %s", path.c_str());
    return ok;
}

/**
 * Shared body of synthesize/cloneVoice. `ref` may be null for plain TTS.
 * Returns the number of samples written, or -1 on failure.
 */
jint run_synthesis(JNIEnv * env,
                   jstring     jText,
                   jstring     jLang,
                   jstring     jInstruct,
                   jfloatArray jRef,
                   jstring     jRefText,
                   jstring     jOutPath) {

    if (!g_ov) {
        g_last_error = "Model not loaded";
        LOGE("%s", g_last_error.c_str());
        return -1;
    }

    const std::string text     = jstr(env, jText);
    const std::string lang     = jstr(env, jLang);
    const std::string instruct = jstr(env, jInstruct);
    const std::string ref_text = jstr(env, jRefText);
    const std::string out_path = jstr(env, jOutPath);

    if (text.empty() || out_path.empty()) {
        g_last_error = "Empty text or output path";
        LOGE("%s", g_last_error.c_str());
        return -1;
    }

    ov_tts_params p;
    ov_tts_default_params(&p);
    p.text = text.c_str();
    p.lang = lang.c_str();
    p.instruct = instruct.empty() ? nullptr : instruct.c_str();

    // Reference samples stay pinned for the whole ov_synthesize call.
    jfloat * ref_pin = nullptr;
    jsize    ref_len = 0;
    if (jRef) {
        ref_len = env->GetArrayLength(jRef);
        if (ref_len > 0) {
            ref_pin = env->GetFloatArrayElements(jRef, nullptr);
            p.ref_audio_24k = ref_pin;
            p.ref_n_samples = (int)ref_len;
            if (!ref_text.empty()) p.ref_text = ref_text.c_str();
            LOGD("Cloning with %d reference samples (%.1fs)", (int)ref_len, ref_len / 24000.0);
        }
    }

    ov_audio out = {0};
    const ov_status rc = ov_synthesize(g_ov, &p, &out);

    if (ref_pin) env->ReleaseFloatArrayElements(jRef, ref_pin, JNI_ABORT);

    if (rc != OV_STATUS_OK || out.n_samples <= 0) {
        char buf[64];
        std::snprintf(buf, sizeof(buf), "Synthesis failed (rc=%d)", (int)rc);
        set_error(buf);
        ov_audio_free(&out);
        return -1;
    }

    const bool written = write_wav(out_path, out.samples, out.n_samples,
                                   out.sample_rate > 0 ? out.sample_rate : 24000);
    const int n = out.n_samples;
    ov_audio_free(&out);

    if (!written) {
        g_last_error = "Could not write output WAV";
        return -1;
    }

    LOGD("Wrote %d samples to %s", n, out_path.c_str());
    return (jint)n;
}

} // namespace

extern "C" {

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeInitModel(
    JNIEnv * env, jobject, jstring jModelPath, jstring jCodecPath) {

    if (g_ov) { ov_free(g_ov); g_ov = nullptr; }

    const std::string model_path = jstr(env, jModelPath);
    const std::string codec_path = jstr(env, jCodecPath);
    LOGD("Loading model=%s codec=%s", model_path.c_str(), codec_path.c_str());

    ov_init_params ip;
    ov_init_default_params(&ip);
    ip.model_path = model_path.c_str();
    ip.codec_path = codec_path.c_str();
    ip.use_fa     = false;  // CPU-only backend on Android
    ip.clamp_fp16 = false;

    g_ov = ov_init(&ip);
    if (!g_ov) {
        set_error("Model load failed");
        return JNI_FALSE;
    }

    g_last_error.clear();
    LOGD("OmniVoice ready");
    return JNI_TRUE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeSynthesize(
    JNIEnv * env, jobject, jstring text, jstring lang, jstring instruct, jstring outPath) {
    return run_synthesis(env, text, lang, instruct, nullptr, nullptr, outPath);
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeCloneVoice(
    JNIEnv * env, jobject, jstring text, jstring lang, jfloatArray ref,
    jstring refText, jstring outPath) {
    return run_synthesis(env, text, lang, nullptr, ref, refText, outPath);
}

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeReleaseModel(JNIEnv *, jobject) {
    if (g_ov) { ov_free(g_ov); g_ov = nullptr; LOGD("Model released"); }
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeIsModelReady(JNIEnv *, jobject) {
    return g_ov ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetSampleRate(JNIEnv *, jobject) {
    return 24000;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetLastError(JNIEnv * env, jobject) {
    return env->NewStringUTF(g_last_error.c_str());
}

} // extern "C"
