/**
 * On-device TTS service — uses the native Qwen3-TTS C++ engine.
 * Loads GGUF model from device storage, runs inference 100% locally.
 */
import { Platform } from 'react-native';
import * as Qwen3Tts from '@/modules/expo-qwen3-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

export type { Qwen3TtsResult };

export type TtsEngine = 'omnivoice' | 'qwen3';
export type { Quality } from '@/modules/expo-qwen3-tts';
import type { Quality } from '@/modules/expo-qwen3-tts';

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
   * context against the reference codes, but handles an empty string fine
   * (prompt_tts_combine_text falls back to the target text alone) — the guard
   * in its CLI is a CLI policy, not a library requirement. Qwen3-TTS derives
   * the voice from a speaker encoder and ignores this entirely.
   */
  referenceText?: string;
  quality?: Quality;
}

// ─── Language mapping ───
//
// Qwen3-TTS conditions on a fixed set of ten language ids and silently speaks
// English for anything else, so the picker is filtered per engine rather than
// offering choices one of them cannot honour. OmniVoice resolves ISO codes
// against a 646-entry table and covers all of these.
const QWEN3_LANGUAGES = new Set(['zh', 'en', 'ja', 'ko', 'de', 'fr', 'ru', 'pt', 'es', 'it']);

export function getSupportedLanguages(
  engine?: TtsEngine
): { id: string; name: string; flag: string }[] {
  const all = allLanguages();
  return engine === 'qwen3' ? all.filter((l) => QWEN3_LANGUAGES.has(l.id)) : all;
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

// Simple voice presets (for display, actual voice cloning uses reference audio)
export const VOICE_PRESETS: Record<string, { label: string; emoji: string }> = {
  'male-neutral': { label: 'Homme neutre', emoji: '👨' },
  'female-neutral': { label: 'Femme neutre', emoji: '👩' },
  'male-deep': { label: 'Homme grave', emoji: '🧔' },
  'female-bright': { label: 'Femme claire', emoji: '👧' },
  'child': { label: 'Enfant', emoji: '👦' },
  'narrator': { label: 'Narrateur', emoji: '🎙️' },
};

export class OnDeviceTTSService {
  private currentModelDir: string | null = null;
  private currentEngine: TtsEngine | null = null;

  /**
   * Load a model directory into the native engine.
   * Model must be downloaded first via the models service.
   */
  async initModel(modelDir: string, engine: TtsEngine): Promise<void> {
    if (this.currentModelDir === modelDir && this.currentEngine === engine) {
      if (await Qwen3Tts.isModelReady()) return;
    }

    // Switching models: drop the previous one first so two multi-hundred-MB
    // checkpoints are never mapped at the same time.
    if (this.currentModelDir && this.currentModelDir !== modelDir) {
      await this.release();
    }

    await Qwen3Tts.initModel(modelDir, engine);
    this.currentModelDir = modelDir;
    this.currentEngine = engine;
  }

  /** Synthesize text to a WAV file on disk and return its URI. */
  async synthesize(options: TTSOptions): Promise<Qwen3TtsResult> {
    if (!options.text.trim()) {
      throw new Error('Le texte ne peut pas être vide');
    }

    await this.initModel(options.modelDir, options.engine);

    return await Qwen3Tts.synthesize(
      options.text.trim(),
      options.language ?? '',
      options.instruct ?? '',
      options.quality ?? 'best'
    );
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

    return await Qwen3Tts.cloneVoice(
      options.text.trim(),
      options.language ?? '',
      options.referenceText?.trim() ?? '',
      options.referenceAudioUri,
      options.quality ?? 'best'
    );
  }

  /**
   * Release the currently loaded model to free memory.
   */
  async release(): Promise<void> {
    await Qwen3Tts.releaseModel();
    this.currentModelDir = null;
    this.currentEngine = null;
  }

  /**
   * Check if the engine is ready for inference.
   */
  async isReady(): Promise<boolean> {
    try {
      return await Qwen3Tts.isModelReady();
    } catch {
      return false;
    }
  }

  /**
   * Get the sample rate of the loaded model (typically 24000 Hz).
   */
  async getSampleRate(): Promise<number> {
    try {
      return await Qwen3Tts.getSampleRate();
    } catch {
      return 24000;
    }
  }
}

export const onDeviceTts = new OnDeviceTTSService();
