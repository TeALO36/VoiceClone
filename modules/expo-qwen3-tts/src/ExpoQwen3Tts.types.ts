/**
 * Shared types for the on-device TTS module.
 */

export type TtsEngine = 'omnivoice' | 'qwen3' | 'pocket';

export interface PreparedReference {
  /** file:// URI of the converted 24 kHz mono WAV */
  uri: string;
  sampleRate: number;
  duration: number;
}

/**
 * Result from Qwen3-TTS / OmniVoice / Pocket TTS inference.
 * Contains the path of the generated WAV file plus audio metadata.
 */
export interface Qwen3TtsResult {
  /** Local file URI to the generated WAV file */
  audioUri: string;
  /** Sample rate in Hz (typically 24000) */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
  /** Number of audio frames generated */
  frameCount: number;
  /** Text that was synthesized */
  text: string;
}

/** Shape of the native module as seen from JavaScript. */
export interface Qwen3TtsInterface {
  initModel(modelDir: string, engine: TtsEngine): Promise<void>;
  prepareReference(sourceUri: string): Promise<PreparedReference>;
  synthesize(text: string, lang: string, instruct: string, steps: number): Promise<Qwen3TtsResult>;
  cloneVoice(
    text: string,
    lang: string,
    refText: string,
    referencePath: string,
    steps: number
  ): Promise<Qwen3TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}
