#ifndef QWEN3_TTS_JNI_H
#define QWEN3_TTS_JNI_H

#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeInitModel(
    JNIEnv* env, jobject thiz, jstring modelDir);

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeSynthesize(
    JNIEnv* env, jobject thiz, jstring text);

JNIEXPORT jfloatArray JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeCloneVoice(
    JNIEnv* env, jobject thiz, jstring text, jstring referencePath);

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeReleaseModel(
    JNIEnv* env, jobject thiz);

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeIsModelReady(
    JNIEnv* env, jobject thiz);

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetSampleRate(
    JNIEnv* env, jobject thiz);

#ifdef __cplusplus
}
#endif

#endif // QWEN3_TTS_JNI_H
