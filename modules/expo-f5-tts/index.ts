import ExpoF5TtsModule, {
  F5_QUALITY_STEPS,
} from './src/ExpoF5TtsModule';
import type { F5TtsResult } from './src/ExpoF5Tts.types';

export type { F5TtsResult } from './src/ExpoF5Tts.types';
export { F5_QUALITY_STEPS } from './src/ExpoF5TtsModule';

/**
 * Load the F5-TTS model directory (F5_Preprocess.onnx, F5_Transformer.onnx,
 * F5_Decode.onnx, vocab.txt) into the on-device engine.
 * Must be called once before synthesize.
 * @param modelDir Path to the directory containing the model files
 */
export async function initModel(modelDir: string): Promise<void> {
  return ExpoF5TtsModule.initModel(modelDir);
}

/**
 * Synthesize `text` in the voice of the reference clip.
 * F5-TTS is a zero-shot voice-cloning engine conditioned on a reference
 * (audio + its transcript) — no separate "clone" step exists.
 * Runs 100% on-device via onnxruntime.
 * @param text Text to synthesize
 * @param refText What the reference clip actually says (improves alignment)
 * @param refWavPath 24 kHz mono WAV reference voice
 * @param speed Speech-speed scaling (1.0 = neutral)
 * @param quality 'fast' | 'balanced' | 'best'
 */
export async function synthesize(
  text: string,
  refText: string = '',
  refWavPath: string,
  speed: number = 1.0,
  quality: 'fast' | 'balanced' | 'best' = 'best'
): Promise<F5TtsResult> {
  return ExpoF5TtsModule.synthesize(
    text, refText, refWavPath, speed, F5_QUALITY_STEPS[quality]
  ) as Promise<F5TtsResult>;
}

/**
 * Unload the model and free memory.
 */
export async function releaseModel(): Promise<void> {
  return ExpoF5TtsModule.releaseModel();
}

/**
 * Check if the F5-TTS engine is loaded and ready.
 */
export async function isModelReady(): Promise<boolean> {
  return ExpoF5TtsModule.isModelReady();
}

/**
 * F5-TTS output sample rate (24000 Hz).
 */
export async function getSampleRate(): Promise<number> {
  return ExpoF5TtsModule.getSampleRate();
}
