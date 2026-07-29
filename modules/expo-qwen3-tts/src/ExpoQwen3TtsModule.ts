import { requireNativeModule } from 'expo-modules-core';

import type { Qwen3TtsResult } from './ExpoQwen3Tts.types';

const NativeModule = requireNativeModule('ExpoQwen3Tts');

export interface Qwen3TtsInterface {
  initModel(modelDir: string): Promise<boolean>;
  synthesize(text: string): Promise<Qwen3TtsResult>;
  cloneVoice(text: string, referencePath: string): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}

export default NativeModule as Qwen3TtsInterface;
