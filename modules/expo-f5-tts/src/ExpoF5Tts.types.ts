/**
 * Shared types for the on-device F5-TTS module.
 */

export interface F5TtsResult {
  /** Local file URI to the generated WAV file */
  audioUri: string;
  /** Sample rate in Hz (24000) */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
  /** Number of audio frames generated */
  frameCount: number;
  /** Text that was synthesized */
  text: string;
}

/** Shape of the native module as seen from JavaScript. */
export interface F5TtsInterface {
  initModel(modelDir: string): Promise<void>;
  synthesize(
    text: string,
    refText: string,
    refWavPath: string,
    speed: number,
    steps: number
  ): Promise<F5TtsResult>;
  releaseModel(): Promise<void>;
  isModelReady(): Promise<boolean>;
  getSampleRate(): Promise<number>;
}
