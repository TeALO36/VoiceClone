import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { modelsService, TTSModel, ModelState } from '@/lib/services/models';
import { onDeviceTts, OnDeviceTTSService, LAST_MODEL_KEY } from '@/lib/services/local-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type GenerationKind = 'synthesis' | 'clone';
export type GenerationStatus = 'queued' | 'running' | 'done' | 'error';

export interface GenerationJob {
  id: string;
  kind: GenerationKind;
  /** Short label shown in the queue — usually the start of the text. */
  label: string;
  /**
   * Name of the voice used (the selected profile), used for export filenames.
   * Absent/empty means no profile was in play (classic TTS).
   */
  voiceName?: string;
  status: GenerationStatus;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: Qwen3TtsResult;
  error?: string;
}

export interface TTSContextType {
  installedModels: TTSModel[];
  availableModels: TTSModel[];
  downloadingModels: { [key: string]: number };
  downloadModel: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
  refreshModels: () => Promise<void>;
  totalStorageUsed: number;
  freeStorage: number;
  refreshStorageInfo: () => Promise<void>;
  /** Get the local file path for an installed model (used to init the TTS engine) */
  getModelPath: (modelId: string) => Promise<string | null>;
  /** The on-device TTS engine instance */
  ttsEngine: OnDeviceTTSService;

  // ── Generation queue ──
  /** All jobs, newest last. Finished ones stay until cleared. */
  jobs: GenerationJob[];
  /** Engine name while a checkpoint is loading natively, or null when idle. */
  modelLoading: string | null;
  /** Queue a generation. Returns the job id so a screen can follow just its own. */
  enqueueGeneration: (
    kind: GenerationKind,
    label: string,
    run: () => Promise<Qwen3TtsResult>,
    /** Name of the voice/profile used — drives the export filename. */
    voiceName?: string
  ) => string;
  clearJob: (id: string) => void;
  clearFinishedJobs: () => void;
  /** Re-renders once a second while something is running, so timers tick. */
  nowTick: number;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

let jobCounter = 0;

/** Finished generations are persisted so the history survives app restarts. */
const HISTORY_KEY = 'voxclone_generation_history_v1';
const MAX_HISTORY_JOBS = 50;

/** Persistent copy of a finished generation's audio (documents dir, not cache). */
function generationAudioPath(jobId: string): string {
  return `${FileSystem.documentDirectory}generations/${jobId}.wav`;
}

/**
 * Persist the finished jobs (done with audio) to AsyncStorage, capped to the
 * most recent MAX_HISTORY_JOBS. Audio files beyond the cap are removed.
 */
async function persistHistory(jobsList: GenerationJob[]): Promise<void> {
  const finished = jobsList.filter((job) => job.status === 'done' && job.result);
  const dropped = finished.length > MAX_HISTORY_JOBS ? finished.slice(0, finished.length - MAX_HISTORY_JOBS) : [];
  dropped.forEach((job) => {
    FileSystem.deleteAsync(generationAudioPath(job.id), { idempotent: true }).catch(() => {});
  });
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(finished.slice(-MAX_HISTORY_JOBS)));
  } catch (error) {
    console.warn('Failed to persist generation history:', error);
  }
}

