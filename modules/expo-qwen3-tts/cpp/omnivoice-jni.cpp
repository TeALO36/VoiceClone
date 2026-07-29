/**
 * OmniVoice JNI bridge — full implementation with WAV loading.
 * Calls omnivoice.cpp C API:
 *   ov_context* ov_init({model_path, codec_path, ...})
 *   ov_synthesize(ov, &params, &out)
 *   ov_free(ov)
 */

#include <jni.h>
#include <string>
#include <vector>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <android/log.h>

#include "omnivoice.h"
#include "wav.h"

#define LOG_TAG "OmniVoiceJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static ov_context* g_ov = nullptr;
static ov_tts_params g_ov_params;

// Helper: read WAV file to float samples at original sample rate
static float* loadWavFile(const char* path, int* n_samples, int* sample_rate) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        LOGE("Cannot open WAV: %s", path);
        return nullptr;
    }
    fseek(f, 0, SEEK_END);
    size_t size = ftell(f);
    fseek(f, 0, SEEK_SET);

    uint8_t* data = (uint8_t*)malloc(size);
    if (!data) { fclose(f); return nullptr; }
    fread(data, 1, size, f);
    fclose(f);

    int T = 0, sr = 0;
    float* audio = read_wav_buf(data, size, &T, &sr);
    free(data);

    if (!audio) return nullptr;

    // Convert interleaved stereo [T,2] to mono by averaging channels
    float* mono = (float*)malloc(T * sizeof(float));
    for (int t = 0; t < T; t++) {
        mono[t] = (audio[t * 2] + audio[t * 2 + 1]) * 0.5f;
    }
    free(audio);

    *n_samples = T;
    *sample_rate = sr;
    return mono;
}

// Called from main JNI file
extern "C" {

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceInitModel(
    JNIEnv* env, jobject thiz, jstring modelDir) {

    if (g_ov) { ov_free(g_ov); g_ov = nullptr; }

    const char* path = env->GetStringUTFChars(modelDir, nullptr);
    LOGD("Loading OmniVoice from: %s", path);

    std::string model_path = std::string(path) + "/omnivoice-base-Q4_K_M.gguf";
    std::string codec_path = std::string(path) + "/omnivoice-tokenizer-Q8_0.gguf";

    // Verify files exist
    FILE* test = fopen(model_path.c_str(), "rb");
    if (!test) {
        LOGE("Model file not found: %s", model_path.c_str());
        env->ReleaseStringUTFChars(modelDir, path);
        return JNI_FALSE;
    }
    fclose(test);

    test = fopen(codec_path.c_str(), "rb");
    if (!test) {
        LOGE("Codec file not found: %s", codec_path.c_str());
        env->ReleaseStringUTFChars(modelDir, path);
        return JNI_FALSE;
    }
    fclose(test);

    ov_init_params init_params;
    ov_init_default_params(&init_params);
    init_params.model_path = model_path.c_str();
    init_params.codec_path = codec_path.c_str();
    init_params.use_fa = false;
    init_params.clamp_fp16 = false;

    g_ov = ov_init(&init_params);
    env->ReleaseStringUTFChars(modelDir, path);

    if (!g_ov) {
        const char* err = ov_last_error();
        LOGE("OmniVoice init failed: %s", err ? err : "unknown");
        return JNI_FALSE;
    }

    ov_tts_default_params(&g_ov_params);
    LOGD("OmniVoice loaded successfully");
    return JNI_TRUE;
}

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceSynthesize(
    JNIEnv* env, jobject thiz, jstring text, jstring lang) {

    if (!g_ov) { LOGE("OmniVoice not loaded"); return nullptr; }

    const char* txt = env->GetStringUTFChars(text, nullptr);
    const char* lng = lang ? env->GetStringUTFChars(lang, nullptr) : nullptr;
    LOGD("OmniVoice synthesize: %s", txt);

    g_ov_params.text = txt;
    g_ov_params.lang = lng ? lng : "";
    g_ov_params.instruct = nullptr;
    // Clear any reference from previous calls
    g_ov_params.ref_audio_24k = nullptr;
    g_ov_params.ref_n_samples = 0;
    g_ov_params.ref_text = nullptr;
    g_ov_params.ref_audio_tokens = nullptr;
    g_ov_params.ref_T = 0;

    struct ov_audio out = {0};
    enum ov_status rc = ov_synthesize(g_ov, &g_ov_params, &out);

    env->ReleaseStringUTFChars(text, txt);
    if (lang) env->ReleaseStringUTFChars(lang, lng);

    if (rc != OV_STATUS_OK || out.n_samples <= 0) {
        const char* err = ov_last_error();
        LOGE("OmniVoice synthesis failed: %s (rc=%d)", err ? err : "unknown", rc);
        return nullptr;
    }

    jsize len = out.n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) { env->SetFloatArrayRegion(result, 0, len, out.samples); }
    ov_audio_free(&out);
    return result;
}

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceCloneVoice(
    JNIEnv* env, jobject thiz, jstring text, jstring referencePath, jstring lang) {

    if (!g_ov) { LOGE("OmniVoice not loaded"); return nullptr; }

    const char* txt = env->GetStringUTFChars(text, nullptr);
    const char* ref = env->GetStringUTFChars(referencePath, nullptr);
    const char* lng = lang ? env->GetStringUTFChars(lang, nullptr) : nullptr;
    LOGD("OmniVoice clone: %s, ref: %s", txt, ref);

    // Load reference WAV using omnivoice's built-in reader
    int ref_samples = 0, ref_sr = 0;
    float* ref_audio = loadWavFile(ref, &ref_samples, &ref_sr);

    g_ov_params.text = txt;
    g_ov_params.lang = lng ? lng : "";
    g_ov_params.instruct = nullptr;

    if (ref_audio && ref_samples > 0 && ref_sr > 0) {
        LOGD("Reference loaded: %d samples @ %d Hz", ref_samples, ref_sr);
        g_ov_params.ref_audio_24k = ref_audio;
        g_ov_params.ref_n_samples = ref_samples;
        g_ov_params.ref_text = nullptr;
        g_ov_params.ref_audio_tokens = nullptr;
        g_ov_params.ref_T = 0;
    } else {
        LOGE("Failed to load reference WAV, falling back to basic synthesis");
        g_ov_params.ref_audio_24k = nullptr;
        g_ov_params.ref_n_samples = 0;
    }

    struct ov_audio out = {0};
    enum ov_status rc = ov_synthesize(g_ov, &g_ov_params, &out);

    env->ReleaseStringUTFChars(text, txt);
    env->ReleaseStringUTFChars(referencePath, ref);
    if (lang) env->ReleaseStringUTFChars(lang, lng);
    if (ref_audio) free(ref_audio);

    if (rc != OV_STATUS_OK || out.n_samples <= 0) {
        const char* err = ov_last_error();
        LOGE("OmniVoice cloning failed: %s (rc=%d)", err ? err : "unknown", rc);
        return nullptr;
    }

    jsize len = out.n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) { env->SetFloatArrayRegion(result, 0, len, out.samples); }
    ov_audio_free(&out);
    return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceReleaseModel(
    JNIEnv* env, jobject thiz) {
    if (g_ov) { ov_free(g_ov); g_ov = nullptr; LOGD("OmniVoice released"); }
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceIsReady(
    JNIEnv* env, jobject thiz) {
    return g_ov ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceGetSampleRate(
    JNIEnv* env, jobject thiz) {
    return 24000;
}

} // extern "C"
