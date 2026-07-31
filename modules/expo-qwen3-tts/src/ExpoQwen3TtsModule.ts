import { requireNativeModule } from 'expo-modules-core';

import type { Qwen3TtsResult } from './ExpoQwen3Tts.types';

const NativeModule = requireNativeModule('ExpoQwen3Tts');

export type TtsEngine = 'omnivoice' | 'qwen3';

export interface PreparedReference {
  /** file:// URI of the converted 24 kHz mono WAV */
  uri: string;
  sampleRate: number;
  duration: number;
}

/**
 * MaskGIT decode steps. Generation time scales linearly with this — cloning
 * 1.8 s of speech on a desktop CPU took 68 s at 32 steps, 35 s at 16, 17 s at 8.
 *
 * Tempting as the low end is, 32 is the reference configuration and the default
 * here. Shipping 8 as the default produced speech that did not sound like the
 * requested language at all: too few steps leaves the MaskGIT sampler
 * under-converged and the output is closer to babble than to words. Speed is
 * worth nothing if the audio is unusable — reach for the faster presets
 * deliberately, or use Qwen3-TTS, which is faster without this trade-off.
 */
export const QUALITY_STEPS = { fast: 8, balanced: 16, best: 32 } as const;
export type Quality = keyof typeof QUALITY_STEPS;

export interface Qwen3TtsInterface {
  initModel(modelDir: string, engine: TtsEngine): Promise<void>;
  prepareReference(sourceUri: string): Promise<PreparedReference>;
  synthesize(text: string, lang: string, instruct: string, steps: number): Promise<Qwen3TtsResult>;
  cloneVoice(text: string, lang: string, refText: string, referencePath: string, steps: number): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}

export default NativeModule as Qwen3TtsInterface;
