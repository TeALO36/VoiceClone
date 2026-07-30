import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { modelsService, TTSModel, ModelState } from '@/lib/services/models';
import { onDeviceTts, OnDeviceTTSService } from '@/lib/services/local-tts';
import type { Qwen3TtsResult } from '@/modules/expo-qwen3-tts';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export type GenerationKind = 'synthesis' | 'clone';
export type GenerationStatus = 'queued' | 'running' | 'done' | 'error';

export interface GenerationJob {
  id: string;
  kind: GenerationKind;
  /** Short label shown in the queue — usually the start of the text. */
  label: string;
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
  /** Queue a generation. Returns the job id so a screen can follow just its own. */
  enqueueGeneration: (
    kind: GenerationKind,
    label: string,
    run: () => Promise<Qwen3TtsResult>
  ) => string;
  clearJob: (id: string) => void;
  clearFinishedJobs: () => void;
  /** Re-renders once a second while something is running, so timers tick. */
  nowTick: number;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

let jobCounter = 0;

export function TTSProvider({ children }: { children: ReactNode }) {
  const [installedModels, setInstalledModels] = useState<TTSModel[]>([]);
  const [availableModels, setAvailableModels] = useState<TTSModel[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: number }>({});
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);
  const [freeStorage, setFreeStorage] = useState(0);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

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

  const patchJob = useCallback((id: string, patch: Partial<GenerationJob>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
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
          const result = await next.run();
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
    (kind: GenerationKind, label: string, run: () => Promise<Qwen3TtsResult>): string => {
      const id = `job-${++jobCounter}`;
      setJobs((prev) => [
        ...prev,
        { id, kind, label, status: 'queued', queuedAt: Date.now() },
      ]);
      pending.current.push({ id, run });
      void drain();
      return id;
    },
    [drain]
  );

  const clearJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  }, []);

  const clearFinishedJobs = useCallback(() => {
    setJobs((prev) => prev.filter((job) => job.status === 'queued' || job.status === 'running'));
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
