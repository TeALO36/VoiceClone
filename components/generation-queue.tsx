import { View, Text, Pressable, ActivityIndicator } from 'react-native';
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

/**
 * Live view of the generation queue. Generations are serialised because the
 * native engine holds a single model, so this is what tells the user their
 * second request is waiting rather than lost.
 */
export function GenerationQueue({ kind }: { kind: GenerationKind }) {
  const colors = useColors();
  const { jobs, nowTick, clearJob, clearFinishedJobs } = useTTS();

  const mine = jobs.filter((job) => job.kind === kind);
  if (mine.length === 0) return null;

  const finishedCount = mine.filter((j) => j.status === 'done' || j.status === 'error').length;

  return (
    <View className="px-6 mb-6">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-foreground">
          Générations ({mine.length})
        </Text>
        {finishedCount > 0 && (
          <Pressable onPress={clearFinishedJobs} className="px-2 py-1">
            <Text className="text-xs text-muted">Effacer terminées</Text>
          </Pressable>
        )}
      </View>

      {mine.map((job, index) => {
        const queuePosition = mine
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

                <View className="flex-row items-center mt-2">
                  {job.status === 'running' && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                  )}
                  <Text
                    className="text-xs"
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
                    {job.status === 'running' && `Génération… ${elapsedLabel(job, nowTick)}`}
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
