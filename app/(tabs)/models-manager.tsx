import { ScrollView, Text, View, Pressable, FlatList, Alert, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useTTS } from '@/lib/context/tts-context';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { TTSModel, POCKET_VARIANTS } from '@/lib/services/models';

export default function ModelsManagerScreen() {
  const colors = useColors();
  const router = useRouter();
  const { installedModels, availableModels, downloadingModels, downloadModel, deleteModel, totalStorageUsed, freeStorage } = useTTS();
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('available');

  // Pocket TTS variants are shown as a single grouped card with a language /
  // fidelity selector instead of eleven near-identical entries.
  const pocketAvailable = availableModels.filter((m) => m.type === 'pocket');
  const otherAvailable = availableModels.filter((m) => m.type !== 'pocket');
  const pocketInstalled = installedModels.filter((m) => m.type === 'pocket');
  const otherInstalled = installedModels.filter((m) => m.type !== 'pocket');
  const availableCount = otherAvailable.length + (pocketAvailable.length > 0 ? 1 : 0);
  const installedCount = otherInstalled.length + (pocketInstalled.length > 0 ? 1 : 0);

  const handleDownloadModel = async (modelId: string, modelName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ─── Prevent duplicate install — double check ───
    const alreadyInstalled = installedModels.some((m) => m.id === modelId);
    if (alreadyInstalled) {
      Alert.alert('Déjà installé', `"${modelName}" est déjà installé.`);
      return;
    }

    // downloadModel REJECTS rather than returning false when it refuses the
    // install outright — running out of storage being the usual reason. That
    // rejection used to escape as an unhandled promise: the progress bar
    // appeared for the few milliseconds before the context's `finally` cleared
    // it, then the button simply offered the download again and said nothing
    // about why it had not started. The Qwen3 models need 1.8 GB (0.6B) and
    // 3.0 GB (1.7B) free, so they were the ones that kept failing in silence.
    try {
      const success = await downloadModel(modelId);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Switch to installed tab to show the newly installed model
        setActiveTab('installed');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Erreur', 'Impossible de télécharger le modèle');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Téléchargement impossible',
        error?.message || 'Impossible de télécharger le modèle'
      );
    }
  };

  const handleDeleteModel = (modelId: string, modelName: string) => {
    Alert.alert(
      'Supprimer le modèle',
      `Êtes-vous sûr de vouloir supprimer "${modelName}" ?`,
      [
        { text: 'Annuler', onPress: () => {}, style: 'cancel' },
        {
          text: 'Supprimer',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const success = await deleteModel(modelId);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erreur', 'Impossible de supprimer le modèle');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderModelCard = (model: TTSModel, isInstalled: boolean) => {
    const downloadProgress = downloadingModels[model.id];
    const isDownloading = downloadProgress !== undefined;

    return (
      <View key={model.id} className="bg-surface rounded-xl p-4 mb-3 border border-border">
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">{model.name}</Text>
            <Text className="text-xs text-muted mt-1">{model.description}</Text>
          </View>
          <Text className="text-xs text-muted ml-2">{formatBytes(model.size)}</Text>
        </View>

        {/* Languages */}
        <View className="flex-row gap-1 flex-wrap mb-3">
          {model.languages.slice(0, 3).map((lang) => (
            <View key={lang} className="bg-primary/20 rounded-full px-2 py-1">
              <Text className="text-xs text-primary font-medium">{lang}</Text>
            </View>
          ))}
          {model.languages.length > 3 && (
            <View className="bg-primary/20 rounded-full px-2 py-1">
              <Text className="text-xs text-primary font-medium">+{model.languages.length - 3}</Text>
            </View>
          )}
        </View>

        {/* Capabilities — atouts & limites de chaque moteur */}
        <CapabilityBadges capabilities={model.capabilities} />

        {/* Download Progress */}
        {isDownloading && (
          <View className="mb-3">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs text-muted">Téléchargement...</Text>
              <Text className="text-xs text-muted">{downloadProgress}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full bg-primary"
                style={{ width: `${downloadProgress}%` }}
              />
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-2">
          {isInstalled ? (
            <>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(tabs)/synthesis');
                }}
                className="flex-1 bg-primary rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">Utiliser</Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteModel(model.id, model.name)}
                className="flex-1 bg-error rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">Supprimer</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => handleDownloadModel(model.id, model.name)}
              disabled={isDownloading}
              style={({ pressed }) => [
                {
                  backgroundColor: isDownloading ? colors.muted : colors.primary,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              className="flex-1 rounded-lg p-2 flex-row items-center justify-center"
            >
              {isDownloading && <ActivityIndicator color="white" size="small" style={{ marginRight: 6 }} />}
              <Text className="text-white font-semibold text-center text-sm">
                {isDownloading ? `Téléchargement ${downloadProgress}%` : 'Installer'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">Gestionnaire de modèles</Text>
        </View>

        {/* Storage Info */}
        <View className="px-6 mb-6">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-sm font-semibold text-foreground">Stockage utilisé</Text>
              <Text className="text-sm font-semibold text-primary">{formatBytes(totalStorageUsed)}</Text>
            </View>
            {/* Fill against the space actually available rather than an
                invented 10 GB ceiling — an install is refused on free space,
                so that is what the bar should be measuring against. */}
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full bg-primary"
                style={{
                  width: `${
                    totalStorageUsed + freeStorage > 0
                      ? Math.min((totalStorageUsed / (totalStorageUsed + freeStorage)) * 100, 100)
                      : 0
                  }%`,
                }}
              />
            </View>
            {/* The largest model needs 3 GB free. Downloads are rejected before
                they start when there is not enough room, so the figure has to
                be visible here or a refusal looks like a bug. */}
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-xs text-muted">Espace libre</Text>
              <Text
                className={
                  freeStorage < 2 * 1024 * 1024 * 1024
                    ? 'text-xs font-semibold text-warning'
                    : 'text-xs text-muted'
                }
              >
                {formatBytes(freeStorage)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View className="px-6 mb-6 flex-row gap-3">
          <Pressable
            onPress={() => {
              setActiveTab('available');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [
              {
                backgroundColor: activeTab === 'available' ? colors.primary : colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            className="flex-1 rounded-lg p-3 border border-border"
          >
            <Text
              className={activeTab === 'available' ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}
            >
              Disponibles ({availableCount})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTab('installed');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={({ pressed }) => [
              {
                backgroundColor: activeTab === 'installed' ? colors.primary : colors.surface,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            className="flex-1 rounded-lg p-3 border border-border"
          >
            <Text
              className={activeTab === 'installed' ? 'text-white font-semibold text-center' : 'text-foreground font-semibold text-center'}
            >
              Installés ({installedCount})
            </Text>
          </Pressable>
        </View>

        {/* Models List */}
        <View className="px-6">
          {activeTab === 'installed' ? (
            <>
              {installedCount > 0 ? (
                <>
                  <FlatList
                    data={otherInstalled}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => renderModelCard(item, true)}
                  />
                  {pocketInstalled.length > 0 && (
                    <PocketInstalledCard models={pocketInstalled} onDelete={handleDeleteModel} />
                  )}
                </>
              ) : (
                <View className="items-center justify-center py-12">
                  <Text className="text-4xl mb-3">📦</Text>
                  <Text className="text-lg text-muted">Aucun modèle installé</Text>
                  <Text className="text-sm text-muted mt-2">Installez un modèle pour commencer</Text>
                  <Pressable
                    onPress={() => {
                      setActiveTab('available');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => [
                      { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                    ]}
                    className="mt-4 rounded-lg px-6 py-3"
                  >
                    <Text className="text-white font-semibold">Voir les modèles disponibles</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <>
              {availableCount > 0 ? (
                <>
                  <FlatList
                    data={otherAvailable}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => renderModelCard(item, false)}
                  />
                  {pocketAvailable.length > 0 && (
                    <PocketAvailableCard
                      models={pocketAvailable}
                      installedIds={new Set(installedModels.map((m) => m.id))}
                      downloadingModels={downloadingModels}
                      onInstall={handleDownloadModel}
                    />
                  )}
                </>
              ) : (
                <View className="items-center justify-center py-12">
                  <Text className="text-4xl mb-3">✅</Text>
                  <Text className="text-lg text-muted">Tous les modèles sont installés !</Text>
                  <Text className="text-sm text-muted mt-2">Aucun modèle supplémentaire disponible</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Shared helpers for the model cards ─────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/** « ✍️ Style par texte » badge + atouts / limites of an engine. */
function CapabilityBadges({ capabilities }: { capabilities?: TTSModel['capabilities'] }) {
  if (!capabilities) return null;
  return (
    <View className="mb-3">
      <View className="mb-2">
        {capabilities.instruct === 'attributes' ? (
          <View className="bg-primary/15 self-start rounded-full px-2 py-1">
            <Text className="text-xs text-primary font-semibold">
              ✍️ Style par texte : oui (attributs de voix)
            </Text>
          </View>
        ) : (
          <View className="bg-warning/15 self-start rounded-full px-2 py-1">
            <Text className="text-xs text-warning font-semibold">
              ✍️ Style par texte : non
            </Text>
          </View>
        )}
      </View>
      <Text className="text-xs font-semibold text-success mb-1">✅ Atouts</Text>
      {capabilities.strengths.map((point) => (
        <Text key={point} className="text-xs text-muted leading-4 mb-0.5">
          • {point}
        </Text>
      ))}
      <Text className="text-xs font-semibold text-warning mb-1 mt-2">⚠️ Limites</Text>
      {capabilities.limitations.map((point) => (
        <Text key={point} className="text-xs text-muted leading-4 mb-0.5">
          • {point}
        </Text>
      ))}
    </View>
  );
}

// ─── Pocket TTS grouped cards ──────────────────────────────────────────
//
// The catalog keeps one entry per language/fidelity (each is a separate
// checkpoint download), but the UI shows a single Pocket TTS card and maps
// the (language, fidelity) choice onto the real catalog ids.

interface PocketInstalledCardProps {
  models: TTSModel[];
  onDelete: (modelId: string, modelName: string) => void;
}

function PocketInstalledCard({ models, onDelete }: PocketInstalledCardProps) {
  return (
    <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
      <View className="mb-2">
        <Text className="text-base font-semibold text-foreground">Pocket TTS (Kyutai)</Text>
        <Text className="text-xs text-muted mt-1">
          Clonage zéro-shot 100M — très rapide sur CPU.
        </Text>
      </View>
      <Text className="text-xs font-semibold text-foreground mb-2">Langues installées</Text>
      {models.map((model) => (
        <View
          key={model.id}
          className="flex-row items-center justify-between rounded-lg border border-border p-3 mb-2"
        >
          <View className="flex-1 mr-2">
            <Text className="text-sm font-medium text-foreground">{model.name}</Text>
            <Text className="text-xs text-muted mt-0.5">{formatBytes(model.size)}</Text>
          </View>
          <Pressable
            onPress={() => onDelete(model.id, model.name)}
            className="bg-error rounded-lg px-3 py-2"
          >
            <Text className="text-white font-semibold text-xs">Supprimer</Text>
          </Pressable>
        </View>
      ))}
      <CapabilityBadges capabilities={models[0]?.capabilities} />
    </View>
  );
}

interface PocketAvailableCardProps {
  models: TTSModel[];
  installedIds: Set<string>;
  downloadingModels: { [key: string]: number };
  onInstall: (modelId: string, modelName: string) => void;
}

function PocketAvailableCard({
  models,
  installedIds,
  downloadingModels,
  onInstall,
}: PocketAvailableCardProps) {
  const colors = useColors();
  const [langId, setLangId] = useState('fr');
  const [fp32, setFp32] = useState(false);

  const variant =
    POCKET_VARIANTS.find((v) => v.langId === langId) ?? POCKET_VARIANTS[1];
  const useFp32 = fp32 && variant.fp32Id !== null;
  const selectedId = useFp32 ? variant.fp32Id! : variant.stdId;
  const model = models.find((m) => m.id === selectedId);
  const progress = model ? downloadingModels[model.id] : undefined;
  const isDownloading = progress !== undefined;
  const alreadyInstalled = selectedId !== undefined && installedIds.has(selectedId);

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 border border-border">
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">Pocket TTS (Kyutai)</Text>
          <Text className="text-xs text-muted mt-1">
            Clonage zéro-shot 100M — très rapide sur CPU. Choisissez la langue à installer.
          </Text>
        </View>
        {model && <Text className="text-xs text-muted ml-2">{formatBytes(model.size)}</Text>}
      </View>

      {/* Language */}
      <Text className="text-xs font-semibold text-foreground mb-2">Langue</Text>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {POCKET_VARIANTS.map((v) => {
          const active = v.langId === langId;
          const langInstalled =
            installedIds.has(v.stdId) || (v.fp32Id !== null && installedIds.has(v.fp32Id));
          return (
            <Pressable
              key={v.langId}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLangId(v.langId);
                if (v.fp32Id === null) setFp32(false);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              className="rounded-lg border px-3 py-2"
            >
              <Text
                className={active ? 'text-white font-semibold text-xs' : 'text-foreground font-semibold text-xs'}
              >
                {v.flag} {v.label}
                {langInstalled ? ' ✓' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Fidelity — fp32 only exists for the five non-English languages */}
      <Text className="text-xs font-semibold text-foreground mb-2">Fidélité</Text>
      <View className="flex-row gap-2 mb-3">
        {([
          { id: false as const, label: 'Standard', hint: 'plus léger' },
          { id: true as const, label: 'fp32', hint: variant.fp32Id ? 'voix plus stable' : 'non dispo (en)' },
        ]).map((opt) => {
          const disabled = opt.id && variant.fp32Id === null;
          const active = fp32 === opt.id;
          return (
            <Pressable
              key={String(opt.id)}
              disabled={disabled}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFp32(opt.id);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}
              className="flex-1 rounded-lg border p-3"
            >
              <Text
                className={active ? 'text-white font-semibold text-center text-xs' : 'text-foreground font-semibold text-center text-xs'}
              >
                {opt.label}
              </Text>
              <Text
                className={active ? 'text-white/70 text-center text-[10px] mt-0.5' : 'text-muted text-center text-[10px] mt-0.5'}
              >
                {opt.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Capabilities — identical for every Pocket TTS variant */}
      <CapabilityBadges capabilities={models[0]?.capabilities} />

      {/* Install */}
      <Pressable
        onPress={() => {
          if (model && !alreadyInstalled) onInstall(model.id, model.name);
        }}
        disabled={!model || isDownloading || alreadyInstalled}
        style={({ pressed }) => [
          {
            backgroundColor:
              !model || isDownloading || alreadyInstalled ? colors.muted : colors.primary,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
        className="rounded-xl p-3 flex-row items-center justify-center"
      >
        {isDownloading && <ActivityIndicator color="white" size="small" style={{ marginRight: 6 }} />}
        <Text className="text-white font-semibold text-center">
          {alreadyInstalled
            ? '✅ Déjà installé'
            : isDownloading
              ? `Téléchargement ${progress}%`
              : `Installer Pocket TTS — ${variant.label}${useFp32 ? ' (fp32)' : ''}`}
        </Text>
      </Pressable>
    </View>
  );
}
