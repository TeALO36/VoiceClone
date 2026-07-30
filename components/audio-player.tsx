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
      const { sound } = await Audio.Sound.createAsync(
        { uri: result.audioUri },
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
