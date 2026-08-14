import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useColors } from '@/hooks/use-colors';
import { useTTS, type GenerationKind, type GenerationJob } from '@/lib/context/tts-context';
import { AudioPlayer } from '@/components/audio-player';

function elapsedLabel(job: GenerationJob, now: number): string {
  const from = job.startedAt ?? job.queuedAt;
  const to = job.finishedAt ?? now;
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

/** Jobs generated without a saved profile carry this voice name. */
const UNKNOWN_VOICE = 'Non-profil';

function isUnknownVoice(name?: string): boolean {
  return !name || name.trim() === UNKNOWN_VOICE;
}

/**
 * Live view of the generation queue. Generations are serialised because the
 * native engine holds a single model, so this is what tells the user their
 * second request is waiting rather than lost.
 *
 * Newest jobs are displayed first. `showProfileFilter` (clone screen) adds
 * chips to filter the history by the voice profile used — « Profil inconnu »
 * groups every job made without a saved profile.
 */
export function GenerationQueue({ kind, showProfileFilter }: { kind: GenerationKind; showProfileFilter?: boolean }) {
  const colors = useColors();
  const { jobs, nowTick, clearJob, clearFinishedJobs, modelLoading } = useTTS();
  const [profileFilter, setProfileFilter] = useState<string | null>(null);

  const mine = jobs.filter((job) => job.kind === kind);

  // Distinct voice profiles actually used in this history — they become the
  // filter chips. Jobs without a profile (or saved as « Non-profil ») group
  // under the dedicated « Profil inconnu » chip.
  const usedVoices = showProfileFilter
    ? Array.from(
        new Set(
          mine
            .map((job) => job.voiceName?.trim())
            .filter((name): name is string => !!name && name !== UNKNOWN_VOICE)
        )
      )
    : [];
  const hasUnknown = !!showProfileFilter && mine.some((job) => isUnknownVoice(job.voiceName));

  const filtered =
    profileFilter === 'unknown'
      ? mine.filter((job) => isUnknownVoice(job.voiceName))
      : profileFilter
        ? mine.filter((job) => job.voiceName?.trim() === profileFilter)
        : mine;

  if (mine.length === 0) return null;

  const finishedCount = mine.filter((j) => j.status === 'done' || j.status === 'error').length;

  const renderChip = (label: string, value: string | null, visible: boolean) => {
    if (!visible) return null;
    const active = profileFilter === value;
    return (
      <Pressable
        key={value ?? 'unknown'}
        onPress={() => setProfileFilter(active ? null : value)}
        style={({ pressed }) => [
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        className="rounded-full border px-3 py-1.5 mr-2"
      >
        <Text
          className={active ? 'text-white font-semibold text-xs' : 'text-foreground text-xs'}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  // Newest first: the array is stored oldest → newest, so reverse for display.
  // queuePosition stays correct because the newest queued job (index 0 after
  // reversing) is exactly the next one to run.
  const display = [...filtered].reverse();

  return (
    <View className="px-6 mb-6">
      {showProfileFilter && (usedVoices.length > 0 || hasUnknown) && (
        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs text-muted">Filtrer l&apos;historique par profil</Text>
            {profileFilter && (
              <Pressable onPress={() => setProfileFilter(null)} className="px-1 py-0.5">
                <Text className="text-xs text-primary font-semibold">✕ Réinitialiser</Text>
              </Pressable>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center' }}
          >
            {renderChip('👤 Profil inconnu', 'unknown', hasUnknown)}
            {usedVoices.map((name) => renderChip(name, name, true))}
          </ScrollView>
        </View>
      )}

      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-foreground">
          Générations ({filtered.length})
        </Text>
        {finishedCount > 0 && (
          <Pressable onPress={clearFinishedJobs} className="px-2 py-1">
            <Text className="text-xs text-muted">Effacer terminées</Text>
          </Pressable>
        )}
      </View>

      {display.map((job, index) => {
        const queuePosition = display
          .slice(0, index)
          .filter((j) => j.status === 'queued' || j.status === 'running').length;

        return (
          <View
            key={job.id}
            className="bg-surface border border-border rounded-xl p-4 mb-3"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-sm text-foreground" numberOfLines={2}>
                  {job.label}
                </Text>

                {job.voiceName && !isUnknownVoice(job.voiceName) && (
                  <Text className="text-xs text-muted mt-1">👤 {job.voiceName}</Text>
                )}

                <View className="flex-row items-start mt-2">
                  {job.status === 'running' && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                  )}
                  {/* A failure message is the only evidence of what went wrong,
                      and a native rejection carries its real cause after a
                      « Caused by: » that a single clipped line hides. It gets
                      the full width, every line, and stays selectable so it can
                      be copied into a bug report. */}
                  <Text
                    className="text-xs flex-1"
                    selectable={job.status === 'error'}
                    style={{
                      color:
                        job.status === 'error'
                          ? colors.error
                          : job.status === 'done'
                            ? colors.success
                            : colors.muted,
                    }}
                  >
                    {job.status === 'queued' && `En attente · ${queuePosition} devant`}
                    {job.status === 'running' &&
                      (modelLoading
                        ? `Chargement du modèle ${modelLoading}… ${elapsedLabel(job, nowTick)}`
                        : `Génération… ${elapsedLabel(job, nowTick)}`)}
                    {job.status === 'done' && `Terminé en ${elapsedLabel(job, nowTick)}`}
                    {job.status === 'error' && (job.error || 'Échec')}
                  </Text>
                </View>
              </View>

              {(job.status === 'done' || job.status === 'error') && (
                <Pressable
                  onPress={() => clearJob(job.id)}
                  className="bg-border/40 rounded-lg px-2 py-1"
                >
                  <Text className="text-xs text-muted">✕</Text>
                </Pressable>
              )}
            </View>

            {job.status === 'done' && job.result && (
              <AudioPlayer result={job.result} fileName={job.voiceName ?? 'Non-profil'} />
            )}
          </View>
        );
      })}
    </View>
  );
}
