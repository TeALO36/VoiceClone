import type { F5TtsInterface, F5TtsResult } from './ExpoF5Tts.types';

/**
 * Web placeholder for the native F5-TTS module.
 *
 * The engine runs through onnxruntime compiled into the Android build — there
 * is no browser build yet. `requireNativeModule('ExpoF5Tts')` would throw at
 * import time on web and take the whole app down, so this module exists purely
 * to keep the bundle loadable. Every inference method fails with a clear,
 * user-facing message instead of a cryptic module-resolution error.
 */
class UnsupportedError extends Error {
  constructor() {
    super(
      'La synthèse F5-TTS n\u2019est pas disponible sur le web. ' +
        'Utilisez l\u2019application Android ou iOS.'
    );
    this.name = 'UnsupportedOnWebError';
  }
}

const nativeModule: F5TtsInterface = {
  async initModel(_modelDir: string): Promise<void> {
    throw new UnsupportedError();
  },
  async synthesize(
    _text: string,
    _refText: string,
    _refWavPath: string,
    _speed: number,
    _steps: number
  ): Promise<F5TtsResult> {
    throw new UnsupportedError();
  },
  async releaseModel(): Promise<void> {
    throw new UnsupportedError();
  },
  async isModelReady(): Promise<boolean> {
    return false;
  },
  async getSampleRate(): Promise<number> {
    return 24000;
  },
};

export default nativeModule;
