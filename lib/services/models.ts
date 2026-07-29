import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  hfModelId: string;
  ggufFiles: string[];
  type: 'qwen3' | 'omnivoice';
  size: number;
  languages: string[];
  isInstalled: boolean;
  downloadedAt?: number;
}

export interface ModelState {
  installed: TTSModel[];
  available: TTSModel[];
}

// ─── HuggingFace repo for GGUF quantized models ───
// Qwen3-TTS-0.6B Q8_0 GGUF (~600MB) from predict-woo/qwen3-tts.cpp
const GGUF_REPO = 'https://huggingface.co/predict-woo/qwen3-tts-gguf/resolve/main';

// ─── Master catalog ───
const MODEL_CATALOG: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] = [
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Synthèse vocale & clonage de voix — GGUF Q8_0 quantifié',
    hfModelId: 'predict-woo/qwen3-tts-gguf',
    ggufFiles: [
      'qwen3-tts-0.6b-f16.gguf',
      'qwen3-tts-tokenizer-f16.gguf',
    ],
    type: 'qwen3',
    size: 640 * 1024 * 1024, // ~640 MB for Q8_0
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
];

const INSTALLED_KEY = 'voxclone_installed_models';

interface InstalledRecord {
  downloadedAt: number;
  modelDir: string;
}

async function getInstalledRecords(): Promise<Record<string, InstalledRecord>> {
  try {
    const stored = await AsyncStorage.getItem(INSTALLED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

async function saveInstalledRecords(records: Record<string, InstalledRecord>): Promise<void> {
  await AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify(records));
}

function getModelDir(modelId: string): string {
  return `${FileSystem.documentDirectory}models/${modelId}`;
}

class ModelsService {
  async getState(): Promise<ModelState> {
    const records = await getInstalledRecords();
    const installedIds = new Set(Object.keys(records));

    const installed: TTSModel[] = MODEL_CATALOG
      .filter((m) => installedIds.has(m.id))
      .map((m) => ({
        ...m,
        isInstalled: true,
        downloadedAt: records[m.id]?.downloadedAt,
      }));

    const available: TTSModel[] = MODEL_CATALOG
      .filter((m) => !installedIds.has(m.id))
      .map((m) => ({ ...m, isInstalled: false }));

    return { installed, available };
  }

  /**
   * Download Qwen3-TTS GGUF model files from HuggingFace.
   * REAL download — no simulation.
   */
  async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<boolean> {
    const records = await getInstalledRecords();

    if (records[modelId]) {
      console.warn('Model already installed:', modelId);
      return false;
    }

    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) {
      console.error('Model not found in catalog:', modelId);
      return false;
    }

    const modelDir = getModelDir(modelId);

    // Ensure model directory exists
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
    }

    const totalFiles = model.ggufFiles.length;
    let totalDownloaded = 0;

    for (let i = 0; i < totalFiles; i++) {
      const fileName = model.ggufFiles[i];
      const fileUrl = `${GGUF_REPO}/${fileName}`;
      const filePath = `${modelDir}/${fileName}`;

      try {
        const downloadResult = await FileSystem.downloadAsync(
          fileUrl,
          filePath,
        );

        if (downloadResult.status !== 200) {
          console.error(`Failed to download ${fileName}: HTTP ${downloadResult.status}`);
          return false;
        }

        totalDownloaded++;
        const fileProgress = (totalDownloaded / totalFiles) * 100;
        onProgress?.(Math.round(fileProgress));
      } catch (error) {
        console.error(`Download error for ${fileName}:`, error);
        return false;
      }
    }

    records[modelId] = {
      downloadedAt: Date.now(),
      modelDir,
    };
    await saveInstalledRecords(records);
    return true;
  }

  async deleteModel(modelId: string): Promise<boolean> {
    const records = await getInstalledRecords();
    if (!records[modelId]) return false;

    // Remove model files from disk
    const modelDir = records[modelId].modelDir;
    try {
      const dirInfo = await FileSystem.getInfoAsync(modelDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(modelDir, { idempotent: true });
      }
    } catch (error) {
      console.error('Failed to delete model files:', error);
    }

    delete records[modelId];
    await saveInstalledRecords(records);
    return true;
  }

  async isInstalled(modelId: string): Promise<boolean> {
    const records = await getInstalledRecords();
    return !!records[modelId];
  }

  async getInstalledModels(): Promise<TTSModel[]> {
    const { installed } = await this.getState();
    return installed;
  }

  async getModelPath(modelId: string): Promise<string | null> {
    const records = await getInstalledRecords();
    return records[modelId]?.modelDir || null;
  }

  async getTotalStorageUsed(): Promise<number> {
    const records = await getInstalledRecords();
    return MODEL_CATALOG
      .filter((m) => records[m.id])
      .reduce((total, m) => total + m.size, 0);
  }

  getCatalog(): Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] {
    return MODEL_CATALOG;
  }
}

export const modelsService = new ModelsService();
