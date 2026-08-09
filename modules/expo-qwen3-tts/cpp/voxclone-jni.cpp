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
#include <dlfcn.h>

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <chrono>
#include <algorithm>

#include "omnivoice.h"
#include "qwen3tts_c_api.h"
#include "sherpa-onnx-c-api.h"

#define LOG_TAG "VoxCloneJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

// The engines live in this binary and share one ggml build. Exactly one is
// loaded at a time; the JS layer says which, because only it knows whether the
// downloaded files are an OmniVoice, a Qwen3-TTS or a Pocket TTS model.
// Guessing from the files is what produced "ov_init: pipeline_tts_load failed"
// on a Qwen3 model.
enum Engine { ENGINE_NONE = 0, ENGINE_OMNIVOICE = 1, ENGINE_QWEN3 = 2, ENGINE_POCKET = 3 };

ov_context *    g_ov     = nullptr;
Qwen3Tts *      g_q3     = nullptr;
Qwen3TtsParams  g_q3_params;
Engine          g_engine = ENGINE_NONE;
std::string     g_last_error;

// ── Pocket TTS (sherpa-onnx) ──────────────────────────────────────────────
// Pocket TTS runs through sherpa-onnx's C API, which ships as a prebuilt
// shared library (libsherpa-onnx-c-api.so + libonnxruntime.so, see
// scripts/fetch-sherpa-onnx-android.sh). It is dlopen'd at runtime rather than
// linked at build time so the CMake build stays untouched: the three ggml
// engines and Pocket TTS are otherwise independent runtimes with no shared
// symbols. dlopen failure degrades to a clear error instead of a load failure
// of the whole module.
struct PocketApi {
    void * handle = nullptr;
    decltype(&SherpaOnnxCreateOfflineTts) create = nullptr;
    decltype(&SherpaOnnxDestroyOfflineTts) destroy = nullptr;
    decltype(&SherpaOnnxOfflineTtsGenerateWithConfig) generate = nullptr;
    decltype(&SherpaOnnxDestroyOfflineTtsGeneratedAudio) free_audio = nullptr;
    decltype(&SherpaOnnxWriteWave) write_wave = nullptr;
    decltype(&SherpaOnnxOfflineTtsSampleRate) sample_rate = nullptr;

    bool loaded() const { return handle && create && destroy && generate && free_audio && write_wave && sample_rate; }
};

PocketApi g_pocket_api;
const SherpaOnnxOfflineTts * g_pocket = nullptr;
std::string g_last_model_dir;

bool load_pocket_api() {
    if (g_pocket_api.loaded()) return true;
    if (g_pocket_api.handle) return false;   // tried and failed before

    const char * lib = "libsherpa-onnx-c-api.so";
    void * handle = dlopen(lib, RTLD_NOW | RTLD_GLOBAL);
    if (!handle) {
        LOGE("dlopen(%s) failed: %s", lib, dlerror());
        g_last_error = "Bibliothèque Pocket TTS introuvable. Lancez scripts/fetch-sherpa-onnx-android.sh puis reconstruisez.";
        return false;
    }

    g_pocket_api.handle = handle;
    g_pocket_api.create      = (decltype(&SherpaOnnxCreateOfflineTts))dlsym(handle, "SherpaOnnxCreateOfflineTts");
    g_pocket_api.destroy     = (decltype(&SherpaOnnxDestroyOfflineTts))dlsym(handle, "SherpaOnnxDestroyOfflineTts");
    g_pocket_api.generate    = (decltype(&SherpaOnnxOfflineTtsGenerateWithConfig))dlsym(handle, "SherpaOnnxOfflineTtsGenerateWithConfig");
    g_pocket_api.free_audio  = (decltype(&SherpaOnnxDestroyOfflineTtsGeneratedAudio))dlsym(handle, "SherpaOnnxDestroyOfflineTtsGeneratedAudio");
    g_pocket_api.write_wave  = (decltype(&SherpaOnnxWriteWave))dlsym(handle, "SherpaOnnxWriteWave");
    g_pocket_api.sample_rate = (decltype(&SherpaOnnxOfflineTtsSampleRate))dlsym(handle, "SherpaOnnxOfflineTtsSampleRate");

    if (!g_pocket_api.loaded()) {
        LOGE("Pocket TTS: missing symbols in %s", lib);
        g_last_error = "Bibliothèque Pocket TTS incomplète (symboles manquants).";
        return false;
    }
    LOGD("Pocket TTS C API loaded");
    return true;
}

