import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { ReferenceAudioPlayer } from '@/components/reference-audio-player';
import type { PickedReference } from '@/hooks/use-reference-picker';
import type { VoiceSourceType } from '@/lib/services/profiles';

interface ReferenceSourcePickerProps {
  reference: PickedReference | null;
  isReady: boolean;
  isConverting: boolean;
  isRecording: boolean;
  onPick: () => void;
  onRecord: () => void;
  onStopRecord: () => void;
  onRemove: () => void;
  disabled?: boolean;
}

const SOURCE_LABEL: Record<VoiceSourceType, string> = {
  upload: 'Fichier audio',
  video: 'Vidéo (audio extrait)',
  record: 'Enregistrement',
};

export function ReferenceSourcePicker({
  reference,
  isReady,
  isConverting,
  isRecording,
  onPick,
  onRecord,
  onStopRecord,
  onRemove,
  disabled,
}: ReferenceSourcePickerProps) {
  const colors = useColors();

  if (!reference) {
    return (
      <View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={onPick}
            disabled={disabled}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
              },
            ]}
            className="flex-1 border-2 border-dashed rounded-2xl p-5 items-center justify-center"
          >
            <Text className="text-3xl mb-2">📁</Text>
            <Text className="text-sm font-semibold text-foreground text-center">
              Audio ou vidéo
            </Text>
            <Text className="text-xs text-muted text-center mt-1">
              MP3, WAV, MP4, MKV…
            </Text>
          </Pressable>

          {Platform.OS !== 'web' && (
            <Pressable
              onPress={isRecording ? onStopRecord : onRecord}
              disabled={disabled}
              style={({ pressed }) => [
                {
                  backgroundColor: isRecording ? colors.error : colors.surface,
                  borderColor: isRecording ? colors.error : colors.primary,
                  opacity: pressed ? 0.8 : disabled ? 0.5 : 1,
                },
              ]}
              className="flex-1 border-2 border-dashed rounded-2xl p-5 items-center justify-center"
            >
              {isRecording ? (
                <ActivityIndicator color={colors.error} style={{ marginBottom: 8 }} />
              ) : (
                <Text className="text-3xl mb-2">🎙️</Text>
              )}
              <Text className="text-sm font-semibold text-center" style={{ color: isRecording ? colors.error : colors.foreground }}>
                {isRecording ? 'Arrêter' : 'Enregistrer'}
              </Text>
              <Text className="text-xs text-muted text-center mt-1">
                {isRecording ? 'Parlez…' : '3–10 s de voix'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="bg-surface border border-primary/40 rounded-2xl p-4">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1 mr-2">
          <View className="w-8 h-8 rounded-full bg-success/20 items-center justify-center mr-3">
            {isConverting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text className="text-success font-bold">✓</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
              {reference.name}
            </Text>
            <Text className="text-xs text-muted">
              {isConverting
                ? 'Extraction de la voix…'
                : reference.duration != null
                  ? `Prêt · ${reference.duration.toFixed(1)} s · ${SOURCE_LABEL[reference.sourceType]}`
                  : SOURCE_LABEL[reference.sourceType]}
            </Text>
          </View>
        </View>
        <Pressable onPress={onRemove} className="bg-error/10 border border-error/30 rounded-lg px-3 py-1.5">
          <Text className="text-error text-xs font-semibold">Retirer</Text>
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <View className="mt-2 rounded-xl overflow-hidden bg-background/50 p-2">
          <audio controls src={reference.playUri} style={{ width: '100%', height: '40px' }} />
        </View>
      ) : (
        <ReferenceAudioPlayer uri={reference.playUri} label="Écouter l'échantillon" />
      )}
    </View>
  );
}
