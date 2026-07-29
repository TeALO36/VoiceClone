import { ScrollView, Text, View, Pressable, Alert, ActivityIndicator, TextInput, FlatList } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { AudioPlayer } from '@/components/audio-player';
import * as Haptics from 'expo-haptics';
import { useState, useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { videoToAudioService, MediaFileInfo } from '@/lib/services/video-to-audio';
import { localTtsService, getSupportedLanguages, LocalTTSResult } from '@/lib/services/local-tts';

const QUALITY_LEVELS = [
  { id: 'fast', label: 'Rapide', description: 'Synthèse plus rapide, qualité réduite' },
  { id: 'normal', label: 'Normal', description: 'Bon équilibre vitesse/qualité' },
  { id: 'high', label: 'Haute qualité', description: 'Meilleure qualité, plus lent' },
];

const LANGUAGES = getSupportedLanguages();

export default function VoiceCloningScreen() {
  const colors = useColors();
  const [selectedFile, setSelectedFile] = useState<MediaFileInfo | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [selectedQuality, setSelectedQuality] = useState<'fast' | 'normal' | 'high'>('normal');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningResult, setCloningResult] = useState<LocalTTSResult | null>(null);
  const [cloneText, setCloneText] = useState('');

  // ─── Real file picker using expo-document-picker ───
  const handlePickFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const fileInfo = videoToAudioService.analyzeFile({
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType,
      });

      if (!fileInfo.isVideo && !fileInfo.isAudio) {
        Alert.alert('Format non supporté', 'Veuillez sélectionner un fichier audio (MP3, WAV, etc.) ou vidéo (MP4, WebM, etc.)');
        return;
      }

      setSelectedFile(fileInfo);
      setIsReady(false);
      setCloningResult(null);
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  // ─── Auto-convert video to audio in background ───
  useEffect(() => {
    if (!selectedFile || isReady || isConverting) return;

    const autoConvert = async () => {
      // If it's already audio, no conversion needed
      if (selectedFile.isAudio) {
        setIsReady(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      // If it's video, convert to audio in background
      if (selectedFile.isVideo) {
        setIsConverting(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
          await videoToAudioService.extractAudio(selectedFile.uri, (progress) => {
            setConversionProgress(progress);
          });

          setIsReady(true);
          setConversionProgress(0);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Conversion error:', error);
          Alert.alert('Erreur', 'Impossible de convertir la vidéo en audio');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
          setIsConverting(false);
        }
      }
    };

    autoConvert();
  }, [selectedFile, isReady, isConverting]);

  const handleCloneVoice = async () => {
    if (!selectedFile || !isReady) {
      Alert.alert('Erreur', 'Veuillez d\'abord charger un fichier audio/vidéo');
      return;
    }

    if (!cloneText.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le texte à synthétiser');
      return;
    }

    setIsCloning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await localTtsService.cloneVoice(
        selectedFile.uri,
        cloneText.trim(),
        {
          language: selectedLanguage,
          quality: selectedQuality,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
        }
      );

      setCloningResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Cloning error:', error);
      Alert.alert('Erreur', 'Impossible de cloner la voix');
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
        {/* Header */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">Clonage de voix</Text>
          <Text className="text-sm text-muted mt-1">Créez une voix personnalisée à partir d'un échantillon</Text>
        </View>

        {/* Step 1: Upload Audio/Video — single button, auto-detect format */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Étape 1: Charger un fichier</Text>
          <Pressable
            onPress={handlePickFile}
            disabled={isConverting}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                opacity: pressed ? 0.8 : isConverting ? 0.6 : 1,
              },
            ]}
            className="border-2 border-dashed rounded-2xl p-8 items-center justify-center"
          >
            {isConverting ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text className="text-sm text-muted mt-3">
                  {selectedFile?.isVideo ? `Conversion vidéo → audio ${conversionProgress}%` : 'Traitement...'}
                </Text>
              </>
            ) : selectedFile ? (
              <>
                <Text className="text-4xl mb-3">{selectedFile.isVideo ? '🎬' : '🎵'}</Text>
                <Text className="text-lg font-semibold text-foreground text-center">{selectedFile.name}</Text>
                <Text className="text-sm text-muted text-center mt-2">
                  {selectedFile.isVideo ? `Vidéo → Audio (${formatBytes(selectedFile.size)})` : `Audio (${formatBytes(selectedFile.size)})`}
                </Text>
                <Text className="text-xs text-primary text-center mt-2">Toucher pour changer de fichier</Text>
              </>
            ) : (
              <>
                <Text className="text-4xl mb-3">🎤</Text>
                <Text className="text-lg font-semibold text-foreground text-center">Charger un fichier</Text>
                <Text className="text-sm text-muted text-center mt-2">
                  Audio ou vidéo — détecté automatiquement
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Ready status */}
        {isReady && (
          <View className="px-6 mb-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-1">✓ Fichier prêt</Text>
              <Text className="text-sm text-foreground">
                {selectedFile?.isVideo ? 'Vidéo convertie en audio' : 'Fichier audio chargé'} — prêt pour le clonage
              </Text>
            </View>
          </View>
        )}

        {/* Step 2: Language Selection */}
        {isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 2: Langue de synthèse</Text>
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
        )}

        {/* Step 3: Quality Selection */}
        {isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 3: Qualité de clonage</Text>
            {QUALITY_LEVELS.map((level) => (
              <Pressable
                key={level.id}
                onPress={() => {
                  setSelectedQuality(level.id as 'fast' | 'normal' | 'high');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  {
                    backgroundColor: selectedQuality === level.id ? colors.primary + '20' : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                    borderColor: selectedQuality === level.id ? colors.primary : colors.border,
                  },
                ]}
                className="flex-row items-center p-3 rounded-lg border mb-2"
              >
                <View className="flex-1">
                  <Text className={selectedQuality === level.id ? 'text-primary font-semibold' : 'text-foreground font-semibold'}>
                    {level.label}
                  </Text>
                  <Text className="text-xs text-muted mt-1">{level.description}</Text>
                </View>
                <View
                  className={`w-5 h-5 rounded-full border-2 ${
                    selectedQuality === level.id ? `bg-primary border-primary` : `border-border`
                  }`}
                />
              </Pressable>
            ))}
          </View>
        )}

        {/* Step 4: Test Text */}
        {isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 4: Texte à synthétiser</Text>
            <TextInput
              value={cloneText}
              onChangeText={setCloneText}
              placeholder="Entrez le texte pour tester la voix clonée..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              className="bg-surface border border-border rounded-lg p-4 text-foreground"
              style={{ textAlignVertical: 'top', minHeight: 100 }}
            />
            <Text className="text-xs text-muted mt-2">{cloneText.length} caractères</Text>
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
              {isCloning && <ActivityIndicator color="white" style={{ marginRight: 8 }} />}
              <Text className="text-white font-semibold text-center text-lg">
                {isCloning ? 'Clonage en cours...' : '🎙️ Cloner la voix'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Result with working audio player */}
        {cloningResult && (
          <View className="px-6 mb-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-2">✓ Voix clonée avec succès !</Text>
              <Text className="text-sm text-foreground mb-1">
                Langue: {cloningResult.language} | Pitch: {cloningResult.pitch.toFixed(2)}
              </Text>
              <AudioPlayer result={cloningResult} label="Écouter la voix clonée" />
            </View>
          </View>
        )}

        {/* Info */}
        <View className="px-6 mt-4">
          <View className="bg-primary/10 rounded-xl p-4 border border-primary/20">
            <Text className="text-primary font-semibold mb-2">💡 Conseils</Text>
            <Text className="text-sm text-foreground">
              {'• Échantillon audio de 3-10 secondes idéal\n• Voix claire et sans bruit de fond\n• Audio ou vidéo détecté automatiquement\n• La conversion vidéo → audio se fait en arrière-plan'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
