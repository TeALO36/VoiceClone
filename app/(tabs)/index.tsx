import { ScrollView, Text, View, Pressable, FlatList } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function HomeScreen() {
  const colors = useColors();
  const { installedModels, availableModels } = useTTS();
  const router = useRouter();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-6 pt-8 pb-6">
          <Text className="text-4xl font-bold text-foreground mb-2">VoxClone Pro</Text>
          <Text className="text-base text-muted">Synthèse vocale & clonage de voix</Text>
        </View>

        {/* Quick Actions */}
        <View className="px-6 gap-3 mb-8">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/synthesis');
            }}
            style={({ pressed }) => [
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-2xl p-4"
          >
            <Text className="text-white font-semibold text-center text-lg">📝 Nouvelle synthèse</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/voice-cloning');
            }}
            style={({ pressed }) => [
              {
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-2xl p-4"
          >
            <Text className="text-white font-semibold text-center text-lg">🎙️ Cloner une voix</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(tabs)/models-manager');
            }}
            style={({ pressed }) => [
              {
                backgroundColor: colors.tertiary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-2xl p-4"
          >
            <Text className="text-white font-semibold text-center text-lg">📦 Gérer les modèles</Text>
          </Pressable>
        </View>


        {/* Installed Models — ONLY installed models, no duplicates */}
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

        {/* Available Models — ONLY available (not installed) */}
        {availableModels.length > 0 && (
          <View className="px-6">
            <Text className="text-lg font-bold text-foreground mb-4">Modèles disponibles</Text>
            <FlatList
              data={availableModels}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View className="bg-surface rounded-xl p-4 mb-3 border border-border opacity-70">
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
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/models-manager');
              }}
              style={({ pressed }) => [
                { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
              ]}
              className="mt-4 rounded-xl p-3 border border-border items-center"
            >
              <Text className="text-primary font-semibold">Installer des modèles →</Text>
            </Pressable>
          </View>
        )}

        {/* Empty state */}
        {installedModels.length === 0 && availableModels.length === 0 && (
          <View className="px-6 items-center py-8">
            <Text className="text-lg text-muted">Aucun modèle disponible</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