void set_error(const char * what) {
    const char * detail = (g_engine == ENGINE_QWEN3 && g_q3)
                              ? qwen3_tts_get_error(g_q3)
                              : ov_last_error();
    g_last_error = what;
    if (detail && *detail) {
        g_last_error += ": ";
        g_last_error += detail;
    }
    LOGE("%s", g_last_error.c_str());
}

/**
 * Qwen3-TTS conditions on a numeric language id, not on the ISO string that
 * OmniVoice takes. Values mirror qwen3-tts.cpp's own CLI table. The model
 * covers ten languages; anything else falls back to English, which is also what
 * qwen3_tts_default_params does.
 */
int32_t qwen3_language_id(const std::string & iso) {
    if (iso == "en") return 2050;
    if (iso == "de") return 2053;
    if (iso == "es") return 2054;
    if (iso == "zh") return 2055;
    if (iso == "ja") return 2058;
    if (iso == "fr") return 2061;
    if (iso == "ko") return 2064;
    if (iso == "ru") return 2069;
    if (iso == "it") return 2070;
    if (iso == "pt") return 2071;
    return 2050;
}

/**
 * Cap on generated audio tokens, scaled to the text.
 *
 * The default of 4096 allows roughly five minutes of audio at 12.5 Hz, so a
 * sampler that fails to emit end-of-sequence can run for far longer than the
 * text warrants — a single word coming back as ten seconds of speech. Budget
 * generously (a slow speaker needs about one second per ten characters) then
 * add headroom, so normal output is never truncated.
 */
int32_t token_budget_for(const std::string & text) {
    const double seconds = 3.0 + (double)text.size() / 5.0;
    const int32_t tokens = (int32_t)(seconds * 12.5);
    return tokens < 64 ? 64 : (tokens > 4096 ? 4096 : tokens);
}

