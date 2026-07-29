import { ScrollView, Text, View, Pressable, Alert, ActivityIndicator, TextInput, FlatList } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { AudioPlayer } from '@/components/audio-player';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { getSupportedLanguages } from '@/lib/services/local-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';

const LANGUAGES = getSupportedLanguages();

interface PickedFile {
  name: string;
  uri: string;
  size: number;
  mimeType: string;
}

export default function VoiceCloningScreen() {
  const colors = useColors();
  const { installedModels, getModelPath, ttsEngine } = useTTS();

  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningResult, setCloningResult] = useState<Qwen3TtsResult | null>(null);
  const [cloneText, setCloneText] = useState('');

  const hasModels = installedModels.length > 0;

  const handlePickFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setSelectedFile({
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'audio/wav',
      });
      setIsReady(true);
      setCloningResult(null);
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  const handleCloneVoice = async () => {
    if (!selectedFile || !isReady) {
      Alert.alert('Erreur', 'Veuillez charger un fichier audio');
      return;
    }
    if (!cloneText.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le texte à synthétiser');
      return;
    }

    const modelId = installedModels[0]?.id;
    if (!modelId) {
      Alert.alert('Erreur', 'Aucun modèle installé');
      return;
    }

    setIsCloning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const modelDir = await getModelPath(modelId);
      if (!modelDir) {
        Alert.alert('Erreur', 'Modèle introuvable');
        return;
      }

      // Qwen3-TTS zero-shot voice cloning using ECAPA-TDNN
      const result = await ttsEngine.cloneVoice({
        text: cloneText.trim(),
        referenceAudioUri: selectedFile.uri,
        modelDir,
        language: selectedLanguage,
      });

      setCloningResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Cloning error:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de cloner la voix');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsCloning(false);
    }
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
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">Clonage de voix</Text>
          <Text className="text-sm text-muted mt-1">
            {hasModels
              ? 'Zero-shot voice cloning — mode local'
              : 'Installez un modèle pour commencer'}
          </Text>
        </View>

        {/* No model warning */}
        {!hasModels && (
          <View className="px-6 mb-6">
            <View className="bg-warning/10 rounded-xl p-4 border border-warning/30">
              <Text className="text-warning font-semibold">⚠️ Aucun modèle installé</Text>
              <Text className="text-sm text-muted mt-1">
                Installez Qwen3-TTS dans l'onglet Modèles pour utiliser le clonage vocal.
              </Text>
            </View>
          </View>
        )}

        {/* Step 1: Upload Audio */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Étape 1: Audio de référence</Text>
          <Pressable
            onPress={handlePickFile}
            disabled={!hasModels}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                opacity: pressed ? 0.8 : !hasModels ? 0.5 : 1,
              },
            ]}
            className="border-2 border-dashed rounded-2xl p-8 items-center justify-center"
          >
            {selectedFile ? (
              <>
                <Text className="text-4xl mb-3">🎵</Text>
                <Text className="text-lg font-semibold text-foreground text-center">{selectedFile.name}</Text>
                <Text className="text-sm text-muted text-center mt-2">{formatBytes(selectedFile.size)}</Text>
                <Text className="text-xs text-primary text-center mt-2">Toucher pour changer</Text>
              </>
            ) : (
              <>
                <Text className="text-4xl mb-3">🎤</Text>
                <Text className="text-lg font-semibold text-foreground text-center">Charger un échantillon</Text>
                <Text className="text-sm text-muted text-center mt-2">Audio 3-10 secondes pour le clonage</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Step 2: Language */}
        {isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 2: Langue</Text>
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
                  <Text className={selectedLanguage === item.id ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Step 3: Text */}
        {isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 3: Texte à synthétiser</Text>
            <TextInput
              value={cloneText}
              onChangeText={setCloneText}
              placeholder="Texte pour tester la voix clonée..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              className="bg-surface border border-border rounded-lg p-4 text-foreground"
              style={{ textAlignVertical: 'top', minHeight: 100 }}
            />
          </View>
        )}

        {/* Clone Button */}
        {isReady && (
          <View className="px-6 mb-6">
            <Pressable
              onPress={handleCloneVoice}
              disabled={isCloning || !cloneText.trim()}
              style={({ pressed }) => [
                {
                  backgroundColor: isCloning || !cloneText.trim() ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              className="rounded-xl p-4 flex-row items-center justify-center"
            >
              {isCloning ? (
                <>
                  <ActivityIndicator color="white" style={{ marginRight: 8 }} />
                  <Text className="text-white font-semibold text-center text-lg">
                    Clonage en cours...
                  </Text>
                </>
              ) : (
                <Text className="text-white font-semibold text-center text-lg">
                  🎙️ Cloner la voix
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Result */}
        {cloningResult && (
          <View className="px-6 mb-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-2">✓ Voix clonée avec succès !</Text>
              <Text className="text-sm text-foreground mb-1">
                {cloningResult.sampleRate}Hz · {cloningResult.frameCount} frames
              </Text>
              <AudioPlayer result={cloningResult} label="Écouter la voix clonée" />
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
