import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useSpeech } from '@/hooks/use-speech';
import * as Haptics from 'expo-haptics';
import { LocalTTSResult } from '@/lib/services/local-tts';

interface AudioPlayerProps {
  result: LocalTTSResult;
  label?: string;
}

/**
 * Reusable audio player that plays TTS results via expo-speech.
 * Shows play/stop button, duration, and speaking state.
 */
export function AudioPlayer({ result, label = 'Écouter' }: AudioPlayerProps) {
  const colors = useColors();
  const { speak, stop, isSpeaking } = useSpeech();

  const handlePlay = () => {
    if (isSpeaking) {
      stop();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      speak(result.text, {
        language: result.language,
        pitch: result.pitch,
        rate: result.rate,
        voice: result.voice || undefined,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return (
    <View className="mt-3">
      <Pressable
        onPress={handlePlay}
        style={({ pressed }) => [
          {
            backgroundColor: isSpeaking ? colors.error : colors.success,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
        className="rounded-lg p-3 flex-row items-center justify-center"
      >
        {isSpeaking ? (
          <>
            <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
            <Text className="text-white font-semibold">⏹ Arrêter</Text>
          </>
        ) : (
          <Text className="text-white font-semibold">▶ {label}</Text>
        )}
      </Pressable>
      <Text className="text-xs text-muted text-center mt-2">
        Durée estimée: {result.duration.toFixed(1)}s
      </Text>
    </View>
  );
}
