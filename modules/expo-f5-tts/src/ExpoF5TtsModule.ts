import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type { F5TtsInterface } from './ExpoF5Tts.types';
import type { F5TtsResult } from './ExpoF5Tts.types';

export type { F5TtsResult } from './ExpoF5Tts.types';

/**
 * F5-TTS runs a FIXED 32-step schedule. There is no quality trade-off to make.
 *
 * The exported graph bakes its timestep schedule in as a constant: inspecting
 * F5_Transformer.int8.onnx shows the Gather that consumes `time_step.1` reading
 * from a 31-element table, and the graph returns an incrementing counter rather
 * than accepting a time value. So the solver is not "32 steps by default, fewer
 * if you want speed" — it is 31 transitions, in order, and the app's only
 * choice is how many of them to run.
 *
 * Stopping early does NOT take larger steps. It abandons the ODE partway, at an
 * intermediate t, and returns a mel that was never fully denoised. The 16- and
 * 22-step presets that used to sit here were therefore not "faster and rougher"
 * — they were incomplete, which is a different and much worse thing. All tiers
 * now map to the full schedule; the UI stops offering a choice that the graph
 * cannot honour.
 */
export const F5_NFE_STEPS = 32;
export const F5_QUALITY_STEPS = {
  medium: F5_NFE_STEPS,
  slow: F5_NFE_STEPS,
  best: F5_NFE_STEPS,
} as const;

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
