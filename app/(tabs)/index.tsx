import { ScrollView, Text, View, Pressable, FlatList } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';

import * as Haptics from 'expo-haptics';


export default function HomeScreen() {
  const colors = useColors();
  const { installedModels, availableModels, downloadingModels, totalStorageUsed } = useTTS();

  const handleNewSynthesis = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to synthesis screen
  };

  const handleVideoToAudio = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to video-to-audio screen
  };

  const handleModelsManager = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to models-manager screen
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 80 }}>
        {/* Header */}
        <View className="px-6 pt-8 pb-6">
          <Text className="text-4xl font-bold text-foreground mb-2">VoxClone Pro</Text>
          <Text className="text-base text-muted">Synthèse vocale & clonage de voix</Text>
        </View>

        {/* Quick Actions */}
        <View className="px-6 gap-3 mb-8">
          <Pressable
            onPress={handleNewSynthesis}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-2xl p-4"
          >
            <Text className="text-white font-semibold text-center text-lg">+ Nouvelle synthèse</Text>
          </Pressable>

          <View className="flex-row gap-3">
            <Pressable
              onPress={handleVideoToAudio}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              className="flex-1 rounded-xl p-3"
            >
              <Text className="text-white font-semibold text-center">Vidéo → Audio</Text>
            </Pressable>

            <Pressable
              onPress={handleModelsManager}
              style={({ pressed }) => [
                {
                  backgroundColor: colors.tertiary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              className="flex-1 rounded-xl p-3"
            >
              <Text className="text-white font-semibold text-center">Modèles</Text>
            </Pressable>
          </View>
        </View>

        {/* Storage Info */}
        <View className="px-6 mb-8">
          <View className="bg-surface rounded-2xl p-4 border border-border">
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

        {/* Installed Models */}
        {installedModels.length > 0 && (
          <View className="px-6 mb-8">
            <Text className="text-lg font-bold text-foreground mb-4">Modèles installés</Text>
            <FlatList
              data={installedModels}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">{item.name}</Text>
                      <Text className="text-xs text-muted mt-1">{item.description}</Text>
                      <View className="flex-row gap-2 mt-2 flex-wrap">
                        {item.languages.slice(0, 3).map((lang) => (
                          <View key={lang} className="bg-primary/20 rounded-full px-2 py-1">
                            <Text className="text-xs text-primary font-medium">{lang}</Text>
                          </View>
                        ))}
                        {item.languages.length > 3 && (
                          <View className="bg-primary/20 rounded-full px-2 py-1">
                            <Text className="text-xs text-primary font-medium">+{item.languages.length - 3}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text className="text-xs text-muted ml-2">{formatBytes(item.size)}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Available Models */}
        {availableModels.length > 0 && (
          <View className="px-6">
            <Text className="text-lg font-bold text-foreground mb-4">Modèles disponibles</Text>
            <FlatList
              data={availableModels}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View className="bg-surface rounded-xl p-4 mb-3 border border-border opacity-60">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">{item.name}</Text>
                      <Text className="text-xs text-muted mt-1">{item.description}</Text>
                    </View>
                    <Text className="text-xs text-muted ml-2">{formatBytes(item.size)}</Text>
                  </View>
                </View>
              )}
            />
            <Text className="text-xs text-muted text-center mt-4">
              Tap "Modèles" pour installer d'autres modèles
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
