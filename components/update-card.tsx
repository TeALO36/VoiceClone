import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { openBrowserAsync } from 'expo-web-browser';
import { useColors } from '@/hooks/use-colors';
import { UpdateConfirmModal } from '@/components/update-confirm-modal';
import {
  GITHUB_RELEASES_URL,
  downloadAndInstallApk,
  fetchLatestRelease,
  findPartialUpdate,
  getCurrentAppVersion,
  markChecked,
  shouldAutoCheck,
  type PartialDownload,
  type UpdateInfo,
} from '@/lib/services/updates';
import { formatBytes } from '@/lib/services/models';

type Phase =
  | { name: 'idle' }
  | { name: 'checking' }
  | { name: 'ok'; info: UpdateInfo }
  | { name: 'update'; info: UpdateInfo }
  | { name: 'error'; message: string }
  | { name: 'downloading'; info: UpdateInfo; progress: number }
  | { name: 'installing'; info: UpdateInfo };

export function UpdateCard() {
  const colors = useColors();
  const mounted = useRef(true);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [currentVersion, setCurrentVersion] = useState('');
  // Update currently awaiting confirmation in the modal (null = closed).
  const [confirming, setConfirming] = useState<UpdateInfo | null>(null);
  // Interrupted download on disk (null = nothing resumable for this version).
  const [partial, setPartial] = useState<PartialDownload | null>(null);

  useEffect(() => {
    mounted.current = true;
    getCurrentAppVersion().then(setCurrentVersion).catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  // Silent auto-check on launch (rate-limited via AsyncStorage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await shouldAutoCheck())) return;
        const info = await fetchLatestRelease();
        if (cancelled || !mounted.current) return;
        setPhase(info.isUpdateAvailable ? { name: 'update', info } : { name: 'ok', info });
        await refreshPartial(info);
        await markChecked();
      } catch {
        // Auto-check must never annoy the user — the manual button is there.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPhaseSafe = useCallback((next: Phase) => {
    if (mounted.current) setPhase(next);
  }, []);

  // Refreshes the "partial download" state for the given release: shows the
  // resume button when a leftover file matches the target version. Returns
  // whether a resumable partial is now offered.
  const refreshPartial = useCallback(async (info: UpdateInfo | null): Promise<boolean> => {
    if (!info || !info.apkAsset || !mounted.current) {
      setPartial(null);
      return false;
    }
    const found = await findPartialUpdate();
    if (
      found &&
      found.version === info.latestVersion &&
      found.downloadedBytes < info.apkAsset.size
    ) {
      setPartial(found);
      return true;
    }
    setPartial(null);
    return false;
  }, []);

  const handleCheck = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhaseSafe({ name: 'checking' });
    try {
      const info = await fetchLatestRelease();
      setPhaseSafe(info.isUpdateAvailable ? { name: 'update', info } : { name: 'ok', info });
      await refreshPartial(info);
      await markChecked();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Impossible de contacter GitHub. Vérifiez votre connexion.';
      setPhaseSafe({ name: 'error', message });
    }
  };

  // Opens the confirmation screen (version cible + taille) before any download.
  const openConfirm = (info: UpdateInfo) => {
    if (!info.apkAsset) {
      Alert.alert(
        'Mise à jour manuelle',
        'Aucun APK attaché à cette version. Ouvrez la page GitHub pour télécharger la mise à jour.'
      );
      return;
    }
    setConfirming(info);
  };

  // Called once the user confirms in the modal — the actual download + install.
  const startDownload = async (info: UpdateInfo) => {
    if (!info.apkAsset) return;
    setConfirming(null);
    setPartial(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhaseSafe({ name: 'downloading', info, progress: 0 });
    try {
      await downloadAndInstallApk(info.apkAsset, info.latestVersion, (progress) => {
        setPhaseSafe({ name: 'downloading', info, progress });
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhaseSafe({ name: 'installing', info });
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        error instanceof Error
          ? error.message
          : 'Téléchargement de la mise à jour impossible';
      const resumed = await refreshPartial(info);
      Alert.alert(
        'Mise à jour impossible',
        message + (resumed ? ' Le téléchargement partiel est conservé : vous pourrez le reprendre.' : ''),
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Page GitHub',
            onPress: () => openBrowserAsync(info.releaseUrl).catch(() => {}),
          },
        ]
      );
      setPhaseSafe(info.isUpdateAvailable ? { name: 'update', info } : { name: 'idle' });
    }
  };

  const openReleases = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openBrowserAsync(GITHUB_RELEASES_URL).catch(() => {});
  };

  const isBusy = phase.name === 'checking' || phase.name === 'downloading' || phase.name === 'installing';
  const progress = phase.name === 'downloading' ? phase.progress : undefined;

  return (
    <View className="px-6 mb-6">
      <View className="bg-surface rounded-xl p-4 border border-border">
        {/* Header row */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <Text className="text-base font-semibold text-foreground mr-2">🔄 Mise à jour</Text>
            {currentVersion ? (
              <Text className="text-xs text-muted">v{currentVersion}</Text>
            ) : null}
          </View>
          {!isBusy && (
            <Pressable
              onPress={handleCheck}
              style={({ pressed }) => [
                { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
              ]}
              className="rounded-lg px-3 py-1.5 border border-border"
            >
              <Text className="text-xs font-medium text-primary">Vérifier</Text>
            </Pressable>
          )}
        </View>

        {/* Status area */}
        {phase.name === 'idle' && (
          <Text className="text-xs text-muted">
            Vérifiez si une nouvelle version est disponible sur GitHub.
          </Text>
        )}

        {phase.name === 'checking' && (
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color={colors.tint} style={{ marginRight: 8 }} />
            <Text className="text-sm text-muted">Recherche d’une mise à jour…</Text>
          </View>
        )}

        {phase.name === 'error' && (
          <>
            <Text className="text-sm text-error mb-1">Impossible de vérifier les mises à jour.</Text>
            <Text className="text-xs text-muted mb-3">
              {phase.message} — le dépôt GitHub doit être public et accessible depuis l’app.
            </Text>
            <Pressable
              onPress={openReleases}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              className="bg-primary rounded-lg p-2"
            >
              <Text className="text-white font-semibold text-center text-sm">
                Ouvrir la page GitHub
              </Text>
            </Pressable>
          </>
        )}

        {phase.name === 'ok' && (
          <Text className="text-sm text-foreground">
            ✅ Vous êtes à jour (v{phase.info.currentVersion}).
          </Text>
        )}

        {phase.name === 'update' && (
          <>
            <Text className="text-sm font-semibold text-foreground mb-1">
              🆕 Version {phase.info.latestVersion} disponible
            </Text>
            {phase.info.releaseNotes ? (
              <Text className="text-xs text-muted mb-3" numberOfLines={4}>
                {phase.info.releaseNotes}
              </Text>
            ) : null}
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => openConfirm(phase.info)}
                style={({ pressed }) => [
                  { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                ]}
                className="flex-1 rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">
                  {partial
                    ? 'Reprendre le téléchargement'
                    : Platform.OS === 'web'
                      ? 'Télécharger l’APK'
                      : 'Télécharger et installer'}
                </Text>
              </Pressable>
              <Pressable
                onPress={openReleases}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="rounded-lg p-2 border border-border"
              >
                <Text className="text-primary font-semibold text-center text-sm px-2">
                  Page GitHub
                </Text>
              </Pressable>
            </View>
            {partial && phase.info.apkAsset ? (
              <Text className="text-[11px] text-muted mt-2">
                ⏸️ Téléchargement partiel : {formatBytes(partial.downloadedBytes)} /{' '}
                {formatBytes(phase.info.apkAsset.size)} — la reprise continue depuis cet octet.
              </Text>
            ) : phase.info.apkAsset ? (
              <Text className="text-[11px] text-muted mt-2">
                {phase.info.apkAsset.name} · {formatBytes(phase.info.apkAsset.size)}
              </Text>
            ) : null}
          </>
        )}

        {phase.name === 'downloading' && (
          <>
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs text-muted">
                Téléchargement v{phase.info.latestVersion}…
              </Text>
              <Text className="text-xs text-muted">{progress}%</Text>
            </View>
            <View className="h-2 bg-border rounded-full overflow-hidden">
              <View
                className="h-full bg-primary"
                style={{ width: `${progress ?? 0}%` }}
              />
            </View>
          </>
        )}

        {phase.name === 'installing' && (
          <>
            <View className="flex-row items-center mb-3">
              <ActivityIndicator size="small" color={colors.tint} style={{ marginRight: 8 }} />
              <Text className="text-sm text-muted flex-1">
                APK téléchargé — l’installeur Android doit s’ouvrir pour terminer la mise à
                jour. S’il ne s’affiche pas (masqué par une autre app ?), relancez-le :
              </Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => startDownload(phase.info)}
                style={({ pressed }) => [
                  { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                ]}
                className="flex-1 rounded-lg p-2"
              >
                <Text className="text-white font-semibold text-center text-sm">
                  Relancer l’installation
                </Text>
              </Pressable>
              <Pressable
                onPress={openReleases}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="rounded-lg p-2 border border-border"
              >
                <Text className="text-primary font-semibold text-center text-sm px-2">
                  Page GitHub
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Confirmation before downloading */}
      <UpdateConfirmModal
        visible={confirming !== null}
        info={confirming}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && startDownload(confirming)}
      />
    </View>
  );
}
