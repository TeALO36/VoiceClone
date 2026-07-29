import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system/next';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  modelId: string; // Hugging Face model ID
  type: 'qwen' | 'omnivoice' | 'other';
  size: number; // in bytes
  languages: string[];
  isInstalled: boolean;
  downloadProgress?: number;
  downloadedAt?: number;
}

export interface ModelState {
  installed: TTSModel[];
  available: TTSModel[];
  downloading: { [key: string]: number }; // model id -> progress percentage
}

const MODELS_STORAGE_KEY = 'voxclone_models';
const MODELS_DIR = 'models';

// Catalogue des modèles disponibles
const AVAILABLE_MODELS: TTSModel[] = [
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Modèle léger avec clonage de voix 3-secondes',
    modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
    type: 'qwen',
    size: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
    isInstalled: false,
  },
  {
    id: 'omnivoice-base',
    name: 'OmniVoice',
    description: 'Synthèse vocale multilingue 600+ langues',
    modelId: 'k2-fsa/OmniVoice',
    type: 'omnivoice',
    size: 2.0 * 1024 * 1024 * 1024, // 2.0 GB
    languages: ['600+ languages supported'],
    isInstalled: false,
  },
];

class ModelsService {
  private modelsDir: Directory | null = null;

  async initialize(): Promise<void> {
    try {
      this.modelsDir = new Directory(Paths.cache, MODELS_DIR);
      await this.modelsDir.create();
    } catch (error) {
      console.error('Failed to initialize models directory:', error);
    }
  }

  async getState(): Promise<ModelState> {
    try {
      const stored = await AsyncStorage.getItem(MODELS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to get models state:', error);
    }

    return {
      installed: [],
      available: AVAILABLE_MODELS,
      downloading: {},
    };
  }

  async saveState(state: ModelState): Promise<void> {
    try {
      await AsyncStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save models state:', error);
    }
  }

  async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<boolean> {
    try {
      const state = await this.getState();
      const model = AVAILABLE_MODELS.find((m) => m.id === modelId);

      if (!model) {
        console.error('Model not found:', modelId);
        return false;
      }

      // Simulate download with progress updates
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        onProgress?.(i);

        state.downloading[modelId] = i;
        await this.saveState(state);
      }

      // Mark as installed
      model.isInstalled = true;
      model.downloadedAt = Date.now();
      state.installed.push(model);
      delete state.downloading[modelId];

      await this.saveState(state);
      return true;
    } catch (error) {
      console.error('Failed to download model:', error);
      return false;
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      const state = await this.getState();
      state.installed = state.installed.filter((m) => m.id !== modelId);

      // Update available models
      const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
      if (model) {
        model.isInstalled = false;
      }

      await this.saveState(state);
      return true;
    } catch (error) {
      console.error('Failed to delete model:', error);
      return false;
    }
  }

  async getInstalledModels(): Promise<TTSModel[]> {
    const state = await this.getState();
    return state.installed;
  }

  async getAvailableModels(): Promise<TTSModel[]> {
    const state = await this.getState();
    return state.available;
  }

  async getDownloadProgress(modelId: string): Promise<number> {
    const state = await this.getState();
    return state.downloading[modelId] || 0;
  }

  async getTotalStorageUsed(): Promise<number> {
    const state = await this.getState();
    return state.installed.reduce((total, model) => total + model.size, 0);
  }
}

export const modelsService = new ModelsService();
