import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type { F5TtsInterface } from './ExpoF5Tts.types';
import type { F5TtsResult } from './ExpoF5Tts.types';

export type { F5TtsResult } from './ExpoF5Tts.types';

/**
 * F5-TTS flow-matching ODE steps, indexed by the same Quality presets used by
 * the other engines. 32 is the official reference configuration; 8 is fast but
 * audibly rougher (the flow is less converged). F5-TTS is a 335M model, so
 * each step is heavy on a phone — 'best' is recommended.
 */
export const F5_QUALITY_STEPS = { fast: 8, balanced: 16, best: 32 } as const;

/**
 * `requireNativeModule` throws at import time when the platform has no native
 * implementation — on web there is none, and an import-time throw would crash
 * the whole app before any screen could render. Web gets a placeholder module
 * whose methods raise a clear "not available on web" error instead.
 */
const NativeModule: F5TtsInterface =
  Platform.OS === 'web'
    ? require('./ExpoF5TtsModule.web').default
    : (requireNativeModule('ExpoF5Tts') as F5TtsInterface);

export default NativeModule;
