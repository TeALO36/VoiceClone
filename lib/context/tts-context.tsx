import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { modelsService, TTSModel, ModelState } from '@/lib/services/models';
import { onDeviceTts, OnDeviceTTSService } from '@/lib/services/local-tts';

export interface TTSContextType {
  installedModels: TTSModel[];
  availableModels: TTSModel[];
  downloadingModels: { [key: string]: number };
  downloadModel: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
  refreshModels: () => Promise<void>;
  totalStorageUsed: number;
  refreshStorageInfo: () => Promise<void>;
  /** Get the local file path for an installed model (used to init the TTS engine) */
  getModelPath: (modelId: string) => Promise<string | null>;
  /** The on-device TTS engine instance */
  ttsEngine: OnDeviceTTSService;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSProvider({ children }: { children: ReactNode }) {
  const [installedModels, setInstalledModels] = useState<TTSModel[]>([]);
  const [availableModels, setAvailableModels] = useState<TTSModel[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: number }>({});
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);

  const refreshModels = useCallback(async () => {
    try {
      const state: ModelState = await modelsService.getState();
      setInstalledModels(state.installed);
      setAvailableModels(state.available);
      const storage = await modelsService.getTotalStorageUsed();
      setTotalStorageUsed(storage);
    } catch (error) {
      console.error('Failed to refresh models:', error);
    }
  }, []);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const downloadModel = useCallback(async (modelId: string): Promise<boolean> => {
    try {
      const success = await modelsService.downloadModel(modelId, (progress) => {
        setDownloadingModels((prev) => ({ ...prev, [modelId]: progress }));
      });

      setDownloadingModels((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });

      if (success) {
        await refreshModels();
      }
      return success;
    } catch (error) {
      console.error('Failed to download model:', error);
      setDownloadingModels((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      return false;
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
    const storage = await modelsService.getTotalStorageUsed();
    setTotalStorageUsed(storage);
  }, []);

  const value: TTSContextType = {
    installedModels,
    availableModels,
    downloadingModels,
    downloadModel,
    deleteModel,
    refreshModels,
    totalStorageUsed,
    refreshStorageInfo,
    getModelPath,
    ttsEngine: onDeviceTts,
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
