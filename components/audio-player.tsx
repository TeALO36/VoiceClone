import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useState, useRef, useCallback } from 'react';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

interface AudioPlayerProps {
  result: Qwen3TtsResult;
  label?: string;
}

/**
 * Audio player that plays real Qwen3-TTS generated audio via expo-av.
 * The audio is PCM Float32 data converted to WAV and played back.
 */
export function AudioPlayer({ result, label = 'Écouter' }: AudioPlayerProps) {
  const colors = useColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const float32ToWavBase64 = useCallback((samples: number[], sampleRate: number): string => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert Float32 to Int16
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(44 + i * 2, int16, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }, []);

  const handlePlay = async () => {
    if (isPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const base64Uri = float32ToWavBase64(result.samples, result.sampleRate);

      const { sound } = await Audio.Sound.createAsync(
        { uri: base64Uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );

      soundRef.current = sound;
      setIsPlaying(true);
    } catch (error) {
      console.error('Audio playback error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="mt-3">
      <Pressable
        onPress={handlePlay}
        disabled={isLoading}
        style={({ pressed }) => [
          {
            backgroundColor: isLoading ? colors.muted : isPlaying ? colors.error : colors.success,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
        className="rounded-lg p-3 flex-row items-center justify-center"
      >
        {isLoading ? (
          <>
            <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
            <Text className="text-white font-semibold">Préparation...</Text>
          </>
        ) : isPlaying ? (
          <>
            <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
            <Text className="text-white font-semibold">⏹ Arrêter</Text>
          </>
        ) : (
          <Text className="text-white font-semibold">▶ {label}</Text>
        )}
      </Pressable>
      <Text className="text-xs text-muted text-center mt-2">
        {result.duration.toFixed(1)}s · {result.sampleRate}Hz · {result.frameCount} frames
      </Text>
    </View>
  );
}
