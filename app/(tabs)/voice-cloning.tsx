import { ScrollView, Text, View, Pressable, Alert, TextInput, FlatList } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useProfiles } from '@/lib/context/profiles-context';
import { useColors } from '@/hooks/use-colors';
import { GenerationQueue } from '@/components/generation-queue';
import { ProfilePicker } from '@/components/profile-picker';
import { ReferenceSourcePicker } from '@/components/reference-source-picker';
import { AdvancedParamsEditor } from '@/components/advanced-params-editor';
import { useReferencePicker } from '@/hooks/use-reference-picker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { getLanguagesForModel } from '@/lib/services/local-tts';
import type { Quality } from '@/modules/expo-qwen3-tts';
import type { VoiceProfile } from '@/lib/services/profiles';
import { DEFAULT_SPEECH_PARAMS, type SpeechParams } from '@/lib/services/audio-pipeline';

export default function VoiceCloningScreen() {
  const colors = useColors();
  const { installedModels, getModelPath, ttsEngine, enqueueGeneration, jobs } = useTTS();
  const { saveProfile } = useProfiles();

  const picker = useReferencePicker();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('fr');
  const [cloneText, setCloneText] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [refText, setRefText] = useState('');
  const [quality, setQuality] = useState<Quality>('best');
  const [params, setParams] = useState<SpeechParams>({ ...DEFAULT_SPEECH_PARAMS });
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const runningCount = jobs.filter(
    (job) => job.kind === 'clone' && (job.status === 'queued' || job.status === 'running')
  ).length;

  const activeModel =
    installedModels.find((m) => m.id === selectedModelId) ?? installedModels[0];
  // Qwen3-TTS reads the voice off a speaker encoder and ignores any transcript.
  // OmniVoice can use one for extra context but clones fine without it.
  // Pocket TTS does not need a transcript at all.
  const usesRefText = activeModel?.type === 'omnivoice';
  const LANGUAGES = getLanguagesForModel(activeModel);
  const effectiveLanguage = LANGUAGES.some((l) => l.id === selectedLanguage)
    ? selectedLanguage
    : LANGUAGES[0]?.id ?? 'en';

  const hasModels = installedModels.length > 0;

  const handleSelectProfile = (profile: VoiceProfile | null) => {
    setSelectedProfileId(profile?.id ?? null);
    if (!profile) {
      // Keep the user's own picked reference; just reset model/lang/params.
      setSelectedModelId('');
      setSelectedLanguage('fr');
      setParams({ ...DEFAULT_SPEECH_PARAMS });
      return;
    }
    setSelectedModelId(profile.modelId);
    setSelectedLanguage(profile.language);
    setParams({ ...profile.params });
    if (profile.reference) {
      picker.setReference({
        name: profile.reference.sourceName,
        wavUri: profile.reference.wavUri,
        playUri: profile.reference.wavUri,
        duration: profile.reference.duration,
        sourceType: profile.reference.sourceType,
        size: 0,
      });
    }
  };

  const handleCloneVoice = async () => {
    if (!picker.reference || !picker.isReady) {
      Alert.alert('Erreur', 'Veuillez charger ou enregistrer un échantillon vocal');
      return;
    }
    if (!cloneText.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le texte à synthétiser');
      return;
    }

    const model = activeModel;
    if (!model) {
      Alert.alert('Erreur', 'Aucun modèle installé');
      return;
    }

    const spoken = cloneText.trim();
    const referenceUri = picker.reference.wavUri;
    const referenceText = refText.trim();
    const language = effectiveLanguage;
    const chosenQuality = quality;
    const chosenParams = params;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
        params: chosenParams,
      });
    });

    setCloneText('');
  };

  const handleSaveProfile = async () => {
    const model = activeModel;
    if (!model) {
      Alert.alert('Erreur', 'Aucun modèle installé');
      return;
    }
    const name = saveName.trim();
    if (!name) {
      Alert.alert('Erreur', 'Donnez un nom au profil');
      return;
    }
    if (!picker.reference) {
      Alert.alert('Erreur', 'Choisissez d\u2019abord un échantillon vocal');
      return;
    }

    const base = selectedProfileId ? { id: selectedProfileId } : {};
    await saveProfile(
      {
        ...base,
        name,
        modelId: model.id,
        engine: model.type,
        language: effectiveLanguage,
        params,
        reference: {
          sourceType: picker.reference.sourceType,
          sourceName: picker.reference.name,
          wavUri: picker.reference.wavUri,
          duration: picker.reference.duration ?? 0,
        },
      } as VoiceProfile,
      // saveProfile skips the copy when the source is already the profile's
      // own persisted file.
      picker.reference.wavUri
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSave(false);
    setSaveName('');
    Alert.alert('Profil enregistré', `« ${name} » est disponible dans l\u2019onglet Profils.`);
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

        {/* Profile quick-pick */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Profil de voix</Text>
          <ProfilePicker selectedId={selectedProfileId} onSelect={handleSelectProfile} />
        </View>

        {/* Step 1: Reference */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Étape 1: Audio de référence</Text>
          <Text className="text-xs text-muted mb-3">
            Échantillon de 3 à 10 s pour cloner la voix — fichier audio, enregistrement direct,
            ou vidéo dont l&apos;audio est extrait automatiquement.
          </Text>
          <ReferenceSourcePicker
            reference={picker.reference}
            isReady={picker.isReady}
            isConverting={picker.isConverting}
            isRecording={picker.isRecording}
            onPick={picker.pickFile}
            onRecord={picker.startRecording}
            onStopRecord={picker.stopRecording}
            onRemove={picker.removeReference}
            disabled={!hasModels}
          />
        </View>

        {/* Step 2: Language */}
        {picker.isReady && (
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
                  <Text className={effectiveLanguage === item.id ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Step 3: Text */}
        {picker.isReady && (
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

        {/* Reference transcript — OmniVoice only */}
        {picker.isReady && usesRefText && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-1">
              Que dit l&apos;extrait ? <Text className="text-muted font-normal">(facultatif)</Text>
            </Text>
            <Text className="text-xs text-muted mb-3">
              Recopier ce qui est prononcé donne au moteur un repère de plus et améliore la ressemblance.
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

        {/* Quality — OmniVoice only */}
        {picker.isReady && usesRefText && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Qualité</Text>
            <View className="flex-row gap-2">
              {([
                { id: 'best' as Quality, label: 'Fidèle', hint: 'recommandé' },
                { id: 'balanced' as Quality, label: 'Équilibré', hint: '2× plus vite' },
                { id: 'fast' as Quality, label: 'Rapide', hint: 'peut bafouiller' },
              ]).map((option) => {
                const active = quality === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => { setQuality(option.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={({ pressed }) => [
                      { backgroundColor: active ? colors.primary : colors.surface, opacity: pressed ? 0.8 : 1 },
                    ]}
                    className="flex-1 rounded-lg p-3 border border-border"
                  >
                    <Text className={active ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}>
                      {option.label}
                    </Text>
                    <Text className={active ? 'text-white/70 text-center text-xs mt-1' : 'text-muted text-center text-xs mt-1'}>
                      {option.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-xs text-muted mt-2">
              La génération est lourde : comptez plusieurs dizaines de secondes par phrase.
              Pocket TTS est beaucoup plus rapide.
            </Text>
          </View>
        )}

        {/* Advanced speech parameters */}
        {picker.isReady && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-1">Paramètres avancés</Text>
            <Text className="text-xs text-muted mb-3">
              Pauses après chaque ponctuation, vitesse et volume — appliqués à la voix clonée.
            </Text>
            <View className="bg-surface border border-border rounded-2xl p-4">
              <AdvancedParamsEditor params={params} onChange={setParams} />
            </View>
          </View>
        )}

        {/* Model picker */}
        {picker.isReady && installedModels.length > 1 && (
          <View className="px-6 mb-6">
            <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
            <View className="flex-row gap-2 flex-wrap">
              {installedModels.map((model) => {
                const active = activeModel?.id === model.id;
                return (
                  <Pressable
                    key={model.id}
                    onPress={() => { setSelectedModelId(model.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={({ pressed }) => [
                      { backgroundColor: active ? colors.primary : colors.surface, opacity: pressed ? 0.8 : 1 },
                    ]}
                    className="flex-1 rounded-lg p-3 border border-border"
                  >
                    <Text className={active ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}>
                      {model.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Clone Button */}
        {picker.isReady && (
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

        {/* Save as profile */}
        {picker.isReady && (
          <View className="px-6 mb-6">
            {!showSave ? (
              <Pressable
                onPress={() => setShowSave(true)}
                className="border border-primary/40 rounded-xl p-3 items-center"
              >
                <Text className="text-primary font-semibold">💾 Enregistrer ce profil de voix</Text>
              </Pressable>
            ) : (
              <View className="bg-surface border border-border rounded-xl p-4">
                <Text className="text-sm font-semibold text-foreground mb-2">Nom du profil</Text>
                <TextInput
                  value={saveName}
                  onChangeText={setSaveName}
                  placeholder="Ex : Voix de Thomas"
                  placeholderTextColor={colors.muted}
                  className="bg-background border border-border rounded-lg p-3 text-foreground mb-3"
                />
                <View className="flex-row gap-2">
                  <Pressable onPress={() => setShowSave(false)} className="flex-1 bg-border/40 rounded-lg p-3">
                    <Text className="text-center text-sm text-foreground font-semibold">Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveProfile}
                    disabled={!saveName.trim()}
                    style={({ pressed }) => [
                      { backgroundColor: !saveName.trim() ? colors.muted : colors.primary, opacity: pressed ? 0.9 : 1 },
                    ]}
                    className="flex-1 rounded-lg p-3"
                  >
                    <Text className="text-center text-sm text-white font-semibold">Enregistrer</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        <GenerationQueue kind="clone" />
      </ScrollView>
    </ScreenContainer>
  );
}
