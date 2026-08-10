import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BackHandler, Platform } from 'react-native';

/**
 * User consent to the app's terms of use. Acceptance is persisted so it only
 * has to be granted once; the user can revoke it at any time from the settings
 * screen, which blocks (or closes) the app until they accept again.
 */
const STORAGE_KEY = 'voxclone_consent_accepted_v1';

interface ConsentContextType {
  /** null while the stored value is still loading, true/false afterwards. */
  accepted: boolean | null;
  accept: () => Promise<void>;
  revoke: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => setAccepted(value === 'true'))
      .catch(() => setAccepted(false));
  }, []);

  const accept = useCallback(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
    setAccepted(true);
  }, []);

  const revoke = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setAccepted(false);
  }, []);

  const value = useMemo(
    () => ({ accepted, accept, revoke }),
    [accepted, accept, revoke]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextType {
  const context = useContext(ConsentContext);
  if (context === undefined) {
    throw new Error('useConsent must be used within a ConsentProvider');
  }
  return context;
}

/**
 * Best-effort app exit. Android exposes a real exit API; on other platforms
 * (web, iOS) a process cannot be terminated programmatically, so the caller
 * should also show the consent gate again (which blocks the app).
 */
export function exitApp(): void {
  if (Platform.OS === 'android') {
    BackHandler.exitApp();
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.close();
    } catch {
      // window.close() only works on script-opened windows — ignore.
    }
  }
}
