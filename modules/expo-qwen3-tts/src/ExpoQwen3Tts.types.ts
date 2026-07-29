/**
 * Result from Qwen3-TTS/OmniVoice inference.
 * Contains raw PCM audio samples ready for playback.
 */
export interface Qwen3TtsResult {
  /** Raw PCM audio samples as number[] (float32 values, range [-1, 1]) */
  samples: number[];
  /** Sample rate in Hz (typically 24000) */
  sampleRate: number;
  /** Duration in seconds */
  duration: number;
  /** Number of audio frames generated */
  frameCount: number;
  /** Text that was synthesized */
  text: string;
}
