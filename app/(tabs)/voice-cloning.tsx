import { ScrollView, Text, View, Pressable, Alert, ActivityIndicator, TextInput, FlatList, Platform } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { GenerationQueue } from '@/components/generation-queue';
import * as Haptics from 'expo-haptics';
import { useState, useRef } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { getSupportedLanguages } from '@/lib/services/local-tts';
import { prepareReference, type Quality } from '@/modules/expo-qwen3-tts';

const LANGUAGES = getSupportedLanguages();

interface PickedFile {
  name: string;
  uri: string;
  playUri: string;
  size: number;
  mimeType: string;
}

function ReferenceAudioPlayer({ uri, label }: { uri: string; label: string }) {
  const colors = useColors();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const handlePlay = async () => {
    if (isPlaying && soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setIsPlaying(false);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (e) {
      console.error('Failed to play reference audio:', e);
      Alert.alert('Erreur', 'Impossible de lire cet échantillon audio');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePlay}
      disabled={isLoading}
      style={({ pressed }) => [
        {
          backgroundColor: isLoading ? colors.muted : isPlaying ? colors.error : colors.primary,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      className="rounded-xl p-3 flex-row items-center justify-center mt-3"
    >
      {isLoading ? (
        <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />
      ) : (
        <Text className="text-white font-semibold text-sm">
          {isPlaying ? '⏹ Arrêter la lecture' : '▶ Écouter l\'échantillon'}
        </Text>
      )}
    </Pressable>
  );
}

export default function VoiceCloningScreen() {
  const colors = useColors();
  const { installedModels, getModelPath, ttsEngine, enqueueGeneration, jobs } = useTTS();

  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [cloneText, setCloneText] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [refDuration, setRefDuration] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [refText, setRefText] = useState('');
  const [quality, setQuality] = useState<Quality>('fast');

  const runningCount = jobs.filter(
    (job) => job.kind === 'clone' && (job.status === 'queued' || job.status === 'running')
  ).length;

  const activeModel =
    installedModels.find((m) => m.id === selectedModelId) ?? installedModels[0];
  // Qwen3-TTS reads the voice off a speaker encoder; OmniVoice aligns against
  // the reference transcript and will not clone without one.
  const needsRefText = activeModel?.type === 'omnivoice';

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
      let playUri = asset.uri;

      if (Platform.OS === 'web') {
        const rawFile = (asset as any).file;
        if (rawFile instanceof File || rawFile instanceof Blob) {
          playUri = URL.createObjectURL(rawFile);
        } else if (asset.uri && !asset.uri.startsWith('blob:') && !asset.uri.startsWith('data:')) {
          try {
            const resp = await fetch(asset.uri);
            const blob = await resp.blob();
            playUri = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('Could not create Blob URL from asset.uri:', e);
          }
        }
      }

      if (selectedFile?.playUri && selectedFile.playUri.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(selectedFile.playUri);
        } catch (_) {}
      }

      setSelectedFile({
        name: asset.name,
        uri: asset.uri,
        playUri: playUri || asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'audio/wav',
      });
      setRefDuration(null);

      if (Platform.OS === 'web') {
        setIsReady(true);
        return;
      }

      // Decode mp3/m4a/mp4/... down to the 24 kHz mono WAV the engines need.
      // Done here rather than at synthesis time so an unusable clip is caught
      // while the user is still looking at the picker.
      setIsReady(false);
      setIsConverting(true);
      try {
        const prepared = await prepareReference(asset.uri);
        setSelectedFile((prev) => (prev ? { ...prev, uri: prepared.uri } : prev));
        setRefDuration(prepared.duration);
        setIsReady(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error: any) {
        console.error('Reference conversion failed:', error);
        Alert.alert('Extrait inutilisable', error?.message || 'Impossible de lire cet extrait audio.');
        setSelectedFile(null);
      } finally {
        setIsConverting(false);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  const handleRemoveFile = () => {
    if (selectedFile?.playUri && selectedFile.playUri.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(selectedFile.playUri);
      } catch (_) {}
    }
    setSelectedFile(null);
    setRefDuration(null);
    setIsReady(false);
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

    const model = installedModels.find((m) => m.id === selectedModelId) ?? installedModels[0];
    if (!model) {
      Alert.alert('Erreur', 'Aucun modèle installé');
      return;
    }

    if (model.type === 'omnivoice' && !refText.trim()) {
      Alert.alert(
        'Transcription manquante',
        'Écrivez ce qui est dit dans l\'extrait de référence. OmniVoice en a besoin pour aligner la voix.'
      );
      return;
    }

    const spoken = cloneText.trim();
    const referenceUri = selectedFile.uri;
    const referenceText = refText.trim();
    const language = selectedLanguage;
    const chosenQuality = quality;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Queued rather than awaited so several clips can be lined up in a row.
    enqueueGeneration('clone', spoken, async () => {
      const modelDir = await getModelPath(model.id);
      if (!modelDir) throw new Error('Modèle introuvable');

      return ttsEngine.cloneVoice({
        text: spoken,
        referenceAudioUri: referenceUri,
        referenceText,
        modelDir,
        engine: model.type,
        language,
        quality: chosenQuality,
      });
    });

    setCloneText('');
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
                Installez un moteur dans l&apos;onglet Modèles pour utiliser le clonage vocal.
              </Text>
            </View>
          </View>
        )}

        {/* Step 1: Upload Audio */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Étape 1: Audio de référence</Text>
          <Text className="text-xs text-muted mb-3">
            Fournissez un échantillon audio de 3 à 10 secondes pour cloner une voix, ou importez une vidéo (MP4, MKV, AVI...) dont l&apos;audio sera extrait automatiquement.
          </Text>

          {selectedFile ? (
            <View className="bg-surface border border-primary/40 rounded-2xl p-4">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center flex-1 mr-2">
                  <View className="w-8 h-8 rounded-full bg-success/20 items-center justify-center mr-3">
                    {isConverting ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text className="text-success font-bold">✓</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                      {selectedFile.name}
                    </Text>
                    <Text className="text-xs text-muted">
                      {isConverting
                        ? 'Extraction de la voix…'
                        : refDuration != null
                          ? `Prêt · ${refDuration.toFixed(1)} s de voix`
                          : `Échantillon vocal chargé · ${formatBytes(selectedFile.size)}`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleRemoveFile}
                  className="bg-error/10 border border-error/30 rounded-lg px-3 py-1.5"
                >
                  <Text className="text-error text-xs font-semibold">Retirer</Text>
                </Pressable>
              </View>

              {/* Audio preview player */}
              {Platform.OS === 'web' ? (
                <View className="mt-2 rounded-xl overflow-hidden bg-background/50 p-2">
                  <audio
                    controls
                    src={selectedFile.playUri}
                    style={{ width: '100%', height: '40px' }}
                    onError={(e) => {
                      console.error('Audio element error:', e);
                    }}
                  />
                </View>
              ) : (
                <ReferenceAudioPlayer uri={selectedFile.playUri} label={selectedFile.name} />
              )}
            </View>
          ) : (
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
              <Text className="text-4xl mb-3">🎤</Text>
              <Text className="text-lg font-semibold text-foreground text-center">
                Charger un fichier audio ou vidéo
              </Text>
              <Text className="text-sm text-muted text-center mt-2">
                Format MP3, WAV, MP4, MKV, AVI (3-10s recommandé)
              </Text>
            </Pressable>
          )}
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

        {/* Reference transcript — OmniVoice refuses to clone without it */}
        {isReady && needsRefText && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-1">
              Que dit l&apos;extrait ?
            </Text>
            <Text className="text-xs text-muted mb-3">
              Recopiez mot pour mot ce qui est prononcé. Le moteur s&apos;en sert pour
              aligner la voix — sans cela le clonage échoue.
            </Text>
            <TextInput
              value={refText}
              onChangeText={setRefText}
              placeholder="Ex : Bonjour, je teste ma voix."
              placeholderTextColor={colors.muted}
              multiline
              className="bg-surface border border-border rounded-lg p-4 text-foreground"
              style={{ textAlignVertical: 'top', minHeight: 70 }}
            />
          </View>
        )}

        {/* Quality — OmniVoice only; Qwen3 has no comparable step knob */}
        {isReady && needsRefText && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Qualité</Text>
            <View className="flex-row gap-2">
              {([
                { id: 'fast' as Quality, label: 'Rapide', hint: '×1' },
                { id: 'balanced' as Quality, label: 'Équilibré', hint: '×2' },
                { id: 'best' as Quality, label: 'Maximale', hint: '×4' },
              ]).map((option) => {
                const active = quality === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      setQuality(option.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => [
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    className="flex-1 rounded-lg p-3 border border-border"
                  >
                    <Text
                      className={active
                        ? 'text-white font-semibold text-center text-xs'
                        : 'text-foreground font-semibold text-center text-xs'}
                    >
                      {option.label}
                    </Text>
                    <Text
                      className={active
                        ? 'text-white/70 text-center text-xs mt-1'
                        : 'text-muted text-center text-xs mt-1'}
                    >
                      {option.hint} temps
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-xs text-muted mt-2">
              La génération est lourde : comptez plusieurs dizaines de secondes par
              phrase, même en mode Rapide.
            </Text>
          </View>
        )}

        {/* Model picker — matters once both OmniVoice and Qwen3 are installed */}
        {isReady && installedModels.length > 1 && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
            <View className="flex-row gap-2 flex-wrap">
              {installedModels.map((model) => {
                const active = (selectedModelId || installedModels[0]?.id) === model.id;
                return (
                  <Pressable
                    key={model.id}
                    onPress={() => {
                      setSelectedModelId(model.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => [
                      {
                        backgroundColor: active ? colors.primary : colors.surface,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    className="flex-1 rounded-lg p-3 border border-border"
                  >
                    <Text
                      className={active
                        ? 'text-white font-semibold text-center'
                        : 'text-foreground font-semibold text-center'}
                    >
                      {model.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Clone Button */}
        {isReady && (
          <View className="px-6 mb-6">
            <Pressable
              onPress={handleCloneVoice}
              disabled={!cloneText.trim()}
              style={({ pressed }) => [
                {
                  backgroundColor: !cloneText.trim() ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              className="rounded-xl p-4 flex-row items-center justify-center"
            >
              <Text className="text-white font-semibold text-center text-lg">
                {runningCount > 0 ? '🎙️ Ajouter à la file' : '🎙️ Cloner la voix'}
              </Text>
            </Pressable>
            {runningCount > 0 && (
              <Text className="text-xs text-muted text-center mt-2">
                {runningCount} clonage{runningCount > 1 ? 's' : ''} en cours — vous pouvez en lancer d&apos;autres
              </Text>
            )}
          </View>
        )}

        <GenerationQueue kind="clone" />
      </ScrollView>
    </ScreenContainer>
  );
}
