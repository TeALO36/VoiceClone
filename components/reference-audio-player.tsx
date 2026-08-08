import { Pressable, Text, ActivityIndicator, Alert } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { Audio } from 'expo-av';
import { useState, useRef } from 'react';

export function ReferenceAudioPlayer({ uri, label = 'Écouter' }: { uri: string; label?: string }) {
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
      return;
    }

    setIsLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (e) {
      console.error('Failed to play reference audio:', e);
      Alert.alert('Erreur', 'Impossible de lire cet échantillon audio');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePlay}
      disabled={isLoading}
      style={({ pressed }) => [
        {
          backgroundColor: isLoading ? colors.muted : isPlaying ? colors.error : colors.primary,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      className="rounded-xl p-3 flex-row items-center justify-center mt-3"
    >
      {isLoading ? (
        <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
      ) : (
        <Text className="text-white font-semibold text-sm">
          {isPlaying ? '⏹ Arrêter la lecture' : `▶ ${label}`}
        </Text>
      )}
    </Pressable>
  );
}
