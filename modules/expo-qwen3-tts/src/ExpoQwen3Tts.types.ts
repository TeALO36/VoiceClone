/**
 * Result from Qwen3-TTS/OmniVoice inference.
 * Contains raw PCM audio samples ready for playback.
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
