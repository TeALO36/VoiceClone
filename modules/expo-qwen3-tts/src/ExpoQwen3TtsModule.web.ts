import type { Qwen3TtsInterface, PreparedReference, Qwen3TtsResult } from './ExpoQwen3Tts.types';

/**
 * Web placeholder for the native TTS module.
 *
 * The native engines (OmniVoice, Qwen3-TTS, Pocket TTS) are C++/ONNX binaries
 * compiled into the Android and iOS builds — there is no browser build of the
 * engine yet. `requireNativeModule('ExpoQwen3Tts')` would throw at import time
 * on web and take the whole app down, so this module exists purely to keep the
 * bundle loadable. Every inference method fails with a clear, user-facing
 * message instead of a cryptic module-resolution error.
 */
class UnsupportedError extends Error {
  constructor() {
    super(
      'La synthèse on-device n\u2019est pas disponible sur le web. ' +
        'Utilisez l\u2019application Android ou iOS.'
    );
    this.name = 'UnsupportedOnWebError';
  }
}

const nativeModule: Qwen3TtsInterface = {
  async initModel(_modelDir: string): Promise<void> {
    throw new UnsupportedError();
  },
  async prepareReference(_sourceUri: string): Promise<PreparedReference> {
    throw new UnsupportedError();
  },
  async synthesize(
    _text: string,
    _lang?: string,
    _instruct?: string,
    _steps?: number
  ): Promise<Qwen3TtsResult> {
    throw new UnsupportedError();
  },
  async cloneVoice(
    _text: string,
    _lang?: string,
    _refText?: string,
    _referencePath?: string,
    _steps?: number
  ): Promise<Qwen3TtsResult> {
    throw new UnsupportedError();
  },
  async releaseModel(): Promise<void> {
    // Nothing to release.
  },
  async isModelReady(): Promise<boolean> {
    return false;
  },
  async getSampleRate(): Promise<number> {
    return 24000;
  },
};

export default nativeModule;
