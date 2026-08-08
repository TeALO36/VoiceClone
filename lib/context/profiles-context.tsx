import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { profilesService, type VoiceProfile } from '@/lib/services/profiles';

interface ProfilesContextType {
  profiles: VoiceProfile[];
  refreshProfiles: () => Promise<void>;
  saveProfile: (profile: VoiceProfile, referenceWavSource?: string) => Promise<VoiceProfile>;
  deleteProfile: (id: string) => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextType | undefined>(undefined);

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await profilesService.list();
      setProfiles(list);
    } catch (error) {
      console.error('Failed to load voice profiles:', error);
    }
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const saveProfile = useCallback(
    async (profile: VoiceProfile, referenceWavSource?: string) => {
      const saved = await profilesService.save(profile, referenceWavSource);
      await refreshProfiles();
      return saved;
    },
    [refreshProfiles]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      await profilesService.delete(id);
      await refreshProfiles();
    },
    [refreshProfiles]
  );

  const value = useMemo(
    () => ({ profiles, refreshProfiles, saveProfile, deleteProfile }),
    [profiles, refreshProfiles, saveProfile, deleteProfile]
  );

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>;
}

export function useProfiles(): ProfilesContextType {
  const context = useContext(ProfilesContext);
  if (context === undefined) {
    throw new Error('useProfiles must be used within a ProfilesProvider');
  }
  return context;
}
