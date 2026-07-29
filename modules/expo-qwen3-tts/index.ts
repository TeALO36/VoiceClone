import ExpoQwen3TtsModule, { type Qwen3TtsInterface } from './src/ExpoQwen3TtsModule';
import type { Qwen3TtsResult } from './src/ExpoQwen3Tts.types';

export type { Qwen3TtsResult } from './src/ExpoQwen3Tts.types';

/**
 * Initialize the Qwen3-TTS model from a local GGUF file.
 * Must be called once before synthesize or cloneVoice.
 * @param modelDir Path to directory containing .gguf model files
 */
export async function initModel(modelDir: string): Promise<boolean> {
  return ExpoQwen3TtsModule.initModel(modelDir);
}

/**
 * Synthesize speech from text using the Qwen3-TTS model.
 * Runs 100% on-device — no cloud, no API.
 * @param text Text to synthesize
 * @returns PCM audio data as Float32Array and sample rate
 */
export async function synthesize(text: string): Promise<Qwen3TtsResult> {
  return ExpoQwen3TtsModule.synthesize(text) as Promise<Qwen3TtsResult>;
}

/**
 * Clone a voice from a reference audio file and generate speech.
 * Uses ECAPA-TDNN speaker encoder for zero-shot voice cloning.
 * @param text Text to speak in the cloned voice
 * @param referencePath Path to reference audio file (WAV recommended, 3-10 seconds)
 * @returns PCM audio data and sample rate
 */
export async function cloneVoice(
  text: string,
  referencePath: string
): Promise<Qwen3TtsResult> {
  return ExpoQwen3TtsModule.cloneVoice(text, referencePath) as Promise<Qwen3TtsResult>;
}

/**
 * Unload the model and free memory.
 */
export async function releaseModel(): Promise<void> {
  return ExpoQwen3TtsModule.releaseModel();
}

/**
 * Check if a model is currently loaded and ready.
 */
export async function isModelReady(): Promise<boolean> {
  return ExpoQwen3TtsModule.isModelReady();
}

/**
 * Get the sample rate of the currently loaded model.
 */
export async function getSampleRate(): Promise<number> {
  return ExpoQwen3TtsModule.getSampleRate();
}
