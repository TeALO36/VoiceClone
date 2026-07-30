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
 * MaskGIT decode steps. Generation time scales linearly with this, and it is by
 * far the dominant cost. Measured on a desktop CPU, cloning 1.8 s of speech:
 * 32 steps = 68 s, 16 steps = 35 s, 8 steps = 17 s. A phone is slower still,
 * so the upstream default of 32 is not a usable default here.
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