void release_all() {
    if (g_ov) { ov_free(g_ov); g_ov = nullptr; }
    if (g_q3) { qwen3_tts_destroy(g_q3); g_q3 = nullptr; }
    if (g_pocket && g_pocket_api.destroy) { g_pocket_api.destroy(g_pocket); g_pocket = nullptr; }
    g_engine = ENGINE_NONE;
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

/** Read mono float PCM from a 16-bit WAV. */
bool read_wav(const std::string & path, std::vector<float>& out_samples, int& out_sample_rate) {
    FILE * f = std::fopen(path.c_str(), "rb");
    if (!f) {
        LOGE("Cannot open input WAV: %s", path.c_str());
        return false;
    }
    
    uint8_t header[44];
    if (std::fread(header, 1, sizeof(header), f) != sizeof(header)) {
        std::fclose(f);
        return false;
    }
    
    if (std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVEfmt ", 8) != 0) {
        std::fclose(f);
        return false;
    }
    
    out_sample_rate = header[24] | (header[25] << 8) | (header[26] << 16) | (header[27] << 24);
    uint32_t data_bytes = header[40] | (header[41] << 8) | (header[42] << 16) | (header[43] << 24);
    uint32_t num_samples = data_bytes / 2;
    
    std::vector<int16_t> pcm(num_samples);
    if (std::fread(pcm.data(), sizeof(int16_t), num_samples, f) != num_samples) {
        LOGE("Short read on %s", path.c_str());
    }
    
    std::fclose(f);
    
    out_samples.resize(num_samples);
    for (size_t i = 0; i < num_samples; i++) {
        out_samples[i] = pcm[i] / 32768.0f;
    }
    
    return true;
}

/**
 * Shared body of synthesize/cloneVoice. `ref` may be null for plain TTS.
 * Returns the number of samples written, or -1 on failure.
 */
jint run_synthesis(JNIEnv * env,
                   jstring     jText,
                   jstring     jLang,
                   jstring     jInstruct,
                   jstring     jRefPath,
                   jstring     jRefText,
                   jint        jSteps,
                   jstring     jOutPath) {

    if (g_engine == ENGINE_NONE) {
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

    // ── Qwen3-TTS path ──
    // Its C API takes the reference WAV as a file path and owns the decoding,
    // so no resampling happens here.
    if (g_engine == ENGINE_QWEN3) {
        const std::string ref_path = jstr(env, jRefPath);

        // Per-call, not baked into the loaded model: language and length both
        // depend on what is being spoken. Leaving language_id at its default
        // meant every generation came out English whatever the user picked.
        Qwen3TtsParams params = g_q3_params;
        params.language_id      = qwen3_language_id(lang);
        params.max_audio_tokens = token_budget_for(text);
        LOGD("Qwen3: lang=%s id=%d budget=%d tokens",
             lang.c_str(), params.language_id, params.max_audio_tokens);

        Qwen3TtsAudio * audio = ref_path.empty()
            ? qwen3_tts_synthesize(g_q3, text.c_str(), &params)
            : qwen3_tts_synthesize_with_voice_file(g_q3, text.c_str(),
                                                   ref_path.c_str(), &params);

        if (!audio || audio->n_samples <= 0) {
            set_error(ref_path.empty() ? "Synthesis failed" : "Voice cloning failed");
            if (audio) qwen3_tts_free_audio(audio);
            return -1;
        }

        const bool ok = write_wav(out_path, audio->samples, audio->n_samples,
                                  audio->sample_rate > 0 ? audio->sample_rate : 24000);
        const int n = audio->n_samples;
        qwen3_tts_free_audio(audio);

        if (!ok) {
            g_last_error = "Could not write output WAV";
            return -1;
        }
        LOGD("Qwen3 wrote %d samples to %s", n, out_path.c_str());
        return (jint)n;
    }

    // ── Pocket TTS path (sherpa-onnx) ──
    // Pocket TTS is zero-shot: it always speaks with a reference voice, so the
    // JS layer supplies one (a user clip, or the bundled default voice for
    // plain TTS). If it somehow arrives empty, fall back to the bundled voice.
    if (g_engine == ENGINE_POCKET) {
        if (!g_pocket_api.loaded() || !g_pocket) {
            g_last_error = "Pocket TTS non chargé";
            LOGE("%s", g_last_error.c_str());
            return -1;
        }

        std::string ref_path = jstr(env, jRefPath);
        if (ref_path.empty()) {
            const std::string model_dir = g_last_model_dir;
            ref_path = model_dir + "/voices/bria.wav";
            LOGD("Pocket: no reference, using bundled default voice %s", ref_path.c_str());
        }

        std::vector<float> ref_audio;
        int ref_sample_rate = 24000;
        if (!ref_path.empty()) {
            if (!read_wav(ref_path, ref_audio, ref_sample_rate)) {
                g_last_error = "Impossible de lire l'extrait de référence : " + ref_path;
                LOGE("%s", g_last_error.c_str());
                return -1;
            }
            if (ref_sample_rate != 24000) {
                LOGD("Pocket: reference sample rate %d (expecting 24000)", ref_sample_rate);
            }
        }

        SherpaOnnxGenerationConfig cfg;
        std::memset(&cfg, 0, sizeof(cfg));
        cfg.silence_scale       = 0.2f;
        cfg.speed               = 1.0f;
        cfg.reference_audio     = ref_audio.empty() ? nullptr : ref_audio.data();
        cfg.reference_audio_len = (int32_t)ref_audio.size();
        cfg.reference_sample_rate = ref_audio.empty() ? 0 : ref_sample_rate;
        cfg.reference_text      = ref_text.empty() ? nullptr : ref_text.c_str();
        if (jSteps > 0) cfg.num_steps = (int32_t)jSteps;   // JS maps quality -> 1/2/4

        // The 24-layer French model is a preview export with jittery EOS
        // detection: sherpa's default (3 frames after EOS) often cuts the tail
        // of the last word and shortens the whole utterance. Kyutai's config
        // for french_24l sets model_recommended_frames_after_eos: 8, so the
        // French model gets that bump. The base models (en/de/pt/it/es) are
        // calibrated for the default and are left untouched.
        const bool fr_model = (lang.compare(0, 2, "fr") == 0);

        // sherpa seeds its sampler from `extra.seed` (-1 = random each call).
        // Generation is stochastic, so when EOS fires mid-word the truncated
        // result is retried with a fresh seed until the utterance ends cleanly.
        auto fresh_seed = []() -> int {
            static uint64_t counter = 0;
            counter++;
            const uint64_t t = (uint64_t)std::chrono::steady_clock::now()
                                   .time_since_epoch().count();
            return (int)((t ^ (counter * 0x9E3779B97F4A7C15ULL)) & 0x7FFFFFFF);
        };

        const SherpaOnnxGeneratedAudio * audio = nullptr;
        const int kMaxAttempts = 3;
        for (int attempt = 0; attempt < kMaxAttempts; ++attempt) {
            std::string extra_json =
                "{\"seed\": \"" + std::to_string(fresh_seed()) + "\"";
            if (fr_model) extra_json += ", \"frames_after_eos\": \"8\"";
            extra_json += "}";
            cfg.extra = extra_json.c_str();   // valid until the next generate()

            if (audio) { g_pocket_api.free_audio(audio); audio = nullptr; }
            audio = g_pocket_api.generate(g_pocket, text.c_str(), &cfg,
                                          nullptr, nullptr);
            if (!audio || audio->n <= 0) {
                g_last_error = "Pocket TTS generation failed";
                if (audio) g_pocket_api.free_audio(audio);
                LOGE("%s", g_last_error.c_str());
                return -1;
            }

            // Truncation check: if the final ~80 ms still carries speech-level
            // energy, EOS fired while the last word was sounding. Retry.
            const int32_t sr = audio->sample_rate > 0 ? audio->sample_rate : 24000;
            const int32_t tail = (int32_t)std::min<size_t>(audio->n, (size_t)(sr * 0.08));
            float peak = 0.0f;
            for (int32_t i = audio->n - tail; i < audio->n; ++i) {
                const float v = audio->samples[i] < 0 ? -audio->samples[i]
                                                      : audio->samples[i];
                if (v > peak) peak = v;
            }
            if (peak < 0.02f || attempt == kMaxAttempts - 1) break;
            LOGD("Pocket: truncated ending (tail peak %.3f), retrying %d/%d",
                 peak, attempt + 1, kMaxAttempts);
        }

        const bool ok = g_pocket_api.write_wave(audio->samples, audio->n,
                                                audio->sample_rate > 0 ? audio->sample_rate : 24000,
                                                out_path.c_str());
        const int n = audio->n;
        g_pocket_api.free_audio(audio);

        if (!ok) {
            g_last_error = "Could not write output WAV";
            return -1;
        }
        LOGD("Pocket TTS wrote %d samples to %s", n, out_path.c_str());
        return (jint)n;
    }

    // ── OmniVoice path ──
    ov_tts_params p;
    ov_tts_default_params(&p);
    p.text = text.c_str();
    p.lang = lang.c_str();
    p.instruct = instruct.empty() ? nullptr : instruct.c_str();

    // The MaskGIT step count is the dominant cost: time scales linearly with it
    // and the upstream default of 32 is far too slow on a phone. Measured on a
    // desktop, cloning 1.8 s of audio took 68 s at 32 steps and 17 s at 8.
    if (jSteps > 0) p.mg_num_step = (int)jSteps;

    // Reference samples stay pinned for the whole ov_synthesize call.
    std::vector<float> ref_audio;
    int ref_sample_rate = 24000;
    if (jRefPath) {
        const std::string ref_path = jstr(env, jRefPath);
        if (!ref_path.empty()) {
            if (read_wav(ref_path, ref_audio, ref_sample_rate)) {
                // If it's not 24kHz, we ideally should resample, but we assume the caller provided 24kHz
                p.ref_audio_24k = ref_audio.data();
                p.ref_n_samples = (int)ref_audio.size();
                if (!ref_text.empty()) p.ref_text = ref_text.c_str();
                LOGD("Cloning with %d reference samples (%.1fs)", (int)ref_audio.size(), ref_audio.size() / (double)ref_sample_rate);
            }
        }
    }

    ov_audio out = {0};
    const ov_status rc = ov_synthesize(g_ov, &p, &out);

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
    JNIEnv * env, jobject, jstring jModelDir, jstring jModelPath,
    jstring jCodecPath, jstring jEngine) {

    release_all();

    const std::string model_dir  = jstr(env, jModelDir);
    const std::string model_path = jstr(env, jModelPath);
    const std::string codec_path = jstr(env, jCodecPath);
    const std::string engine     = jstr(env, jEngine);

    g_last_model_dir = model_dir;

    if (engine == "pocket") {
        if (!load_pocket_api()) {
            // load_pocket_api already filled g_last_error with the precise cause.
            LOGE("%s", g_last_error.c_str());
            return JNI_FALSE;
        }

        // Resolve the exact filenames sherpa-onnx expects inside the model dir.
        // int8 packages name the quantized models `*.int8.onnx`; fp32 packages
        // (haute fidélité) drop the suffix. Prefer the int8 name when it is
        // present so old installs keep working, else fall back to the fp32 one.
        auto file_path = [&](const char * name) -> std::string {
            return model_dir + "/" + name;
        };
        auto exists = [&](const std::string & p) -> bool {
            FILE * f = std::fopen(p.c_str(), "rb");
            if (f) { std::fclose(f); return true; }
            return false;
        };
        auto resolve = [&](const char * int8_name, const char * fp32_name) -> std::string {
            std::string p = file_path(int8_name);
            return exists(p) ? p : file_path(fp32_name);
        };

        SherpaOnnxOfflineTtsConfig config;
        std::memset(&config, 0, sizeof(config));
        config.model.num_threads = 2;
        config.model.debug = 0;
        config.model.provider = "cpu";
        config.model.pocket.lm_flow            = strdup(resolve("lm_flow.int8.onnx", "lm_flow.onnx").c_str());
        config.model.pocket.lm_main            = strdup(resolve("lm_main.int8.onnx", "lm_main.onnx").c_str());
        config.model.pocket.encoder            = strdup(file_path("encoder.onnx").c_str());
        config.model.pocket.decoder            = strdup(resolve("decoder.int8.onnx", "decoder.onnx").c_str());
        config.model.pocket.text_conditioner   = strdup(file_path("text_conditioner.onnx").c_str());
        config.model.pocket.vocab_json         = strdup(file_path("vocab.json").c_str());
        config.model.pocket.token_scores_json  = strdup(file_path("token_scores.json").c_str());
        config.max_num_sentences = 1;
        config.silence_scale = 0.2f;

        bool missing = false;
        const char * required[] = {
            config.model.pocket.lm_flow, config.model.pocket.lm_main,
            config.model.pocket.encoder, config.model.pocket.decoder,
            config.model.pocket.text_conditioner, config.model.pocket.vocab_json,
            config.model.pocket.token_scores_json
        };
        for (const char * p : required) {
            if (!exists(p)) { missing = true; LOGD("Pocket: missing file %s", p); }
        }

        if (missing) {
            g_last_error = "Modèle Pocket TTS incomplet (fichiers .onnx/.json manquants dans " + model_dir + ")";
            LOGE("%s", g_last_error.c_str());
            for (const char * p : required) free((void *)p);
            return JNI_FALSE;
        }

        g_pocket = g_pocket_api.create(&config);
        for (const char * p : required) free((void *)p);

        if (!g_pocket) {
            g_last_error = "Échec de chargement du modèle Pocket TTS (sherpa-onnx).";
            LOGE("%s", g_last_error.c_str());
            return JNI_FALSE;
        }

        g_engine = ENGINE_POCKET;
        g_last_error.clear();
        LOGD("Pocket TTS ready (sample rate %d)", g_pocket_api.sample_rate(g_pocket));
        return JNI_TRUE;
    }

    if (engine == "qwen3") {
        // qwen3-tts.cpp resolves its own filenames inside the directory.
        LOGD("Loading Qwen3-TTS from dir=%s", model_dir.c_str());
        qwen3_tts_default_params(&g_q3_params);
        g_q3 = qwen3_tts_create(model_dir.c_str(), g_q3_params.n_threads);
        if (!g_q3 || !qwen3_tts_is_loaded(g_q3)) {
            g_engine = ENGINE_QWEN3;   // so set_error reads the Qwen3 error slot
            set_error("Qwen3-TTS load failed");
            if (g_q3) { qwen3_tts_destroy(g_q3); g_q3 = nullptr; }
            g_engine = ENGINE_NONE;
            return JNI_FALSE;
        }
        g_engine = ENGINE_QWEN3;
        g_last_error.clear();
        LOGD("Qwen3-TTS ready");
        return JNI_TRUE;
    }

    LOGD("Loading OmniVoice model=%s codec=%s", model_path.c_str(), codec_path.c_str());

    ov_init_params ip;
    ov_init_default_params(&ip);
    ip.model_path = model_path.c_str();
    ip.codec_path = codec_path.c_str();
    ip.use_fa     = false;  // CPU-only backend on Android
    ip.clamp_fp16 = false;

    g_ov = ov_init(&ip);
    if (!g_ov) {
        set_error("OmniVoice load failed");
        return JNI_FALSE;
    }

    g_engine = ENGINE_OMNIVOICE;
    g_last_error.clear();
    LOGD("OmniVoice ready");
    return JNI_TRUE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeSynthesize(
    JNIEnv * env, jobject, jstring text, jstring lang, jstring instruct,
    jint steps, jstring outPath) {
    return run_synthesis(env, text, lang, instruct, nullptr, nullptr, steps, outPath);
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeCloneVoice(
    JNIEnv * env, jobject, jstring text, jstring lang, jstring refPath,
    jstring refText, jint steps, jstring outPath) {
    return run_synthesis(env, text, lang, nullptr, refPath, refText, steps, outPath);
}

JNIEXPORT void JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeReleaseModel(JNIEnv *, jobject) {
    release_all();
    LOGD("Model released");
}

JNIEXPORT jboolean JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeIsModelReady(JNIEnv *, jobject) {
    return g_engine != ENGINE_NONE ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetSampleRate(JNIEnv *, jobject) {
    if (g_engine == ENGINE_POCKET && g_pocket && g_pocket_api.sample_rate) {
        return g_pocket_api.sample_rate(g_pocket);
    }
    return 24000;
}

JNIEXPORT jstring JNICALL
Java_expo_modules_qwen3tts_ExpoQwen3TtsModule_nativeGetLastError(JNIEnv * env, jobject) {
    return env->NewStringUTF(g_last_error.c_str());
}

} // extern "C"
