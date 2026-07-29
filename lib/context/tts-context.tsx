import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { modelsService, TTSModel, ModelState } from '@/lib/services/models';

export interface TTSContextType {
  installedModels: TTSModel[];
  availableModels: TTSModel[];
  downloadingModels: { [key: string]: number };
  downloadModel: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
  refreshModels: () => Promise<void>;
  totalStorageUsed: number;
  refreshStorageInfo: () => Promise<void>;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSProvider({ children }: { children: ReactNode }) {
  const [installedModels, setInstalledModels] = useState<TTSModel[]>([]);
  const [availableModels, setAvailableModels] = useState<TTSModel[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<{ [key: string]: number }>({});
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);

  const refreshModels = async () => {
    try {
      const state: ModelState = await modelsService.getState();
      setInstalledModels(state.installed);
      setAvailableModels(state.available);
      const storage = await modelsService.getTotalStorageUsed();
      setTotalStorageUsed(storage);
    } catch (error) {
      console.error('Failed to refresh models:', error);
    }
  };

  useEffect(() => {
    refreshModels();
  }, []);

  const downloadModel = async (modelId: string): Promise<boolean> => {
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
  };

  const deleteModel = async (modelId: string): Promise<boolean> => {
    try {
      const success = await modelsService.deleteModel(modelId);
      if (success) {
        await refreshModels();
      }
      return success;
    } catch (error) {
      console.error('Failed to delete model:', error);
      return false;
    }
  };

  const refreshStorageInfo = async () => {
    const storage = await modelsService.getTotalStorageUsed();
    setTotalStorageUsed(storage);
  };

  const value: TTSContextType = {
    installedModels,
    availableModels,
    downloadingModels,
    downloadModel,
    deleteModel,
    refreshModels,
    totalStorageUsed,
    refreshStorageInfo,
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
