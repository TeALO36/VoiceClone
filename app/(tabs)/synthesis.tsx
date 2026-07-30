import { ScrollView, Text, View, Pressable, TextInput, FlatList, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { AudioPlayer } from '@/components/audio-player';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { VOICE_PRESETS, getSupportedLanguages } from '@/lib/services/local-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

const VOICE_LIST = Object.entries(VOICE_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.label,
  emoji: preset.emoji,
}));

const LANGUAGES = getSupportedLanguages();

export default function SynthesisScreen() {
  const colors = useColors();
  const { installedModels, getModelPath, ttsEngine } = useTTS();

  const [text, setText] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [selectedVoice, setSelectedVoice] = useState('male-neutral');
  const [isLoading, setIsLoading] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<Qwen3TtsResult | null>(null);

  const hasModels = installedModels.length > 0;

  const handleSynthesize = async () => {
    if (!text.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer du texte');
      return;
    }

    const model = installedModels.find((m) => m.id === selectedModelId) ?? installedModels[0];
    if (!model) {
      Alert.alert('Erreur', 'Aucun modèle installé. Installez-en un dans l\'onglet Modèles.');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const modelDir = await getModelPath(model.id);
      if (!modelDir) {
        Alert.alert('Erreur', 'Modèle introuvable. Réinstallez-le.');
        return;
      }

      const result = await ttsEngine.synthesize({
        text: text.trim(),
        modelDir,
        engine: model.type,
        language: selectedLanguage,
      });

      setSynthesisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Synthesis error:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de synthétiser le texte');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">Synthèse vocale</Text>
          <Text className="text-sm text-muted mt-1">
            {hasModels
              ? 'Entrez du texte — inférence 100% locale'
              : 'Installez un modèle pour commencer'}
          </Text>
        </View>

        {/* Model Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
          {hasModels ? (
            <View className="flex-row gap-2">
              {installedModels.map((model) => (
                <Pressable
                  key={model.id}
                  onPress={() => {
                    setSelectedModelId(model.id);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => [
                    {
                      backgroundColor: (selectedModelId || installedModels[0]?.id) === model.id ? colors.primary : colors.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  className="flex-1 rounded-lg p-3 border border-border"
                >
                  <Text
                    className={(selectedModelId || installedModels[0]?.id) === model.id
                      ? 'text-white font-semibold text-center'
                      : 'text-foreground font-semibold text-center'}
                  >
                    {model.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View className="bg-warning/10 rounded-xl p-4 border border-warning/30">
              <Text className="text-warning font-semibold">⚠️ Aucun modèle installé</Text>
              <Text className="text-sm text-muted mt-1">
                Allez dans l'onglet Modèles pour installer Qwen3-TTS.
              </Text>
            </View>
          )}
        </View>

        {/* Language Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Langue</Text>
          <FlatList
            data={LANGUAGES}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            numColumns={3}
            columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setSelectedLanguage(item.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedLanguage === item.id ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                    flex: 1,
                  },
                ]}
                className="rounded-lg p-3 border border-border"
              >
                <Text className="text-lg text-center mb-1">{item.flag}</Text>
                <Text
                  className={selectedLanguage === item.id ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}
                >
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>

        {/* Voice Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Voix (présélection)</Text>
          <FlatList
            data={VOICE_LIST}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setSelectedVoice(item.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedVoice === item.id ? colors.primary + '20' : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                    borderColor: selectedVoice === item.id ? colors.primary : colors.border,
                  },
                ]}
                className="flex-row items-center p-3 rounded-lg border mb-2"
              >
                <Text className="text-2xl mr-3">{item.emoji}</Text>
                <Text className={selectedVoice === item.id ? 'text-primary font-semibold flex-1' : 'text-foreground font-semibold flex-1'}>
                  {item.name}
                </Text>
                {selectedVoice === item.id && (
                  <Text className="text-primary text-lg">✓</Text>
                )}
              </Pressable>
            )}
          />
        </View>

        {/* Text Input */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Texte à synthétiser</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Entrez votre texte ici..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={6}
            className="bg-surface border border-border rounded-lg p-4 text-foreground"
            style={{ textAlignVertical: 'top', minHeight: 120 }}
          />
          <Text className="text-xs text-muted mt-2">{text.length} caractères</Text>
        </View>

        {/* Synthesize Button */}
        <View className="px-6 mb-6">
          <Pressable
            onPress={handleSynthesize}
            disabled={isLoading || !text.trim() || !hasModels}
            style={({ pressed }) => [
              {
                backgroundColor: isLoading || !text.trim() || !hasModels ? colors.muted : colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-xl p-4 flex-row items-center justify-center"
          >
            {isLoading ? (
              <>
                <ActivityIndicator color="white" style={{ marginRight: 8 }} />
                <Text className="text-white font-semibold text-center text-lg">
                  Inférence en cours... (modèle local)
                </Text>
              </>
            ) : (
              <Text className="text-white font-semibold text-center text-lg">
                🔊 Synthétiser (on-device)
              </Text>
            )}
          </Pressable>
        </View>

        {/* Result */}
        {synthesisResult && (
          <View className="px-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-1">✓ Synthèse réussie</Text>
              <Text className="text-foreground text-sm mb-1">
                {synthesisResult.sampleRate}Hz · {synthesisResult.frameCount} frames · {synthesisResult.duration.toFixed(1)}s
              </Text>
              <AudioPlayer result={synthesisResult} />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
