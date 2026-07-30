import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  ggufFiles: { name: string; url: string }[];
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

// ─── Master catalog ───
const MODEL_CATALOG: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] = [
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Synthèse vocale & clonage de voix — GGUF Q8_0',
    ggufFiles: [
      { name: 'qwen3-tts-12hz-0.6b-base-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-0.6b-base-GGUF/resolve/main/qwen3-tts-12hz-0.6b-base-q8_0.gguf' },
      { name: 'qwen3-tts-tokenizer-12hz-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-tokenizer-12hz-GGUF/resolve/main/qwen3-tts-tokenizer-12hz-q8_0.gguf' },
    ],
    type: 'qwen3',
    size: 985 * 1024 * 1024,
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
  {
    id: 'qwen3-tts-17b',
    name: 'Qwen3-TTS 1.7B',
    description: 'Modèle haute qualité (1.7B) — GGUF Q8_0',
    ggufFiles: [
      { name: 'qwen3-tts-12hz-1.7b-base-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-1.7b-base-GGUF/resolve/main/qwen3-tts-12hz-1.7b-base-q8_0.gguf' },
      { name: 'qwen3-tts-tokenizer-12hz-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-tokenizer-12hz-GGUF/resolve/main/qwen3-tts-tokenizer-12hz-q8_0.gguf' },
    ],
    type: 'qwen3',
    size: 2066 * 1024 * 1024,
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
  {
    id: 'omnivoice-base',
    name: 'OmniVoice',
    description: 'Synthèse vocale 646 langues + voice design — GGUF Q4_K_M',
    ggufFiles: [
      { name: 'omnivoice-base-Q4_K_M.gguf', url: 'https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-base-Q4_K_M.gguf' },
      { name: 'omnivoice-tokenizer-Q8_0.gguf', url: 'https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-tokenizer-Q8_0.gguf' },
    ],
    type: 'omnivoice',
    size: 660 * 1024 * 1024,
    languages: ['646+ languages', 'Français', 'English', '中文', '日本語', '한국어', 'Deutsch', 'Español'],
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
      const fileInfo = model.ggufFiles[i];
      const fileName = fileInfo.name;
      const fileUrl = fileInfo.url;
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
