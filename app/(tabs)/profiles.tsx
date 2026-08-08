import { ScrollView, Text, View, Pressable, TextInput, FlatList, Alert } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useProfiles } from '@/lib/context/profiles-context';
import { useColors } from '@/hooks/use-colors';
import { useReferencePicker } from '@/hooks/use-reference-picker';
import { ReferenceSourcePicker } from '@/components/reference-source-picker';
import { AdvancedParamsEditor } from '@/components/advanced-params-editor';
import { GenerationQueue } from '@/components/generation-queue';
import { profilesService, type VoiceProfile } from '@/lib/services/profiles';
import { getSupportedLanguages, VOICE_PRESETS, resolvePresetVoice } from '@/lib/services/local-tts';
import { DEFAULT_SPEECH_PARAMS, type SpeechParams } from '@/lib/services/audio-pipeline';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';

const SAMPLE_TEXT: Record<string, string> = {
  fr: 'Bonjour, ceci est un test de ma voix. Comment ça va ?',
  en: 'Hello, this is a test of my voice. How are you?',
  es: 'Hola, esta es una prueba de mi voz. ¿Cómo estás?',
  de: 'Hallo, das ist ein Test meiner Stimme. Wie geht es dir?',
  it: 'Ciao, questo è un test della mia voce. Come stai?',
  pt: 'Olá, este é um teste da minha voz. Como você está?',
  ja: 'こんにちは、これは私の声のテストです。お元気ですか？',
  zh: '你好，这是我的声音测试。你好吗？',
  ko: '안녕하세요, 이것은 제 목소리 테스트입니다. 잘 지내세요?',
};

function sampleText(language: string): string {
  return SAMPLE_TEXT[language] ?? SAMPLE_TEXT.en;
}

