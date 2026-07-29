import { ScrollView, Text, View, Pressable, TextInput, FlatList, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { AudioPlayer } from '@/components/audio-player';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { localTtsService, VOICE_PRESETS, getSupportedLanguages, LocalTTSResult } from '@/lib/services/local-tts';

const VOICE_LIST = Object.entries(VOICE_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.label,
  emoji: preset.emoji,
}));

const LANGUAGES = getSupportedLanguages();

export default function SynthesisScreen() {
  const colors = useColors();
  const { installedModels } = useTTS();

  const [text, setText] = useState('');
  const [selectedModel, setSelectedModel] = useState('qwen3');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [selectedVoice, setSelectedVoice] = useState('male-neutral');
  const [selectedQuality, setSelectedQuality] = useState<'fast' | 'normal' | 'high'>('normal');
  const [isLoading, setIsLoading] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<LocalTTSResult | null>(null);

  const handleSynthesize = async () => {
    if (!text.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer du texte');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await localTtsService.synthesize({
        text: text.trim(),
        language: selectedLanguage,
        voicePreset: selectedVoice,
        quality: selectedQuality,
      });
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
          <Text className="text-sm text-muted mt-1">Entrez du texte et choisissez votre voix</Text>
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
          <Text className="text-sm font-semibold text-foreground mb-3">Voix</Text>
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

        {/* Quality Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Qualité</Text>
          <View className="flex-row gap-2">
            {[
              { id: 'fast', label: 'Rapide' },
              { id: 'normal', label: 'Normal' },
              { id: 'high', label: 'Haute' },
            ].map((q) => (
              <Pressable
                key={q.id}
                onPress={() => {
                  setSelectedQuality(q.id as 'fast' | 'normal' | 'high');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedQuality === q.id ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                className="flex-1 rounded-lg p-2 border border-border"
              >
                <Text
                  className={selectedQuality === q.id ? 'text-white font-semibold text-center text-sm' : 'text-foreground font-semibold text-center text-sm'}
                >
                  {q.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
            disabled={isLoading || !text.trim()}
            style={({ pressed }) => [
              {
                backgroundColor: isLoading || !text.trim() ? colors.muted : colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-xl p-4 flex-row items-center justify-center"
          >
            {isLoading && <ActivityIndicator color="white" style={{ marginRight: 8 }} />}
            <Text className="text-white font-semibold text-center text-lg">
              {isLoading ? 'Synthèse en cours...' : '🔊 Synthétiser'}
            </Text>
          </Pressable>
        </View>

        {/* Result with working audio player */}
        {synthesisResult && (
          <View className="px-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-1">✓ Synthèse réussie</Text>
              <Text className="text-foreground text-sm mb-1">
                Langue: {synthesisResult.language} | Voix: {VOICE_PRESETS[synthesisResult.voicePreset]?.label || 'Clonée'}
              </Text>
              <AudioPlayer result={synthesisResult} />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
