/**
 * JNI bridge: connects the Kotlin Expo module to qwen3-tts.cpp C API.
 *
 * Uses qwen3tts_c_api.h:
 *   Qwen3Tts* qwen3_tts_create(model_dir, n_threads)
 *   Qwen3TtsAudio* qwen3_tts_synthesize(tts, text, params)
 *   Qwen3TtsAudio* qwen3_tts_synthesize_with_voice_file(tts, text, ref, params)
 *   void qwen3_tts_free_audio(audio)
 *   void qwen3_tts_destroy(tts)
 */

#include <jni.h>
#include <string>
#include <android/log.h>

#include "qwen3tts_c_api.h"

#define LOG_TAG "Qwen3TtsJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static Qwen3Tts* g_tts = nullptr;
static Qwen3TtsParams g_params;

static void init_default_params() {
    qwen3_tts_default_params(&g_params);
}

extern "C" {

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeInitModel(
    JNIEnv* env, jobject thiz, jstring modelDir) {

    if (g_tts) {
        qwen3_tts_destroy(g_tts);
        g_tts = nullptr;
    }

    const char* path = env->GetStringUTFChars(modelDir, nullptr);
    LOGD("Loading model from: %s", path);

    init_default_params();
    g_tts = qwen3_tts_create(path, g_params.n_threads);

    env->ReleaseStringUTFChars(modelDir, path);

    if (!g_tts) {
        LOGE("Failed to load model");
        return JNI_FALSE;
    }

    LOGD("Model loaded successfully");
    return JNI_TRUE;
}

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeSynthesize(
    JNIEnv* env, jobject thiz, jstring text) {

    if (!g_tts) {
        LOGE("Model not loaded");
        return nullptr;
    }

    const char* txt = env->GetStringUTFChars(text, nullptr);
    LOGD("Synthesizing: %s", txt);

    Qwen3TtsAudio* audio = qwen3_tts_synthesize(g_tts, txt, &g_params);
    env->ReleaseStringUTFChars(text, txt);

    if (!audio) {
        const char* err = qwen3_tts_get_error(g_tts);
        LOGE("Synthesis failed: %s", err ? err : "unknown");
        return nullptr;
    }

    jsize len = audio->n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) {
        env->SetFloatArrayRegion(result, 0, len, audio->samples);
    }
    qwen3_tts_free_audio(audio);
    return result;
}

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeCloneVoice(
    JNIEnv* env, jobject thiz, jstring text, jstring referencePath) {

    if (!g_tts) {
        LOGE("Model not loaded");
        return nullptr;
    }

    const char* txt = env->GetStringUTFChars(text, nullptr);
    const char* ref = env->GetStringUTFChars(referencePath, nullptr);
    LOGD("Voice cloning — text: %s, ref: %s", txt, ref);

    Qwen3TtsAudio* audio = qwen3_tts_synthesize_with_voice_file(g_tts, txt, ref, &g_params);

    env->ReleaseStringUTFChars(text, txt);
    env->ReleaseStringUTFChars(referencePath, ref);

    if (!audio) {
        const char* err = qwen3_tts_get_error(g_tts);
        LOGE("Voice cloning failed: %s", err ? err : "unknown");
        return nullptr;
    }

    jsize len = audio->n_samples;
    jfloatArray result = env->NewFloatArray(len);
    if (result) {
        env->SetFloatArrayRegion(result, 0, len, audio->samples);
    }
    qwen3_tts_free_audio(audio);
    return result;
}

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeReleaseModel(
    JNIEnv* env, jobject thiz) {
    if (g_tts) {
        qwen3_tts_destroy(g_tts);
        g_tts = nullptr;
        LOGD("Model released");
    }
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeIsModelReady(
    JNIEnv* env, jobject thiz) {
    return (g_tts && qwen3_tts_is_loaded(g_tts)) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetSampleRate(
    JNIEnv* env, jobject thiz) {
    return g_tts ? qwen3_tts_sample_rate(g_tts) : 24000;
}

} // extern "C"
