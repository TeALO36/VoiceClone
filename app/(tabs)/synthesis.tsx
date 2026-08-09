import { ScrollView, Text, View, Pressable, TextInput, FlatList, Alert } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import { GenerationQueue } from '@/components/generation-queue';
import { ProfilePicker } from '@/components/profile-picker';
import { AdvancedParamsEditor } from '@/components/advanced-params-editor';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { VOICE_PRESETS, getLanguagesForModel, resolvePresetVoice } from '@/lib/services/local-tts';
import type { VoiceProfile } from '@/lib/services/profiles';
import { DEFAULT_SPEECH_PARAMS, type SpeechParams } from '@/lib/services/audio-pipeline';

const VOICE_LIST = Object.entries(VOICE_PRESETS).map(([id, preset]) => ({
  id,
  name: preset.label,
  emoji: preset.emoji,
}));

export default function SynthesisScreen() {
  const colors = useColors();
  const { installedModels, getModelPath, ttsEngine, enqueueGeneration, jobs } = useTTS();

  const [text, setText] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [selectedVoice, setSelectedVoice] = useState('female-neutral');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileVoice, setProfileVoice] = useState<VoiceProfile | null>(null);
  const [params, setParams] = useState<SpeechParams>({ ...DEFAULT_SPEECH_PARAMS });

  const activeModel =
    installedModels.find((m) => m.id === selectedModelId) ?? installedModels[0];
  const LANGUAGES = getLanguagesForModel(activeModel);
  const effectiveLanguage = LANGUAGES.some((l) => l.id === selectedLanguage)
    ? selectedLanguage
    : LANGUAGES[0]?.id ?? 'en';

  const runningCount = jobs.filter(
    (job) => job.kind === 'synthesis' && (job.status === 'queued' || job.status === 'running')
  ).length;

  const hasModels = installedModels.length > 0;

  const handleSelectProfile = (profile: VoiceProfile | null) => {
    setSelectedProfileId(profile?.id ?? null);
    setProfileVoice(profile);
    if (!profile) {
      setSelectedModelId('');
      setSelectedLanguage('fr');
      setParams({ ...DEFAULT_SPEECH_PARAMS });
      return;
    }
    setSelectedModelId(profile.modelId);
    setSelectedLanguage(profile.language);
    setParams({ ...profile.params });
  };

  const handleSynthesize = async () => {
    if (!text.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer du texte');
      return;
    }

    const model = activeModel;
    if (!model) {
      Alert.alert('Erreur', 'Aucun modèle installé. Installez-en un dans l\'onglet Modèles.');
      return;
    }

    const spoken = text.trim();
    const language = effectiveLanguage;
    const chosenParams = params;
    const profile = profileVoice;
    const presetId = selectedVoice;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    enqueueGeneration('synthesis', spoken, async () => {
      const modelDir = await getModelPath(model.id);
      if (!modelDir) throw new Error('Modèle introuvable. Réinstallez-le.');

      // A profile with a reference clones that voice; otherwise the classic
      // TTS path applies (preset voice resolved per engine).
      if (profile?.reference) {
        return ttsEngine.cloneVoice({
          text: spoken,
          referenceAudioUri: profile.reference!.wavUri,
          modelDir,
          engine: model.type,
          language,
          params: chosenParams,
        });
      }

      const preset = resolvePresetVoice(model.type, presetId, modelDir);
      return ttsEngine.synthesize({
        text: spoken,
        modelDir,
        engine: model.type,
        language,
        instruct: preset?.instruct,
        referenceAudioUri: preset?.referenceAudioUri,
        params: chosenParams,
      });
    });

    setText('');
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

        {/* Profile quick-pick */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Profil de voix</Text>
          <ProfilePicker selectedId={selectedProfileId} onSelect={handleSelectProfile} />
          {profileVoice?.reference && (
            <Text className="text-xs text-muted">
              🎙️ Utilise la voix « {profileVoice.reference.sourceName} » clonée.
            </Text>
          )}
        </View>

        {/* Model Selection */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
          {hasModels ? (
            <View className="flex-row gap-2">
              {installedModels.map((model) => (
                <Pressable
                  key={model.id}
                  onPress={() => { setSelectedModelId(model.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={({ pressed }) => [
                    {
                      backgroundColor: activeModel?.id === model.id ? colors.primary : colors.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  className="flex-1 rounded-lg p-3 border border-border"
                >
                  <Text
                    className={activeModel?.id === model.id
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
                Allez dans l&apos;onglet Modèles pour installer un moteur.
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
                onPress={() => { setSelectedLanguage(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={({ pressed }) => [
                  {
                    backgroundColor: effectiveLanguage === item.id ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                    flex: 1,
                  },
                ]}
                className="rounded-lg p-3 border border-border"
              >
                <Text className="text-lg text-center mb-1">{item.flag}</Text>
                <Text
                  className={effectiveLanguage === item.id ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}
                >
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>

        {/* Voice Selection — classic TTS only */}
        {!profileVoice?.reference && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Voix (présélection)</Text>
            {activeModel?.type === 'qwen3' ? (
              <Text className="text-xs text-muted">
                Qwen3-TTS n&apos;expose pas de choix de voix — la voix est définie par le modèle.
              </Text>
            ) : (
              <FlatList
                data={VOICE_LIST}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => { setSelectedVoice(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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
                    {selectedVoice === item.id && <Text className="text-primary text-lg">✓</Text>}
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        {/* Advanced speech parameters */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-1">Paramètres avancés</Text>
          <Text className="text-xs text-muted mb-3">
            Pauses après chaque ponctuation, vitesse et volume.
          </Text>
          <View className="bg-surface border border-border rounded-2xl p-4">
            <AdvancedParamsEditor params={params} onChange={setParams} />
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
            disabled={!text.trim() || !hasModels}
            style={({ pressed }) => [
              {
                backgroundColor: !text.trim() || !hasModels ? colors.muted : colors.primary,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            className="rounded-xl p-4 flex-row items-center justify-center"
          >
            <Text className="text-white font-semibold text-center text-lg">
              {runningCount > 0 ? '🔊 Ajouter à la file' : '🔊 Synthétiser (on-device)'}
            </Text>
          </Pressable>
          {runningCount > 0 && (
            <Text className="text-xs text-muted text-center mt-2">
              {runningCount} génération{runningCount > 1 ? 's' : ''} en cours — vous pouvez en lancer d&apos;autres
            </Text>
          )}
        </View>

        <GenerationQueue kind="synthesis" />
      </ScrollView>
    </ScreenContainer>
  );
}