export function TTSProvider({ children }: { children: ReactNode }) {
  const [installedModels, setInstalledModels] = useState<TTSModel[]>([]);
  const [availableModels, setAvailableModels] = useState<TTSModel[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: number }>({});
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);
  const [freeStorage, setFreeStorage] = useState(0);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Non-null while a checkpoint is being loaded into the native engine (a
  // multi-hundred-MB GGUF can take tens of seconds). Carries the engine name
  // so the queue can say « Chargement du modèle… » instead of a silent spinner.
  const [modelLoading, setModelLoading] = useState<string | null>(null);

  const refreshModels = useCallback(async () => {
    try {
      const state: ModelState = await modelsService.getState();
      setInstalledModels(state.installed);
      setAvailableModels(state.available);
      setTotalStorageUsed(await modelsService.getTotalStorageUsed());
      setFreeStorage(await modelsService.getFreeStorage());
    } catch (error) {
      console.error('Failed to refresh models:', error);
    }
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  // Surface the native model-loading phase to the generation queue. Loading a
  // Qwen3/OmniVoice checkpoint can take 30-80 s on slow devices — the generic
  // « Génération… » spinner made it look like the app was stuck.
  useEffect(() => {
    onDeviceTts.onLoadingChange = (loading, engine) => {
      if (!loading) {
        setModelLoading(null);
        return;
      }
      const name =
        engine === 'qwen3' ? 'Qwen3-TTS'
        : engine === 'omnivoice' ? 'OmniVoice'
        : engine === 'f5' ? 'F5-TTS'
        : 'Pocket TTS';
      setModelLoading(name);
    };
    return () => {
      onDeviceTts.onLoadingChange = null;
    };
  }, []);

  // Warm-up: load the last-used engine in the background on launch so the
  // first generation does not pay the full model-loading cost (tens of seconds
  // for the Qwen3/OmniVoice checkpoints). Best effort — a failure is silent,
  // the model loads normally on first use.
  useEffect(() => {
    if (installedModels.length === 0) return;
    (async () => {
      try {
        const lastId = await AsyncStorage.getItem(LAST_MODEL_KEY);
        if (!lastId) return;
        const model = installedModels.find((m) => m.id === lastId);
        // Pocket loads in a second and is never the slow one — skip it.
        // F5-TTS loads three ONNX graphs (a 1+ GB fp32 transformer) — warming
        // it up at startup would fight for memory with the other engines.
        if (!model || model.type === 'pocket' || model.type === 'f5') return;
        const dir = await modelsService.getModelPath(model.id);
        if (dir) await onDeviceTts.initModel(dir, model.type);
      } catch {
        // Best effort warm-up — never block or crash startup.
      }
    })();
  }, [installedModels]);

  // Restore the persisted generation history on launch.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(HISTORY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as GenerationJob[];
          const restored = parsed.filter(
            (job) => job.status === 'done' && job.result
          );
          jobsRef.current = restored;
          setJobs(restored);
        }
      } catch (error) {
        console.warn('Failed to restore generation history:', error);
      }
    })();
  }, []);

  const downloadModel = useCallback(async (modelId: string): Promise<boolean> => {
    setDownloadingModels((prev) => ({ ...prev, [modelId]: 0 }));
    try {
      const success = await modelsService.downloadModel(modelId, (progress) => {
        setDownloadingModels((prev) => ({ ...prev, [modelId]: progress }));
      });
      if (success) await refreshModels();
      return success;
    } catch (error) {
      console.error('Failed to download model:', error);
      throw error;
    } finally {
      setDownloadingModels((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  }, [refreshModels]);

  const deleteModel = useCallback(async (modelId: string): Promise<boolean> => {
    try {
      // Release the loaded model in C++ before deleting the files to prevent mmap crashes/file locking
      await onDeviceTts.release();
      const success = await modelsService.deleteModel(modelId);
      if (success) {
        await refreshModels();
      }
      return success;
    } catch (error) {
      console.error('Failed to delete model:', error);
      return false;
    }
  }, [refreshModels]);

  const getModelPath = useCallback(async (modelId: string): Promise<string | null> => {
    return modelsService.getModelPath(modelId);
  }, []);

  const refreshStorageInfo = useCallback(async () => {
    setTotalStorageUsed(await modelsService.getTotalStorageUsed());
    setFreeStorage(await modelsService.getFreeStorage());
  }, []);

  // ── Generation queue ────────────────────────────────────────────────
  // The native engine holds one model in a global, so two generations at once
  // would fight over it. Jobs are therefore run strictly one after another and
  // the UI shows the waiting ones instead of blocking the button.

  const pending = useRef<{ id: string; run: () => Promise<Qwen3TtsResult> }[]>([]);
  const draining = useRef(false);
  // Mirror of the jobs state kept in sync so history can be persisted without
  // depending on setState timing.
  const jobsRef = useRef<GenerationJob[]>([]);

  const patchJob = useCallback((id: string, patch: Partial<GenerationJob>) => {
    const next = jobsRef.current.map((job) => (job.id === id ? { ...job, ...patch } : job));
    jobsRef.current = next;
    setJobs(next);
    void persistHistory(next);
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;

    // Generation runs for tens of seconds; letting the screen sleep suspends it.
    await activateKeepAwakeAsync('voxclone-generation').catch(() => {});

    try {
      while (pending.current.length > 0) {
        const next = pending.current.shift()!;
        patchJob(next.id, { status: 'running', startedAt: Date.now() });
        try {
          let result = await next.run();
          // Keep finished audio out of the cache (the native layer cleans it
          // after an hour): copy it into the documents directory so the history
          // entry stays playable across restarts. On failure the cache URI is
          // kept — the job still shows, just without a guaranteed copy.
          try {
            const targetPath = generationAudioPath(next.id);
            const targetInfo = await FileSystem.getInfoAsync(targetPath);
            if (!targetInfo.exists) {
              await FileSystem.makeDirectoryAsync(
                `${FileSystem.documentDirectory}generations`,
                { intermediates: true }
              );
              // Keep the file:// scheme on the source: expo-file-system treats
              // a raw path as an Android resource name (getInfoAsync would
              // report it missing, copyAsync would throw).
              await FileSystem.copyAsync({
                from: result.audioUri,
                to: targetPath,
              });
            }
            result = { ...result, audioUri: `file://${targetPath}` };
          } catch (copyError) {
            console.warn('Failed to persist generation audio:', copyError);
          }
          patchJob(next.id, { status: 'done', finishedAt: Date.now(), result });
        } catch (error: any) {
          patchJob(next.id, {
            status: 'error',
            finishedAt: Date.now(),
            error: error?.message || 'Génération impossible',
          });
        }
      }
    } finally {
      draining.current = false;
      deactivateKeepAwake('voxclone-generation');
    }
  }, [patchJob]);

  const enqueueGeneration = useCallback(
    (
      kind: GenerationKind,
      label: string,
      run: () => Promise<Qwen3TtsResult>,
      voiceName?: string
    ): string => {
      // Timestamp prefix keeps ids unique across app restarts so a restored
      // history entry can never collide with a fresh job.
      const id = `job-${Date.now()}-${++jobCounter}`;
      const next: GenerationJob[] = [
        ...jobsRef.current,
        { id, kind, label, voiceName, status: 'queued', queuedAt: Date.now() },
      ];
      jobsRef.current = next;
      setJobs(next);
      pending.current.push({ id, run });
      void drain();
      return id;
    },
    [drain]
  );

  const clearJob = useCallback((id: string) => {
    const removed = jobsRef.current.find((job) => job.id === id);
    const next = jobsRef.current.filter((job) => job.id !== id);
    jobsRef.current = next;
    setJobs(next);
    void persistHistory(next);
    if (removed) {
      FileSystem.deleteAsync(generationAudioPath(id), { idempotent: true }).catch(() => {});
    }
  }, []);

  const clearFinishedJobs = useCallback(() => {
    const removed = jobsRef.current.filter(
      (job) => job.status === 'done' || job.status === 'error'
    );
    const next = jobsRef.current.filter(
      (job) => job.status === 'queued' || job.status === 'running'
    );
    jobsRef.current = next;
    setJobs(next);
    void persistHistory(next);
    removed.forEach((job) => {
      FileSystem.deleteAsync(generationAudioPath(job.id), { idempotent: true }).catch(() => {});
    });
  }, []);

  // Drive the elapsed-time displays. Only ticks while work is outstanding so
  // an idle app is not re-rendering once a second forever.
  const hasActiveWork =
    jobs.some((job) => job.status === 'queued' || job.status === 'running') ||
    Object.keys(downloadingModels).length > 0;

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasActiveWork]);

  const value: TTSContextType = {
    installedModels,
    availableModels,
    downloadingModels,
    downloadModel,
    deleteModel,
    refreshModels,
    totalStorageUsed,
    freeStorage,
    refreshStorageInfo,
    getModelPath,
    ttsEngine: onDeviceTts,
    jobs,
    enqueueGeneration,
    clearJob,
    clearFinishedJobs,
    nowTick,
    modelLoading,
  };

  return <TTSContext.Provider value={value}>{children}</TTSContext.Provider>;
}

export function useTTS(): TTSContextType {
  const context = useContext(TTSContext);
  if (context === undefined) {
    throw new Error('useTTS must be used within a TTSProvider');
  }
  return context;
}
