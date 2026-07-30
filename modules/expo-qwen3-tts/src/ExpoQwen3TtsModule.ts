import { requireNativeModule } from 'expo-modules-core';

import type { Qwen3TtsResult } from './ExpoQwen3Tts.types';

const NativeModule = requireNativeModule('ExpoQwen3Tts');

export type TtsEngine = 'omnivoice' | 'qwen3';

export interface Qwen3TtsInterface {
  initModel(modelDir: string, engine: TtsEngine): Promise<void>;
  synthesize(text: string, lang: string, instruct: string): Promise<Qwen3TtsResult>;
  cloneVoice(text: string, lang: string, refText: string, referencePath: string): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}

export default NativeModule as Qwen3TtsInterface;
