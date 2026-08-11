/**
 * Voice profiles — a saved bundle of everything needed to reproduce a voice:
 * the engine + model, the language, the reference voice (uploaded, recorded or
 * extracted from a video), and the advanced speech parameters (pauses, speed,
 * volume).
 *
 * Profiles are stored in AsyncStorage; the reference WAV is copied out of the
 * ephemeral cache into the app's documents directory so it survives the cache
 * cleanup the native layer performs after an hour.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { TtsEngine } from '@/modules/expo-qwen3-tts';
import { DEFAULT_SPEECH_PARAMS, type SpeechParams } from './audio-pipeline';

export type VoiceSourceType = 'upload' | 'record' | 'video';

export interface VoiceReference {
  sourceType: VoiceSourceType;
  sourceName: string;
  /** Persistent 24 kHz mono WAV URI inside the app documents directory. */
  wavUri: string;
  duration: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  engine: TtsEngine;
  modelId: string;
  language: string;
  /** Absent = classic TTS with a preset/bundled voice. */
  reference?: VoiceReference;
  params: SpeechParams;
}

const STORAGE_KEY = 'voxclone_voice_profiles_v1';

export function createProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function profileDir(id: string): string {
  return `${FileSystem.documentDirectory}profiles/${id}`;
}

export function referenceWavPath(id: string): string {
  return `${profileDir(id)}/ref.wav`;
}

async function readProfiles(): Promise<VoiceProfile[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as VoiceProfile[]) : [];
  } catch (error) {
    console.warn('Failed to read voice profiles:', error);
    return [];
  }
}

async function writeProfiles(profiles: VoiceProfile[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export const profilesService = {
  async list(): Promise<VoiceProfile[]> {
    return readProfiles();
  },

  async get(id: string): Promise<VoiceProfile | undefined> {
    const profiles = await readProfiles();
    return profiles.find((p) => p.id === id);
  },

  /**
   * Persist a profile. When `referenceWavSource` is given (the ephemeral
   * prepared WAV from the cache), it is copied into the profile directory so
   * the profile keeps working after the cache is cleaned.
   */
  async save(
    profile: VoiceProfile,
    referenceWavSource?: string
  ): Promise<VoiceProfile> {
    const profiles = await readProfiles();

    if (profile.reference && referenceWavSource) {
      // Keep the file:// scheme on both URIs: expo-file-system treats a raw
      // path as an Android resource name, so a bare path would make the copy
      // below throw and, before that, make getInfoAsync report the source as
      // missing (which silently skipped the copy and left the profile
      // pointing at a cache file that the native layer cleans after an hour).
      const target = referenceWavPath(profile.id);
      const sourcePath = referenceWavSource;
      if (sourcePath !== target) {
        const dirInfo = await FileSystem.getInfoAsync(profileDir(profile.id));
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(profileDir(profile.id), { intermediates: true });
        }
        const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
        if (sourceInfo.exists) {
          // Copy instead of move: the cache file may be shared with the live
          // preview in the cloning screen. `target` already carries file://
          // (referenceWavPath is built from documentDirectory).
          await FileSystem.copyAsync({ from: sourcePath, to: target });
          profile.reference = { ...profile.reference, wavUri: target };
        }
      }
    }

    const updated: VoiceProfile = { ...profile, updatedAt: Date.now() };
    const index = profiles.findIndex((p) => p.id === profile.id);
    if (index >= 0) {
      profiles[index] = updated;
    } else {
      profiles.push(updated);
    }
    await writeProfiles(profiles);
    return updated;
  },

  async delete(id: string): Promise<void> {
    const profiles = await readProfiles();
    const next = profiles.filter((p) => p.id !== id);
    await writeProfiles(next);
    await FileSystem.deleteAsync(profileDir(id), { idempotent: true }).catch(() => {});
  },

  /** Drop profiles whose model is no longer installed. */
  async pruneUnavailable(installedModelIds: string[]): Promise<VoiceProfile[]> {
    const profiles = await readProfiles();
    const valid = profiles.filter((p) => installedModelIds.includes(p.modelId));
    if (valid.length !== profiles.length) {
      await writeProfiles(valid);
    }
    return valid;
  },

  defaultProfile(partial: Partial<VoiceProfile>): VoiceProfile {
    return {
      id: createProfileId(),
      name: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      engine: 'omnivoice',
      modelId: '',
      language: 'fr',
      params: { ...DEFAULT_SPEECH_PARAMS },
      ...partial,
    };
  },
};
