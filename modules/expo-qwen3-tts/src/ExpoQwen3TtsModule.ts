import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type {
  Qwen3TtsInterface,
  TtsEngine,
  PreparedReference,
} from './ExpoQwen3Tts.types';
import type { Qwen3TtsResult } from './ExpoQwen3Tts.types';

export type { TtsEngine, PreparedReference, Qwen3TtsResult } from './ExpoQwen3Tts.types';

/**
 * MaskGIT decode steps for the OmniVoice engine. Generation time scales
 * linearly with this — cloning 1.8 s of speech on a desktop CPU took 68 s at
 * 32 steps, ~45 s at 22, 35 s at 16.
 *
 * 32 is the reference configuration and the default here. The 8-step preset
 * this used to include is gone: too few steps leaves the MaskGIT sampler
 * under-converged, and on top of not sounding like the requested language,
 * the result comes out audibly sped-up. 16 stays as the fast end because it
 * is still usable — reach for it deliberately, or use Qwen3-TTS / Pocket TTS,
 * which are faster without this trade-off.
 */
export const QUALITY_STEPS = { medium: 16, slow: 22, best: 32 } as const;
export type Quality = keyof typeof QUALITY_STEPS;

/**
 * Pocket TTS flow-matching steps, indexed by the same Quality presets used by
 * the other engines. The sherpa-onnx runtime defaults to 5 flow steps; 2 is
 * already intelligible because Pocket TTS is a small model with a short flow.
 * The steps are mapped in the native layer.
 */
export const POCKET_QUALITY_STEPS = { medium: 2, slow: 3, best: 4 } as const;

/**
 * `requireNativeModule` throws at import time when the platform has no native
 * implementation — on web there is none, and an import-time throw would crash
 * the whole app before any screen could render. Web gets a placeholder module
 * whose methods raise a clear "not available on web" error instead.
 */
const NativeModule: Qwen3TtsInterface =
  Platform.OS === 'web'
    ? require('./ExpoQwen3TtsModule.web').default
    : (requireNativeModule('ExpoQwen3Tts') as Qwen3TtsInterface);

export default NativeModule;
