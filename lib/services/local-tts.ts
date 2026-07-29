/**
 * On-device TTS service — uses the native Qwen3-TTS C++ engine.
 * Loads GGUF model from device storage, runs inference 100% locally.
 */
import { Platform } from 'react-native';
import * as Qwen3Tts from '@/modules/expo-qwen3-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

export type { Qwen3TtsResult };

export interface TTSOptions {
  text: string;
  language?: string;
  modelDir: string;
}

export interface CloneOptions {
  text: string;
  referenceAudioUri: string;
  modelDir: string;
  language?: string;
}

// ─── Language mapping ───
export function getSupportedLanguages(): { id: string; name: string; flag: string }[] {
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
    { id: 'ar', name: 'العربية', flag: '🇸🇦' },
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

  /**
   * Initialize (load) the Qwen3-TTS model from a local GGUF directory.
   * Model must be downloaded first via the models service.
   */
  async initModel(modelDir: string): Promise<void> {
    if (this.currentModelDir === modelDir) {
      const ready = await Qwen3Tts.isModelReady();
      if (ready) return;
    }

    const success = await Qwen3Tts.initModel(modelDir);
    if (!success) {
      throw new Error(`Failed to load model from: ${modelDir}`);
    }
    this.currentModelDir = modelDir;
  }

  /**
   * Synthesize text to speech using the on-device Qwen3-TTS model.
   * Returns raw PCM audio data that can be played via expo-av.
   */
  async synthesize(options: TTSOptions): Promise<Qwen3TtsResult> {
    if (!options.text.trim()) {
      throw new Error('Le texte ne peut pas être vide');
    }

    if (this.currentModelDir !== options.modelDir) {
      await this.initModel(options.modelDir);
    }

    return await Qwen3Tts.synthesize(options.text.trim());
  }

  /**
   * Clone a voice from a reference audio file and synthesize text.
   * Uses the ECAPA-TDNN speaker encoder in qwen3-tts.cpp for zero-shot cloning.
   */
  async cloneVoice(options: CloneOptions): Promise<Qwen3TtsResult> {
    if (!options.text.trim()) {
      throw new Error('Le texte ne peut pas être vide');
    }

    if (this.currentModelDir !== options.modelDir) {
      await this.initModel(options.modelDir);
    }

    return await Qwen3Tts.cloneVoice(
      options.text.trim(),
      options.referenceAudioUri
    );
  }

  /**
   * Release the currently loaded model to free memory.
   */
  async release(): Promise<void> {
    await Qwen3Tts.releaseModel();
    this.currentModelDir = null;
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
