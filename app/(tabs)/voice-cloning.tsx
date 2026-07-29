import { ScrollView, Text, View, Pressable, Alert, ActivityIndicator, TextInput } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useState, useEffect } from 'react';
import { videoToAudioService } from '@/lib/services/video-to-audio';
import { localTtsService } from '@/lib/services/local-tts';

const QUALITY_LEVELS = [
  { id: 'fast', label: 'Rapide', description: '~1s' },
  { id: 'normal', label: 'Normal', description: '~3s' },
  { id: 'high', label: 'Haute qualité', description: '~5s' },
];

export default function VoiceCloningScreen() {
  const colors = useColors();
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [convertedAudio, setConvertedAudio] = useState<any>(null);
  const [selectedQuality, setSelectedQuality] = useState('normal');
  const [isCloning, setIsCloning] = useState(false);
  const [cloningResult, setCloningResult] = useState<any>(null);
  const [cloneText, setCloneText] = useState('');

  const handlePickFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      Alert.alert(
        'Sélectionner un fichier audio/vidéo',
        'Choisissez un fichier MP3, WAV, MP4, WebM, etc.',
        [
          {
            text: 'Annuler',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Simuler sélection MP4',
            onPress: () => {
              setSelectedFile({
                name: 'voice-sample.mp4',
                uri: 'file:///sample.mp4',
                size: 5 * 1024 * 1024,
                type: 'video/mp4',
              });
              setConvertedAudio(null);
              setCloningResult(null);
            },
          },
          {
            text: 'Simuler sélection MP3',
            onPress: () => {
              setSelectedFile({
                name: 'voice-sample.mp3',
                uri: 'file:///sample.mp3',
                size: 2 * 1024 * 1024,
                type: 'audio/mpeg',
              });
              setConvertedAudio(null);
              setCloningResult(null);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  // Auto-convert video to audio when file is selected
  useEffect(() => {
    if (selectedFile && !convertedAudio && !isConverting) {
      const autoConvert = async () => {
        // Check if it's a video file that needs conversion
        if (videoToAudioService.isSupportedVideoFormat(selectedFile.name)) {
          setIsConverting(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

          try {
            const result = await videoToAudioService.extractAudio(selectedFile.uri, (progress) => {
              setConversionProgress(progress);
            });

            setConvertedAudio(result);
            setConversionProgress(0);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error('Conversion error:', error);
            Alert.alert('Erreur', 'Impossible de convertir la vidéo');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } finally {
            setIsConverting(false);
          }
        } else if (videoToAudioService.isSupportedAudioFormat(selectedFile.name)) {
          // Already audio, no conversion needed
          setConvertedAudio({
            audioUri: selectedFile.uri,
            duration: 0,
            format: selectedFile.name.split('.').pop()?.toLowerCase() || 'mp3',
            timestamp: Date.now(),
          });
        }
      };

      autoConvert();
    }
  }, [selectedFile, convertedAudio, isConverting]);

  const handleCloneVoice = async () => {
    if (!convertedAudio) {
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
      // Clone voice using local TTS service
      const result = await localTtsService.cloneVoice(
        convertedAudio.audioUri,
        cloneText.trim(),
        selectedQuality as 'fast' | 'normal' | 'high'
      );

      setCloningResult({
        success: true,
        audioUri: result.audioUri,
        duration: result.duration,
        timestamp: result.timestamp,
      });

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
          <Text className="text-sm text-muted mt-2">Créez une voix personnalisée à partir d'un échantillon</Text>
        </View>

        {/* Step 1: Upload Audio/Video */}
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
                <Text className="text-sm text-muted mt-3">Conversion {conversionProgress}%</Text>
              </>
            ) : (
              <>
                <Text className="text-4xl mb-3">🎤</Text>
                <Text className="text-lg font-semibold text-foreground text-center">
                  {selectedFile ? 'Fichier chargé' : 'Charger un fichier'}
                </Text>
                <Text className="text-sm text-muted text-center mt-2">
                  {selectedFile ? selectedFile.name : 'MP3, WAV, MP4, WebM, etc.'}
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* File Info */}
        {selectedFile && (
          <View className="px-6 mb-6">
            <View className="bg-surface rounded-xl p-4 border border-border">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-sm font-semibold text-foreground">Fichier</Text>
                <Text className="text-sm text-muted">{selectedFile.name}</Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-semibold text-foreground">Taille</Text>
                <Text className="text-sm text-muted">{formatBytes(selectedFile.size)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Conversion Status */}
        {convertedAudio && !isConverting && (
          <View className="px-6 mb-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-2">✓ Fichier prêt</Text>
              <Text className="text-sm text-foreground">
                Format: {convertedAudio.format.toUpperCase()}
              </Text>
            </View>
          </View>
        )}

        {/* Step 2: Quality Selection */}
        {convertedAudio && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 2: Qualité de clonage</Text>
            {QUALITY_LEVELS.map((level) => (
              <Pressable
                key={level.id}
                onPress={() => {
                  setSelectedQuality(level.id);
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

        {/* Step 3: Test Text */}
        {convertedAudio && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Étape 3: Texte à synthétiser</Text>
            <TextInput
              value={cloneText}
              onChangeText={setCloneText}
              placeholder="Entrez le texte pour tester la voix clonée..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              className="bg-surface border border-border rounded-lg p-4 text-foreground"
              style={{ textAlignVertical: 'top' }}
            />
          </View>
        )}

        {/* Clone Button */}
        {convertedAudio && (
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

        {/* Result */}
        {cloningResult && (
          <View className="px-6">
            <View className="bg-success/10 border border-success rounded-xl p-4">
              <Text className="text-success font-semibold mb-3">✓ Voix clonée avec succès!</Text>
              <View className="bg-surface rounded-lg p-3 mb-3">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm font-semibold text-foreground">Durée</Text>
                  <Text className="text-xs text-muted font-mono">{cloningResult.duration.toFixed(2)}s</Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="bg-success rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center">▶ Écouter la synthèse</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Info */}
        <View className="px-6 mt-8">
          <View className="bg-primary/10 rounded-xl p-4 border border-primary/20">
            <Text className="text-primary font-semibold mb-2">💡 Conseils</Text>
            <Text className="text-sm text-foreground">• Utilisez un échantillon audio de 3-10 secondes{'\n'}• Voix claire et sans bruit de fond{'\n'}• Formats supportés: MP3, WAV, MP4, WebM</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
