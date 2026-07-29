/**
 * Result from Qwen3-TTS inference.
 * Contains raw PCM audio samples ready for playback.
 */
export interface Qwen3TtsResult {
  /** Raw PCM audio samples as Float32Array */
  samples: Float32Array;
  /** Sample rate in Hz (typically 24000) */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
  /** Number of audio frames generated */
  frameCount: number;
  /** Text that was synthesized */
  text: string;
}
