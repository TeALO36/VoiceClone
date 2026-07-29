import React, { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { modelsService, TTSModel, ModelState } from '@/lib/services/models';
import { localTtsService } from '@/lib/services/local-tts';

export interface TTSContextType {
  // Models state
  installedModels: TTSModel[];
  availableModels: TTSModel[];
  downloadingModels: { [key: string]: number };
  
  // Actions
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  refreshModels: () => Promise<void>;
  
  // TTS state
  isInitialized: boolean;
  initializeTTS: () => Promise<void>;
  
  // Storage
  totalStorageUsed: number;
  refreshStorageInfo: () => Promise<void>;
}

interface TTSState {
  installedModels: TTSModel[];
  availableModels: TTSModel[];
  downloadingModels: { [key: string]: number };
  isInitialized: boolean;
  totalStorageUsed: number;
}

type TTSAction =
  | { type: 'SET_INSTALLED_MODELS'; payload: TTSModel[] }
  | { type: 'SET_AVAILABLE_MODELS'; payload: TTSModel[] }
  | { type: 'SET_DOWNLOADING_PROGRESS'; payload: { modelId: string; progress: number } }
  | { type: 'REMOVE_DOWNLOADING'; payload: string }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_TOTAL_STORAGE'; payload: number };

const initialState: TTSState = {
  installedModels: [],
  availableModels: [],
  downloadingModels: {},
  isInitialized: false,
  totalStorageUsed: 0,
};

function ttsReducer(state: TTSState, action: TTSAction): TTSState {
  switch (action.type) {
    case 'SET_INSTALLED_MODELS':
      return { ...state, installedModels: action.payload };
    case 'SET_AVAILABLE_MODELS':
      return { ...state, availableModels: action.payload };
    case 'SET_DOWNLOADING_PROGRESS':
      return {
        ...state,
        downloadingModels: {
          ...state.downloadingModels,
          [action.payload.modelId]: action.payload.progress,
        },
      };
    case 'REMOVE_DOWNLOADING':
      const { [action.payload]: _, ...rest } = state.downloadingModels;
      return { ...state, downloadingModels: rest };
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
    case 'SET_TOTAL_STORAGE':
      return { ...state, totalStorageUsed: action.payload };
    default:
      return state;
  }
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function TTSProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(ttsReducer, initialState);

  // Initialize models service on mount
  useEffect(() => {
    const init = async () => {
      await modelsService.initialize();
      await refreshModels();
    };
    init();
  }, []);

  const refreshModels = async () => {
    try {
      const modelState = await modelsService.getState();
      dispatch({ type: 'SET_INSTALLED_MODELS', payload: modelState.installed });
      dispatch({ type: 'SET_AVAILABLE_MODELS', payload: modelState.available });
      dispatch({ type: 'SET_DOWNLOADING_PROGRESS', payload: { modelId: '', progress: 0 } });

      const totalStorage = await modelsService.getTotalStorageUsed();
      dispatch({ type: 'SET_TOTAL_STORAGE', payload: totalStorage });
    } catch (error) {
      console.error('Failed to refresh models:', error);
    }
  };

  const downloadModel = async (modelId: string) => {
    try {
      await modelsService.downloadModel(modelId, (progress) => {
        dispatch({
          type: 'SET_DOWNLOADING_PROGRESS',
          payload: { modelId, progress },
        });
      });

      dispatch({ type: 'REMOVE_DOWNLOADING', payload: modelId });
      await refreshModels();
    } catch (error) {
      console.error('Failed to download model:', error);
      dispatch({ type: 'REMOVE_DOWNLOADING', payload: modelId });
    }
  };

  const deleteModel = async (modelId: string) => {
    try {
      await modelsService.deleteModel(modelId);
      await refreshModels();
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  const initializeTTS = async () => {
    try {
      await localTtsService.initialize();
      dispatch({ type: 'SET_INITIALIZED', payload: true });
    } catch (error) {
      console.error('Failed to initialize TTS:', error);
    }
  };

  const refreshStorageInfo = async () => {
    try {
      const totalStorage = await modelsService.getTotalStorageUsed();
      dispatch({ type: 'SET_TOTAL_STORAGE', payload: totalStorage });
    } catch (error) {
      console.error('Failed to refresh storage info:', error);
    }
  };

  const value: TTSContextType = {
    installedModels: state.installedModels,
    availableModels: state.availableModels,
    downloadingModels: state.downloadingModels,
    isInitialized: state.isInitialized,
    totalStorageUsed: state.totalStorageUsed,
    downloadModel,
    deleteModel,
    refreshModels,
    initializeTTS,
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
