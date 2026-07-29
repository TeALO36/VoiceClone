import * as Speech from 'expo-speech';
import { useState, useCallback, useEffect, useRef } from 'react';

export interface SpeechOptions {
  language?: string;
  pitch?: number;
  rate?: number;
  voice?: string;
}

/**
 * Hook for text-to-speech playback using expo-speech.
 * Works on native (Android/iOS) and web (Web Speech API).
 */
export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Speech.stop();
    };
  }, []);

  const speak = useCallback(async (text: string, options?: SpeechOptions) => {
    if (!text.trim()) return;

    // Stop any current speech first
    await Speech.stop();
    if (!mountedRef.current) return;
    setIsSpeaking(true);

    Speech.speak(text, {
      language: options?.language,
      pitch: options?.pitch ?? 1.0,
      rate: options?.rate ?? 1.0,
      voice: options?.voice,
      onDone: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
      onStopped: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
      onError: () => {
        if (mountedRef.current) setIsSpeaking(false);
      },
    });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const loadVoices = useCallback(async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (mountedRef.current) {
        setAvailableVoices(voices);
      }
    } catch {
      // Voices not available — non-critical
    }
  }, []);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  return { speak, stop, isSpeaking, availableVoices };
}
