import { ScrollView, Text, View, Pressable, FlatList, Alert } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';

export default function ModelsManagerScreen() {
  const colors = useColors();
  const { installedModels, availableModels, downloadingModels, downloadModel, deleteModel, totalStorageUsed, refreshStorageInfo } = useTTS();
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');

  const handleDownloadModel = async (modelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await downloadModel(modelId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', 'Impossible de télécharger le modèle');
    }
  };

  const handleDeleteModel = (modelId: string, modelName: string) => {
    Alert.alert(
      'Supprimer le modèle',
      `Êtes-vous sûr de vouloir supprimer "${modelName}" ?`,
      [
        { text: 'Annuler', onPress: () => {}, style: 'cancel' },
        {
          text: 'Supprimer',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deleteModel(modelId);
              await refreshStorageInfo();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erreur', 'Impossible de supprimer le modèle');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const renderModelCard = (model: any, isInstalled: boolean) => {
    const downloadProgress = downloadingModels[model.id];
    const isDownloading = downloadProgress !== undefined;

    return (
      <View key={model.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">{model.name}</Text>
            <Text className="text-xs text-muted mt-1">{model.description}</Text>
          </View>
          <Text className="text-xs text-muted ml-2">{formatBytes(model.size)}</Text>
        </View>

        {/* Languages */}
        <View className="flex-row gap-1 flex-wrap mb-3">
          {model.languages.slice(0, 2).map((lang: string) => (
            <View key={lang} className="bg-primary/20 rounded-full px-2 py-1">
              <Text className="text-xs text-primary font-medium">{lang}</Text>
            </View>
          ))}
          {model.languages.length > 2 && (
            <View className="bg-primary/20 rounded-full px-2 py-1">
              <Text className="text-xs text-primary font-medium">+{model.languages.length - 2}</Text>
            </View>
          )}
        </View>

        {/* Download Progress */}
        {isDownloading && (
          <View className="mb-3">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs text-muted">Téléchargement</Text>
              <Text className="text-xs text-muted">{downloadProgress}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full bg-primary"
                style={{ width: `${downloadProgress}%` }}
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-2">
          {isInstalled ? (
            <>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="flex-1 bg-primary rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">Utiliser</Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteModel(model.id, model.name)}
                className="flex-1 bg-error rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">Supprimer</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => handleDownloadModel(model.id)}
              disabled={isDownloading}
              style={({ pressed }) => [
                {
                  backgroundColor: isDownloading ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              className="flex-1 rounded-lg p-2"
            >
              <Text className="text-white font-semibold text-center text-sm">
                {isDownloading ? `Téléchargement (${downloadProgress}%)` : 'Installer'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">Gestionnaire de modèles</Text>
        </View>

        {/* Storage Info */}
        <View className="px-6 mb-6">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-sm font-semibold text-foreground">Stockage utilisé</Text>
              <Text className="text-sm font-semibold text-primary">{formatBytes(totalStorageUsed)}</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full bg-primary"
                style={{ width: `${Math.min((totalStorageUsed / (10 * 1024 * 1024 * 1024)) * 100, 100)}%` }}
              />
            </View>
            <Text className="text-xs text-muted mt-2">Max: 10 GB</Text>
          </View>
        </View>

        {/* Tabs */}
        <View className="px-6 mb-6 flex-row gap-3">
          <Pressable
            onPress={() => {
              setActiveTab('installed');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [
              {
                backgroundColor: activeTab === 'installed' ? colors.primary : colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            className="flex-1 rounded-lg p-3 border border-border"
          >
            <Text
              className={activeTab === 'installed' ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}
            >
              Installés ({installedModels.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTab('available');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [
              {
                backgroundColor: activeTab === 'available' ? colors.primary : colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            className="flex-1 rounded-lg p-3 border border-border"
          >
            <Text
              className={activeTab === 'available' ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}
            >
              Disponibles ({availableModels.length})
            </Text>
          </Pressable>
        </View>

        {/* Models List */}
        <View className="px-6">
          {activeTab === 'installed' ? (
            <>
              {installedModels.length > 0 ? (
                <FlatList
                  data={installedModels}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => renderModelCard(item, true)}
                />
              ) : (
                <View className="items-center justify-center py-8">
                  <Text className="text-lg text-muted">Aucun modèle installé</Text>
                  <Text className="text-sm text-muted mt-2">Installez un modèle pour commencer</Text>
                </View>
              )}
            </>
          ) : (
            <>
              {availableModels.length > 0 ? (
                <FlatList
                  data={availableModels}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => renderModelCard(item, false)}
                />
              ) : (
                <View className="items-center justify-center py-8">
                  <Text className="text-lg text-muted">Aucun modèle disponible</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
