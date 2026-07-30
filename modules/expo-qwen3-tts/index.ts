import ExpoQwen3TtsModule, { type Qwen3TtsInterface, type TtsEngine } from './src/ExpoQwen3TtsModule';
import type { Qwen3TtsResult } from './src/ExpoQwen3Tts.types';

export type { Qwen3TtsResult } from './src/ExpoQwen3Tts.types';
export type { TtsEngine } from './src/ExpoQwen3TtsModule';

/**
 * Load a model directory into the native engine.
 * Must be called once before synthesize or cloneVoice.
 * @param modelDir Path to directory containing .gguf model files
 * @param engine Which engine owns those files — the two formats are not interchangeable
 */
export async function initModel(modelDir: string, engine: TtsEngine): Promise<void> {
  return ExpoQwen3TtsModule.initModel(modelDir, engine);
}

/**
 * Synthesize speech from text using the Qwen3-TTS model.
 * Runs 100% on-device — no cloud, no API.
 * @param text Text to synthesize
 * @returns PCM audio data as Float32Array and sample rate
 */
export async function synthesize(
  text: string,
  lang: string = 'en',
  instruct: string = ''
): Promise<Qwen3TtsResult> {
  return ExpoQwen3TtsModule.synthesize(text, lang, instruct) as Promise<Qwen3TtsResult>;
}

/**
 * Clone a voice from a reference recording and speak `text` with it.
 * @param text Text to speak in the cloned voice
 * @param lang Language hint ('' lets the engine decide)
 * @param refText What is actually said in the reference, when known — improves fidelity
 * @param referencePath Path to the reference WAV (24 kHz mono, 3-10 seconds)
 */
export async function cloneVoice(
  text: string,
  lang: string = 'en',
  refText: string = '',
  referencePath: string
): Promise<Qwen3TtsResult> {
  return ExpoQwen3TtsModule.cloneVoice(text, lang, refText, referencePath) as Promise<Qwen3TtsResult>;
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
