import { View, Text, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState, useRef, useEffect } from 'react';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

interface AudioPlayerProps {
  result: Qwen3TtsResult;
  label?: string;
  /** Optional text used to build a human-friendly export filename. */
  fileName?: string;
}

/** Turn a text snippet into a safe, readable filename fragment. */
function slugify(text: string): string {
  const cleaned = text
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return cleaned || 'audio';
}

/**
 * Audio player that plays real Qwen3-TTS generated audio via expo-av.
 * The audio is PCM Float32 data converted to WAV and played back.
 */
export function AudioPlayer({ result, label = 'Écouter', fileName }: AudioPlayerProps) {
  const colors = useColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync();
        soundRef.current.unloadAsync();
      }
    };
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

  const handleExport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);
    try {
      const niceName = `VoiceClone_${slugify(fileName ?? 'audio')}_${Date.now()}.wav`;

      // Web: trigger a plain download of the WAV.
      if (Platform.OS === 'web') {
        if (typeof document !== 'undefined') {
          const anchor = document.createElement('a');
          anchor.href = result.audioUri;
          anchor.download = niceName;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }
        return;
      }

      // Native: copy to the cache under a readable name (the share sheet shows
      // the filename), then open the system share sheet.
      const source = result.audioUri;
      const target = `${FileSystem.cacheDirectory}${niceName}`;
      await FileSystem.copyAsync({ from: source, to: target }).catch(() => {});
      const exportedUri = `file://${target.replace(/^file:\/\//, '')}`;

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportedUri, {
          mimeType: 'audio/wav',
          dialogTitle: 'Exporter l’audio généré',
        });
      } else {
        Alert.alert('Export', 'Le partage n’est pas disponible sur cet appareil.');
      }
    } catch (error) {
      console.error('Audio export error:', error);
      Alert.alert('Export', 'Impossible d’exporter l’audio.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View className="mt-3">
      <View className="flex-row gap-2">
        <Pressable
          onPress={handlePlay}
          disabled={isLoading}
          style={({ pressed }) => [
            {
              backgroundColor: isLoading ? colors.muted : isPlaying ? colors.error : colors.success,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              flex: 2,
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
        <Pressable
          onPress={handleExport}
          disabled={isExporting}
          style={({ pressed }) => [
            {
              backgroundColor: isExporting ? colors.muted : colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              flex: 1,
            },
          ]}
          className="rounded-lg p-3 flex-row items-center justify-center"
        >
          {isExporting ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-semibold text-center">⤴ Exporter</Text>
          )}
        </Pressable>
      </View>
      <Text className="text-xs text-muted text-center mt-2">
        {result.duration.toFixed(1)}s · {result.sampleRate}Hz · {result.frameCount} frames
      </Text>
    </View>
  );
}
