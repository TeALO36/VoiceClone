import { requireNativeModule } from 'expo-modules-core';

import type { Qwen3TtsResult } from './ExpoQwen3Tts.types';

const NativeModule = requireNativeModule('ExpoQwen3Tts');

export interface Qwen3TtsInterface {
  initModel(modelDir: string): Promise<void>;
  synthesize(text: string, lang: string, instruct: string): Promise<Qwen3TtsResult>;
  cloneVoice(text: string, lang: string, refText: string, refSamples: number[] | null): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}

export default NativeModule as Qwen3TtsInterface;
