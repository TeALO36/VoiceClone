import { Modal, View, Text, Pressable, ScrollView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import { formatBytes } from '@/lib/services/models';
import type { UpdateInfo } from '@/lib/services/updates';

interface Props {
  visible: boolean;
  info: UpdateInfo | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation screen shown before downloading an update: target version,
 * size to download and release notes, with explicit Cancel / Download buttons.
 */
export function UpdateConfirmModal({ visible, info, onCancel, onConfirm }: Props) {
  const colors = useColors();

  const confirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm();
  };

  const cancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)', padding: 24 }}
      >
        <View
          className="bg-surface rounded-2xl p-5 border border-border w-full"
          style={{ maxWidth: 420 }}
        >
          {/* Title */}
          <Text className="text-lg font-bold text-foreground mb-1 text-center">
            🆕 Mettre à jour VoiceClone ?
          </Text>
          <Text className="text-xs text-muted mb-4 text-center">
            Confirmez avant de télécharger la nouvelle version.
          </Text>

          {info ? (
            <>
              {/* Version target */}
              <View className="bg-background rounded-xl p-4 border border-border mb-3">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-muted mb-1">Actuelle</Text>
                    <Text className="text-base font-semibold text-foreground">
                      v{info.currentVersion}
                    </Text>
                  </View>
                  <Text className="text-primary font-bold text-xl mx-4">→</Text>
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-muted mb-1">Nouvelle</Text>
                    <Text className="text-base font-semibold text-primary">
                      v{info.latestVersion}
                    </Text>
                  </View>
                </View>

                {info.apkAsset ? (
                  <View className="flex-row items-center justify-between border-t border-border pt-3">
                    <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                      {info.apkAsset.name}
                    </Text>
                    <Text className="text-sm font-semibold text-foreground ml-3">
                      {formatBytes(info.apkAsset.size)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Release notes */}
              {info.releaseNotes ? (
                <View className="mb-4">
                  <Text className="text-xs font-semibold text-foreground mb-1">
                    Notes de version
                  </Text>
                  <ScrollView style={{ maxHeight: 96 }}>
                    <Text className="text-xs text-muted leading-4">
                      {info.releaseNotes}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}

              {/* Actions */}
              <View className="flex-row gap-2">
                <Pressable
                  onPress={cancel}
                  style={({ pressed }) => [
                    { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                  ]}
                  className="flex-1 rounded-lg p-3 border border-border"
                >
                  <Text className="text-foreground font-semibold text-center text-sm">
                    Annuler
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirm}
                  style={({ pressed }) => [
                    { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                  className="flex-1 rounded-lg p-3"
                >
                  <Text className="text-white font-semibold text-center text-sm">
                    {Platform.OS === 'web'
                      ? 'Télécharger l’APK'
                      : 'Télécharger et installer'}
                  </Text>
                </Pressable>
              </View>

              <Text className="text-[11px] text-muted mt-3 text-center">
                Le téléchargement se fait depuis GitHub et l’installation se termine
                dans l’installeur Android.
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