export default function ProfilesScreen() {
  const colors = useColors();
  const { profiles, saveProfile, deleteProfile } = useProfiles();
  const { installedModels, getModelPath, ttsEngine, enqueueGeneration } = useTTS();

  // undefined = list view; null = new profile; VoiceProfile = edit existing.
  const [editing, setEditing] = useState<VoiceProfile | null | undefined>(undefined);

  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [language, setLanguage] = useState('fr');
  const [params, setParams] = useState<SpeechParams>({ ...DEFAULT_SPEECH_PARAMS });
  const [presetVoice, setPresetVoice] = useState('female-neutral');
  const picker = useReferencePicker();

  const openNew = () => {
    setName('');
    setModelId(installedModels[0]?.id ?? '');
    setLanguage('fr');
    setParams({ ...DEFAULT_SPEECH_PARAMS });
    setPresetVoice('female-neutral');
    picker.removeReference();
    setEditing(null);
  };

  const openEdit = (profile: VoiceProfile) => {
    setName(profile.name);
    setModelId(profile.modelId);
    setLanguage(profile.language);
    setParams({ ...profile.params });
    setPresetVoice('female-neutral');
    if (profile.reference) {
      picker.setReference({
        name: profile.reference.sourceName,
        wavUri: profile.reference.wavUri,
        playUri: profile.reference.wavUri,
        duration: profile.reference.duration,
        sourceType: profile.reference.sourceType,
        size: 0,
      });
    } else {
      picker.removeReference();
    }
    setEditing(profile);
  };

  const activeModel = installedModels.find((m) => m.id === modelId) ?? installedModels[0];
  const engine = activeModel?.type;
  const LANGUAGES = getSupportedLanguages(engine);
  const effectiveLanguage = LANGUAGES.some((l) => l.id === language) ? language : LANGUAGES[0]?.id ?? 'en';

  const canSave = name.trim().length > 0 && !!activeModel;

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Erreur', 'Donnez un nom au profil et choisissez un modèle.');
      return;
    }

    const base: VoiceProfile = editing ?? profilesService.defaultProfile({});
    const profile: VoiceProfile = {
      ...base,
      name: name.trim(),
      modelId: activeModel!.id,
      engine: activeModel!.type,
      language: effectiveLanguage,
      params,
      reference: picker.reference
        ? {
            sourceType: picker.reference.sourceType,
            sourceName: picker.reference.name,
            wavUri: editing?.reference?.wavUri ?? picker.reference.wavUri,
            duration: picker.reference.duration ?? 0,
          }
        : undefined,
    };

    // Persist the reference WAV into the profile dir. saveProfile skips the
    // copy when the source is already the profile's own persisted file.
    await saveProfile(profile, picker.reference?.wavUri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(undefined);
  };

  const handleTest = async () => {
    if (!activeModel) {
      Alert.alert('Erreur', 'Installez un modèle d\u2019abord.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const spoken = sampleText(effectiveLanguage);

    enqueueGeneration('clone', spoken, async () => {
      const modelDir = await getModelPath(activeModel.id);
      if (!modelDir) throw new Error('Modèle introuvable');

      if (picker.reference) {
        return ttsEngine.cloneVoice({
          text: spoken,
          referenceAudioUri: picker.reference.wavUri,
          modelDir,
          engine: activeModel.type,
          language: effectiveLanguage,
          params,
        });
      }
      // Classic TTS: resolve the preset voice for this engine.
      const preset = resolvePresetVoice(activeModel.type, presetVoice, modelDir);
      return ttsEngine.synthesize({
        text: spoken,
        modelDir,
        engine: activeModel.type,
        language: effectiveLanguage,
        instruct: preset?.instruct,
        referenceAudioUri: preset?.referenceAudioUri,
        params,
      });
    });
  };

  // ── List view ────────────────────────────────────────────────────────

  if (editing === undefined) {
    return (
      <ScreenContainer className="bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
          <View className="px-6 pt-6 pb-4">
            <Text className="text-2xl font-bold text-foreground">Profils de voix</Text>
            <Text className="text-sm text-muted mt-1">
              Enregistrez une voix, son modèle, sa langue et vos paramètres de parole.
            </Text>
          </View>

          {profiles.length === 0 ? (
            <View className="px-6 items-center py-12">
              <Text className="text-5xl mb-4">🗣️</Text>
              <Text className="text-lg text-foreground font-semibold text-center">
                Aucun profil enregistré
              </Text>
              <Text className="text-sm text-muted text-center mt-2 mb-6">
                Créez un profil pour retrouver instantanément une voix clonée avec
                tous ses réglages (pauses, vitesse, volume).
              </Text>
            </View>
          ) : (
            <View className="px-6">
              {profiles.map((profile) => (
                <View key={profile.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 mr-2">
                      <Text className="text-base font-semibold text-foreground">{profile.name}</Text>
                      <Text className="text-xs text-muted mt-1">
                        {profile.reference
                          ? `${profile.reference.sourceType === 'record' ? '🎙️' : profile.reference.sourceType === 'video' ? '🎬' : '📁'} ${profile.reference.sourceName}`
                          : '🎧 Voix prédéfinie'}
                        {' · '}{profile.language.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-1 mb-3">
                    {profile.params.speed !== 1 && (
                      <ParamBadge label={`${profile.params.speed.toFixed(2)}×`} />
                    )}
                    {profile.params.pauseAfterCommaMs > 0 && <ParamBadge label={`, ${profile.params.pauseAfterCommaMs}ms`} />}
                    {profile.params.pauseAfterPeriodMs > 0 && <ParamBadge label={`. ${profile.params.pauseAfterPeriodMs}ms`} />}
                    {profile.params.pauseAfterQuestionMs > 0 && <ParamBadge label={`? ${profile.params.pauseAfterQuestionMs}ms`} />}
                    {profile.params.volume !== 1 && <ParamBadge label={`vol ${Math.round(profile.params.volume * 100)}%`} />}
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => openEdit(profile)}
                      className="flex-1 bg-primary rounded-lg p-2"
                    >
                      <Text className="text-white font-semibold text-center text-sm">Modifier</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Alert.alert('Supprimer le profil', `Supprimer « ${profile.name} » ?`, [
                          { text: 'Annuler', style: 'cancel' },
                          { text: 'Supprimer', style: 'destructive', onPress: () => deleteProfile(profile.id) },
                        ]);
                      }}
                      className="flex-1 bg-error rounded-lg p-2"
                    >
                      <Text className="text-white font-semibold text-center text-sm">Supprimer</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View className="px-6 mt-2">
            <Pressable
              onPress={openNew}
              disabled={installedModels.length === 0}
              style={({ pressed }) => [
                {
                  backgroundColor: installedModels.length === 0 ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              className="rounded-xl p-4 items-center"
            >
              <Text className="text-white font-semibold text-lg">＋ Nouveau profil</Text>
            </Pressable>
            {installedModels.length === 0 && (
              <Text className="text-xs text-muted text-center mt-2">
                Installez d&apos;abord un modèle (onglet Modèles).
              </Text>
            )}
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Editor view ──────────────────────────────────────────────────────

  const isNew = editing === null;

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        <View className="px-6 pt-6 pb-4 flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-2xl font-bold text-foreground">
              {isNew ? 'Nouveau profil' : 'Modifier le profil'}
            </Text>
            <Text className="text-sm text-muted mt-1">
              {isNew ? 'Tout est enregistré : modèle, langue, voix et paramètres.' : 'Modifiez puis enregistrez.'}
            </Text>
          </View>
          <Pressable onPress={() => setEditing(undefined)} className="bg-border/40 rounded-lg px-3 py-2">
            <Text className="text-sm text-foreground font-semibold">✕ Fermer</Text>
          </Pressable>
        </View>

        {/* Name */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-2">Nom du profil</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex : Voix de Thomas"
            placeholderTextColor={colors.muted}
            className="bg-surface border border-border rounded-lg p-3 text-foreground"
          />
        </View>

        {/* Model */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-3">Modèle</Text>
          {installedModels.length > 0 ? (
            <View className="flex-row gap-2 flex-wrap">
              {installedModels.map((model) => (
                <Pressable
                  key={model.id}
                  onPress={() => { setModelId(model.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={({ pressed }) => [
                    {
                      backgroundColor: activeModel?.id === model.id ? colors.primary : colors.surface,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  className="flex-1 rounded-lg p-3 border border-border"
                >
                  <Text className={activeModel?.id === model.id ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}>
                    {model.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-sm text-muted">Aucun modèle installé.</Text>
          )}
        </View>

        {/* Language */}
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
                onPress={() => { setLanguage(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
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

        {/* Voice source */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-1">Voix de référence</Text>
          <Text className="text-xs text-muted mb-3">
            Chargez un fichier, une vidéo ou enregistrez-vous. Sans référence, une voix prédéfinie est utilisée.
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
          />
          {!picker.reference && (
            <View className="mt-4">
              <Text className="text-xs font-semibold text-foreground mb-2">Voix prédéfinie (TTS classique)</Text>
              <View className="flex-row gap-2 flex-wrap">
                {Object.entries(VOICE_PRESETS).map(([id, preset]) => (
                  <Pressable
                    key={id}
                    onPress={() => { setPresetVoice(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    style={({ pressed }) => [
                      { backgroundColor: presetVoice === id ? colors.primary + '20' : colors.surface, opacity: pressed ? 0.8 : 1 },
                    ]}
                    className="rounded-full border px-3 py-1.5"
                  >
                    <Text className="text-xs font-medium" style={{ color: presetVoice === id ? colors.primary : colors.foreground }}>
                      {preset.emoji} {preset.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Advanced params */}
        <View className="px-6 mb-6">
          <Text className="text-sm font-semibold text-foreground mb-1">Paramètres avancés</Text>
          <Text className="text-xs text-muted mb-3">
            Appliqués au clonage : pauses après chaque ponctuation, vitesse et volume.
          </Text>
          <View className="bg-surface border border-border rounded-2xl p-4">
            <AdvancedParamsEditor params={params} onChange={setParams} />
          </View>
        </View>

        {/* Actions */}
        <View className="px-6 mb-6">
          <Pressable
            onPress={handleTest}
            disabled={!activeModel}
            style={({ pressed }) => [
              { backgroundColor: !activeModel ? colors.muted : colors.secondary, opacity: pressed ? 0.9 : 1 },
            ]}
            className="rounded-xl p-3 items-center mb-3"
          >
            <Text className="text-white font-semibold text-center">▶ Tester le profil</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={({ pressed }) => [
              { backgroundColor: !canSave ? colors.muted : colors.primary, opacity: pressed ? 0.9 : 1 },
            ]}
            className="rounded-xl p-4 items-center"
          >
            <Text className="text-white font-semibold text-lg">
              {isNew ? '💾 Enregistrer le profil' : '💾 Enregistrer les modifications'}
            </Text>
          </Pressable>
        </View>

        <GenerationQueue kind="clone" />
      </ScrollView>
    </ScreenContainer>
  );
}

function ParamBadge({ label }: { label: string }) {
  return (
    <View className="bg-primary/20 rounded-full px-2 py-0.5">
      <Text className="text-[10px] text-primary font-medium">{label}</Text>
    </View>
  );
}
