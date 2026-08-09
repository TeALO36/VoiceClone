/**
 * On-device TTS service — drives the native engines (OmniVoice, Qwen3-TTS,
 * Pocket TTS) and applies the user's advanced speech parameters on top.
 *
 * Pipeline (see audio-pipeline.ts): the text is split at punctuation, each
 * segment is synthesized by the loaded engine, and the segments are glued back
 * with configurable pauses, then time-stretched to the requested speed and
 * gain-adjusted. When every parameter is at its default, a single engine call
 * is made and the audio is returned untouched for the best natural prosody.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import ExpoQwen3TtsModule, {
  QUALITY_STEPS,
  POCKET_QUALITY_STEPS,
} from '@/modules/expo-qwen3-tts/src/ExpoQwen3TtsModule';
import type { Qwen3TtsResult, TtsEngine, Quality } from '@/modules/expo-qwen3-tts';
import {
  DEFAULT_SPEECH_PARAMS,
  type SpeechParams,
  type WavData,
  type PunctuationKind,
  segmentTextWithPauses,
  isDefaultParams,
  pauseFor,
  concatSegments,
  applyVolume,
  timeStretch,
  wavDecode,
  wavEncode,
} from './audio-pipeline';

export type { Qwen3TtsResult, SpeechParams };
export { DEFAULT_SPEECH_PARAMS };
export type { TtsEngine, Quality };

export interface TTSOptions {
  text: string;
  language?: string;
  modelDir: string;
  /** Which engine the files in modelDir belong to. Formats are not interchangeable. */
  engine: TtsEngine;
  /** OmniVoice voice-design attributes, e.g. "female young adult moderate". */
  instruct?: string;
  /** Trades generation time against fidelity. Defaults to the fastest preset. */
  quality?: Quality;
  /**
   * Prepared reference WAV (24 kHz mono) to speak with. Pocket TTS requires a
   * reference voice even for plain TTS — when absent, the engine's bundled
   * default voice is used.
   */
  referenceAudioUri?: string;
  /** Advanced speech parameters (pauses, speed, volume). Defaults = natural. */
  params?: SpeechParams;
}

export interface CloneOptions {
  text: string;
  referenceAudioUri: string;
  modelDir: string;
  engine: TtsEngine;
  language?: string;
  /**
   * What is actually said in the reference clip. Always optional.
   *
   * OmniVoice concatenates it ahead of the target text to give the model more
   * context against the reference codes, but handles an empty string fine.
   * Qwen3-TTS derives the voice from a speaker encoder and ignores this
   * entirely. Pocket TTS does not need a transcript at all.
   */
  referenceText?: string;
  quality?: Quality;
  /** Advanced speech parameters (pauses, speed, volume). Defaults = natural. */
  params?: SpeechParams;
}

// ─── Language mapping ───
//
// Qwen3-TTS conditions on a fixed set of ten language ids and silently speaks
// English for anything else, so the picker is filtered per engine rather than
// offering choices one of them cannot honour. OmniVoice resolves ISO codes
// against a 646-entry table and covers all of these. Pocket TTS has one
// checkpoint per language (en, fr, de, pt, it, es) converted to ONNX — each
// is a separate catalog entry, so the picker is locked to the model's language.
const QWEN3_LANGUAGES = new Set(['zh', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'pt', 'es', 'it']);
const POCKET_LANGUAGES = new Set(['en', 'fr', 'de', 'pt', 'it', 'es']);

export function getSupportedLanguages(
  engine?: TtsEngine
): { id: string; name: string; flag: string }[] {
  const all = allLanguages();
  if (engine === 'qwen3') return all.filter((l) => QWEN3_LANGUAGES.has(l.id));
  if (engine === 'pocket') return all.filter((l) => POCKET_LANGUAGES.has(l.id));
  return all;
}

/**
 * Languages selectable for a given installed model. Pocket TTS checkpoints
 * are language-specific: the selector is locked to the model's langId.
 */
