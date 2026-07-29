/**
 * OmniVoice JNI bridge for the same Kotlin module.
 * Calls omnivoice.cpp C API:
 *   ov_context* ov_init({model_path, codec_path, ...})
 *   ov_synthesize(ov, &params, &out)
 *   ov_free(ov)
 */

#include <jni.h>
#include <string>
#include <android/log.h>

#include "omnivoice.h"

#define LOG_TAG "OmniVoiceJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static ov_context* g_ov = nullptr;
static ov_tts_params g_ov_params;

// These are called from the main JNI file if the model is OmniVoice
extern "C" {

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceInitModel(
    JNIEnv* env, jobject thiz, jstring modelDir) {

    if (g_ov) {
        ov_free(g_ov);
        g_ov = nullptr;
    }

    const char* path = env->GetStringUTFChars(modelDir, nullptr);
    LOGD("Loading OmniVoice from: %s", path);

    // OmniVoice needs two GGUF files: LM and codec
    std::string model_path = std::string(path) + "/omnivoice-base-Q4_K_M.gguf";
    std::string codec_path = std::string(path) + "/omnivoice-tokenizer-Q8_0.gguf";

    ov_init_params init_params;
    ov_init_default_params(&init_params);
    init_params.model_path = model_path.c_str();
    init_params.codec_path = codec_path.c_str();
    init_params.use_fa = false;  // no flash attention on CPU
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
    LOGD("OmniVoice synthesize: %s (lang: %s)", txt, lng ? lng : "auto");

    g_ov_params.text = txt;
    g_ov_params.lang = lng ? lng : "";
    g_ov_params.instruct = nullptr;  // no voice design for basic synthesis

    struct ov_audio out = {0};
    enum ov_status rc = ov_synthesize(g_ov, &g_ov_params, &out);

    env->ReleaseStringUTFChars(text, txt);
    if (lang) env->ReleaseStringUTFChars(lang, lng);

    if (rc != OV_STATUS_OK || out.n_samples <= 0) {
        const char* err = ov_last_error();
        LOGE("OmniVoice synthesis failed: %s", err ? err : "unknown");
        return nullptr;
    }

    jsize len = out.n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) {
        env->SetFloatArrayRegion(result, 0, len, out.samples);
    }
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

    // Load reference audio
    std::vector<float> ref_samples;
    int ref_sr = 0;
    // Simple WAV loader for the reference
    // (The omnivoice C API expects raw float samples at 24kHz)
    // TODO: actual WAV file reading needed here for production
    // For now, pass NULL ref to do basic synthesis as fallback
    g_ov_params.text = txt;
    g_ov_params.lang = lng ? lng : "";
    g_ov_params.instruct = nullptr;
    g_ov_params.ref_audio_24k = nullptr;
    g_ov_params.ref_n_samples = 0;

    struct ov_audio out = {0};
    enum ov_status rc = ov_synthesize(g_ov, &g_ov_params, &out);

    env->ReleaseStringUTFChars(text, txt);
    env->ReleaseStringUTFChars(referencePath, ref);
    if (lang) env->ReleaseStringUTFChars(lang, lng);

    if (rc != OV_STATUS_OK || out.n_samples <= 0) {
        LOGE("OmniVoice cloning failed");
        return nullptr;
    }

    jsize len = out.n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) {
        env->SetFloatArrayRegion(result, 0, len, out.samples);
    }
    ov_audio_free(&out);
    return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_omnivoiceReleaseModel(
    JNIEnv* env, jobject thiz) {
    if (g_ov) {
        ov_free(g_ov);
        g_ov = nullptr;
        LOGD("OmniVoice released");
    }
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
