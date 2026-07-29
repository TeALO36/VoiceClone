import { ScrollView, Text, View, Pressable, TextInput, FlatList, Alert } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { localTtsService, LocalTTSOptions } from '@/lib/services/local-tts';

const VOICE_PRESETS = [
  { id: 'male-neutral', name: 'Homme neutre', emoji: '👨' },
  { id: 'female-neutral', name: 'Femme neutre', emoji: '👩' },
  { id: 'male-deep', name: 'Homme grave', emoji: '🧔' },
  { id: 'female-bright', name: 'Femme claire', emoji: '👧' },
  { id: 'child', name: 'Enfant', emoji: '👦' },
];

const LANGUAGES = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'de', name: 'Deutsch' },
  { id: 'it', name: 'Italiano' },
  { id: 'ja', name: '日本語' },
  { id: 'zh', name: '中文' },
];

export default function SynthesisScreen() {
  const colors = useColors();
  const { installedModels, isInitialized } = useTTS();
  
  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState('qwen3');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [selectedVoice, setSelectedVoice] = useState('male-neutral');
  const [selectedQuality, setSelectedQuality] = useState<'fast' | 'normal' | 'high'>('normal');
  const [isLoading, setIsLoading] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<any>(null);

  const handleSynthesize = async () => {
    if (!text.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer du texte');
      return;
    }

    // No API key required - TTS runs locally

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const options: LocalTTSOptions = {
        text: text.trim(),
        language: selectedLanguage,
        voicePreset: selectedVoice,
        quality: selectedQuality as 'fast' | 'normal' | 'high',
      };

      const result = await localTtsService.synthesize(options);
      setSynthesisResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Synthesis error:', error);
      Alert.alert('Erreur', 'Impossible de synthétiser le texte');
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
        </View>

        {/* Model Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
          <View className="flex-row gap-2">
            {[
              { id: 'qwen3', label: 'Qwen3-TTS' },
              { id: 'omnivoice', label: 'OmniVoice' },
            ].map((model) => (
              <Pressable
                key={model.id}
                onPress={() => {
                  setSelectedModel(model.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedModel === model.id ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                className="flex-1 rounded-lg p-3 border border-border"
              >
                <Text
                  className={selectedModel === model.id ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}
                >
                  {model.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
          <Text className="text-sm font-semibold text-foreground mb-3">Voix</Text>
          <FlatList
            data={VOICE_PRESETS}
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
            style={{ textAlignVertical: 'top' }}
          />
          <Text className="text-xs text-muted mt-2">{text.length} caractères</Text>
        </View>

        {/* Synthesize Button */}
        <View className="px-6 mb-6">
          <Pressable
            onPress={handleSynthesize}
            disabled={isLoading || !text.trim()}
            style={({ pressed }) => [
              {
                backgroundColor: isLoading || !text.trim() ? colors.muted : colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-xl p-4"
          >
            <Text className="text-white font-semibold text-center text-lg">
              {isLoading ? 'Synthèse en cours...' : 'Synthétiser'}
            </Text>
          </Pressable>
        </View>

        {/* Result */}
        {synthesisResult && (
          <View className="px-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-2">✓ Synthèse réussie</Text>
              <Text className="text-foreground text-sm">
                Durée: {synthesisResult.duration.toFixed(2)}s
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // Play audio
                }}
                className="mt-3 bg-success rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center">▶ Écouter</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