export function getLanguagesForModel(model?: {
  type?: string;
  langId?: string;
}): { id: string; name: string; flag: string }[] {
  if (model?.type === 'pocket') {
    const langId = model.langId && POCKET_LANGUAGES.has(model.langId) ? model.langId : 'en';
    return allLanguages().filter((l) => l.id === langId);
  }
  return getSupportedLanguages(model?.type as TtsEngine | undefined);
}

function allLanguages(): { id: string; name: string; flag: string }[] {
  return [
    { id: 'fr', name: 'Français', flag: '🇫🇷' },
    { id: 'en', name: 'English', flag: '🇬🇧' },
    { id: 'es', name: 'Español', flag: '🇪🇸' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { id: 'it', name: 'Italiano', flag: '🇮🇹' },
    { id: 'ja', name: '日本語', flag: '🇯🇵' },
    { id: 'zh', name: '中文', flag: '🇨🇳' },
    { id: 'ko', name: '한국어', flag: '🇰🇷' },
    { id: 'ru', name: 'Русский', flag: '🇷🇺' },
    { id: 'pt', name: 'Português', flag: '🇧🇷' },
    { id: 'arb', name: 'العربية', flag: '🇸🇦' },
    { id: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { id: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { id: 'nl', name: 'Nederlands', flag: '🇳🇱' },
    { id: 'pl', name: 'Polski', flag: '🇵🇱' },
  ];
}

// ─── Voice presets ───
// For classic (non-cloned) TTS. Each engine honours them differently:
//  - OmniVoice: instruct strings describing the voice.
//  - Qwen3-TTS: no voice knob — presets are ignored (UI hides them).
//  - Pocket TTS: presets map to bundled reference WAVs inside the model dir.
export const VOICE_PRESETS: Record<string, { label: string; emoji: string }> = {
  'male-neutral': { label: 'Homme neutre', emoji: '👨' },
  'female-neutral': { label: 'Femme neutre', emoji: '👩' },
  'male-deep': { label: 'Homme grave', emoji: '🧔' },
  'female-bright': { label: 'Femme claire', emoji: '👧' },
  'child': { label: 'Enfant', emoji: '👦' },
  'narrator': { label: 'Narrateur', emoji: '🎙️' },
};

const OMNIVOICE_INSTRUCT: Record<string, string> = {
  'male-neutral': 'male adult neutral',
  'female-neutral': 'female adult neutral',
  'male-deep': 'male adult deep calm',
  'female-bright': 'female young adult bright',
  'child': 'child',
  'narrator': 'male adult narrator calm',
};

/** Bundled reference voices shipped with the Pocket TTS model. */
const POCKET_PRESET_FILES: Record<string, string> = {
  'female-neutral': 'voices/bria.wav',
  'female-bright': 'voices/loona.wav',
  'narrator': 'voices/bria.wav',
  'male-neutral': 'voices/loona.wav',
  'male-deep': 'voices/loona.wav',
  'child': 'voices/bria.wav',
};

/**
 * Resolve what a voice preset means for the active engine.
 * Returns null when the engine cannot express the preset (Qwen3-TTS).
 */
export function resolvePresetVoice(
  engine: TtsEngine,
  presetId: string,
  modelDir: string
): { referenceAudioUri?: string; instruct?: string } | null {
  if (engine === 'omnivoice') {
    const instruct = OMNIVOICE_INSTRUCT[presetId];
    return instruct ? { instruct } : null;
  }
  if (engine === 'pocket') {
    const file = POCKET_PRESET_FILES[presetId];
    if (!file) return null;
    return { referenceAudioUri: `${modelDir}/${file}` };
  }
  return null;
}

/** The bundled default reference voice used for Pocket TTS plain TTS. */
export function pocketDefaultReference(modelDir: string): string {
  return `${modelDir}/voices/bria.wav`;
}

function engineSteps(engine: TtsEngine, quality: Quality): number {
  return engine === 'pocket' ? POCKET_QUALITY_STEPS[quality] : QUALITY_STEPS[quality];
}

export class OnDeviceTTSService {
  private currentModelDir: string | null = null;
  private currentEngine: TtsEngine | null = null;

  /**
   * Load a model directory into the native engine.
   * Model must be downloaded first via the models service.
   */
  async initModel(modelDir: string, engine: TtsEngine): Promise<void> {
    if (this.currentModelDir === modelDir && this.currentEngine === engine) {
      if (await ExpoQwen3TtsModule.isModelReady()) return;
    }

    // Switching models: drop the previous one first so two multi-hundred-MB
    // checkpoints are never mapped at the same time.
    if (this.currentModelDir && this.currentModelDir !== modelDir) {
      await this.release();
    }

    await ExpoQwen3TtsModule.initModel(modelDir, engine);
    this.currentModelDir = modelDir;
    this.currentEngine = engine;
  }

  /** Synthesize text to a WAV file on disk and return its URI. */
  async synthesize(options: TTSOptions): Promise<Qwen3TtsResult> {
    if (!options.text.trim()) {
      throw new Error('Le texte ne peut pas être vide');
    }

    await this.initModel(options.modelDir, options.engine);
    const params = { ...DEFAULT_SPEECH_PARAMS, ...(options.params ?? {}) };

    // Pocket TTS has no "plain" synthesis: it always speaks with a reference
    // voice. Without an explicit one, use the bundled default.
    let refAudioUri = options.referenceAudioUri;
    if (options.engine === 'pocket' && !refAudioUri) {
      refAudioUri = pocketDefaultReference(options.modelDir);
    }

    // Pauses and speed need the split/reassemble pipeline. Volume alone can be
    // applied to a single engine call, preserving the engine's prosody.
    const needsPipeline = params.speed !== 1 || !isDefaultParams({ ...params, speed: 1, volume: 1 });

    if (!needsPipeline) {
      const result = refAudioUri
        ? await this.rawCloneVoice({
            text: options.text,
            referenceAudioUri: refAudioUri,
            modelDir: options.modelDir,
            engine: options.engine,
            language: options.language,
            referenceText: '',
            quality: options.quality ?? 'best',
          })
        : await this.rawSynthesize(options);
      return this.applyVolumeIfNeeded(result, options.text, params);
    }

    // Advanced parameters are set: split, synthesize per segment, re-assemble.
    return this.synthesizeWithParams(options, refAudioUri, params);
  }

  /** Clone the voice in `referenceAudioUri` and speak `text` with it. */
  async cloneVoice(options: CloneOptions): Promise<Qwen3TtsResult> {
    if (!options.text.trim()) {
      throw new Error('Le texte ne peut pas être vide');
    }
    if (!options.referenceAudioUri) {
      throw new Error('Aucun extrait de référence sélectionné');
    }

    await this.initModel(options.modelDir, options.engine);
    const params = { ...DEFAULT_SPEECH_PARAMS, ...(options.params ?? {}) };

    const needsPipeline = params.speed !== 1 || !isDefaultParams({ ...params, speed: 1, volume: 1 });
    if (!needsPipeline) {
      const result = await this.rawCloneVoice(options);
      return this.applyVolumeIfNeeded(result, options.text, params);
    }

    return this.cloneWithParams(options, params);
  }

  // ── Raw engine calls (no post-processing — the caller owns params) ──

  private async rawSynthesize(options: TTSOptions): Promise<Qwen3TtsResult> {
    return ExpoQwen3TtsModule.synthesize(
      options.text.trim(),
      options.language ?? '',
      options.instruct ?? '',
      engineSteps(options.engine, options.quality ?? 'best')
    );
  }

  private async rawCloneVoice(options: CloneOptions): Promise<Qwen3TtsResult> {
    return ExpoQwen3TtsModule.cloneVoice(
      options.text.trim(),
      options.language ?? '',
      options.referenceText?.trim() ?? '',
      options.referenceAudioUri,
      engineSteps(options.engine, options.quality ?? 'best')
    );
  }

  // ── Advanced pipeline ────────────────────────────────────────────────

  private async synthesizeWithParams(
    options: TTSOptions,
    refAudioUri: string | undefined,
    params: SpeechParams
  ): Promise<Qwen3TtsResult> {
    const segments = segmentTextWithPauses(options.text);
    if (segments.length === 0) throw new Error('Le texte ne peut pas être vide');

    return this.runSegmentedPipeline(segments, params, async (segmentText) => {
      if (refAudioUri) {
        return this.rawCloneVoice({
          text: segmentText,
          referenceAudioUri: refAudioUri,
          modelDir: options.modelDir,
          engine: options.engine,
          language: options.language,
          referenceText: '',
          quality: options.quality ?? 'best',
        });
      }
      return this.rawSynthesize({ ...options, text: segmentText });
    });
  }

  private async cloneWithParams(options: CloneOptions, params: SpeechParams): Promise<Qwen3TtsResult> {
    const segments = segmentTextWithPauses(options.text);
    if (segments.length === 0) throw new Error('Le texte ne peut pas être vide');

    return this.runSegmentedPipeline(segments, params, async (segmentText) => {
      return this.rawCloneVoice({ ...options, text: segmentText });
    });
  }

  private async runSegmentedPipeline(
    segments: { text: string; trailing: PunctuationKind | null }[],
    params: SpeechParams,
    engineCall: (segmentText: string) => Promise<Qwen3TtsResult>
  ): Promise<Qwen3TtsResult> {
    const sampleRate = await this.getSampleRate();

    const parts: Float32Array[] = [];
    const pausesMs: number[] = [];

    for (const segment of segments) {
      const result = await engineCall(segment.text);
      const wav = await readWavFile(result.audioUri);
      parts.push(wav.samples);
      pausesMs.push(segment.trailing ? pauseFor(segment.trailing, params) : 0);
    }

    let combined = concatSegments(parts, pausesMs, sampleRate);
    if (params.speed !== 1) combined = timeStretch(combined, params.speed, sampleRate);
    if (params.volume !== 1) combined = applyVolume(combined, params.volume);

    const wavBytes = wavEncode({ samples: combined, sampleRate });
    const outUri = await writeTempWav(wavBytes, 'synth_');
    const fullText = segments.map((s) => s.text).join('');

    return {
      audioUri: outUri,
      sampleRate,
      duration: combined.length / sampleRate,
      frameCount: combined.length,
      text: fullText,
    };
  }

  private async applyVolumeIfNeeded(
    result: Qwen3TtsResult,
    originalText: string,
    params: SpeechParams
  ): Promise<Qwen3TtsResult> {
    if (params.volume === 1) return { ...result, text: originalText };

    const wav = await readWavFile(result.audioUri);
    const samples = applyVolume(wav.samples, params.volume);
    const wavBytes = wavEncode({ samples, sampleRate: wav.sampleRate });
    const outUri = await writeTempWav(wavBytes, 'synth_');
    return {
      audioUri: outUri,
      sampleRate: wav.sampleRate,
      duration: samples.length / wav.sampleRate,
      frameCount: samples.length,
      text: originalText,
    };
  }

  /**
   * Release the currently loaded model to free memory.
   */
  async release(): Promise<void> {
    await ExpoQwen3TtsModule.releaseModel();
    this.currentModelDir = null;
    this.currentEngine = null;
  }

  /**
   * Check if the engine is ready for inference.
   */
  async isReady(): Promise<boolean> {
    try {
      return await ExpoQwen3TtsModule.isModelReady();
    } catch {
      return false;
    }
  }

  /**
   * Get the sample rate of the loaded model (24000 Hz for all engines).
   */
  async getSampleRate(): Promise<number> {
    try {
      return await ExpoQwen3TtsModule.getSampleRate();
    } catch {
      return 24000;
    }
  }
}

/** Read a WAV file from disk and decode it to mono float samples. */
async function readWavFile(uri: string): Promise<WavData> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  return wavDecode(bytes);
}

/** Write mono float samples as a WAV file in the cache directory. */
async function writeTempWav(wavBytes: Uint8Array, prefix: string): Promise<string> {
  const name = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.wav`;
  const uri = `${FileSystem.cacheDirectory}${name}`;
  const base64 = bytesToBase64(wavBytes);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

function base64ToBytes(base64: string): Uint8Array {
  if (Platform.OS === 'web' && typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // Hermes / React Native: Buffer is available.
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (Platform.OS === 'web' && typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export const onDeviceTts = new OnDeviceTTSService();
