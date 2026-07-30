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

export interface Qwen3TtsInterface {
  initModel(modelDir: string, engine: TtsEngine): Promise<void>;
  prepareReference(sourceUri: string): Promise<PreparedReference>;
  synthesize(text: string, lang: string, instruct: string): Promise<Qwen3TtsResult>;
  cloneVoice(text: string, lang: string, refText: string, referencePath: string): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}

export default NativeModule as Qwen3TtsInterface;
