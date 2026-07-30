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

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Math.round((bytes / Math.pow(1024, i)) * 10) / 10} ${units[i]}`;
}

// ─── Master catalog ───
//
// `name` is the filename on disk, NOT the name on HuggingFace. qwen3-tts.cpp
// hardcodes the filenames it looks for inside the model directory
// (qwen3_tts.cpp: load_models), so the download has to land on those exact
// names or the loader reports "no model found" on a directory full of files.
// OmniVoice takes explicit paths, so its files keep their upstream names.
const MODEL_CATALOG: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] = [
  {
    id: 'omnivoice-base',
    name: 'OmniVoice',
    description: 'Clonage de voix multilingue — le plus rapide à installer',
    ggufFiles: [
      { name: 'omnivoice-base-Q4_K_M.gguf', url: 'https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-base-Q4_K_M.gguf' },
      { name: 'omnivoice-tokenizer-Q8_0.gguf', url: 'https://huggingface.co/Serveurperso/OmniVoice-GGUF/resolve/main/omnivoice-tokenizer-Q8_0.gguf' },
    ],
    type: 'omnivoice',
    size: 407485216 + 288889600,
    languages: ['646+ langues', 'Français', 'English', '中文', '日本語', '한국어', 'Deutsch', 'Español'],
  },
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Clonage zero-shot Qwen3 — qualité supérieure, 1,2 Go',
    ggufFiles: [
      { name: 'qwen3-tts-0.6b-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-0.6b-base-GGUF/resolve/main/qwen3-tts-12hz-0.6b-base-q8_0.gguf' },
      { name: 'qwen3-tts-tokenizer-f16.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-tokenizer-12hz-GGUF/resolve/main/qwen3-tts-tokenizer-12hz-q8_0.gguf' },
    ],
    type: 'qwen3',
    size: 985716544 + 290623616,
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
  {
    id: 'qwen3-tts-17b',
    name: 'Qwen3-TTS 1.7B',
    description: 'Le plus fidèle — 2,3 Go, réservé aux appareils récents',
    ggufFiles: [
      // Same on-disk name as the 0.6B: the loader keys on the filename and
      // reads the real dimensions from the GGUF header.
      { name: 'qwen3-tts-0.6b-q8_0.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-1.7b-base-GGUF/resolve/main/qwen3-tts-12hz-1.7b-base-q8_0.gguf' },
      { name: 'qwen3-tts-tokenizer-f16.gguf', url: 'https://huggingface.co/cstr/qwen3-tts-tokenizer-12hz-GGUF/resolve/main/qwen3-tts-tokenizer-12hz-q8_0.gguf' },
    ],
    type: 'qwen3',
    size: 2066 * 1024 * 1024,
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
];

// Bumped to v2 when the on-disk GGUF filenames changed. Anything recorded
// under the old key points at files the current loader cannot find, so those
// installs are wiped rather than left to fail at load time.
const INSTALLED_KEY = 'voxclone_installed_models_v2';
const LEGACY_INSTALLED_KEYS = ['voxclone_installed_models'];

let migrationDone = false;

async function migrateLegacyInstalls(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  for (const key of LEGACY_INSTALLED_KEYS) {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) continue;

      const records = JSON.parse(stored) as Record<string, InstalledRecord>;
      for (const record of Object.values(records)) {
        if (!record?.modelDir) continue;
        try {
          await FileSystem.deleteAsync(record.modelDir, { idempotent: true });
        } catch {
          // Best effort — a leftover directory is not worth blocking startup.
        }
      }
      await AsyncStorage.removeItem(key);
      console.log(`Cleared stale model installs from ${key}`);
    } catch (error) {
      console.warn(`Legacy model migration failed for ${key}:`, error);
    }
  }
}

interface InstalledRecord {
  downloadedAt: number;
  modelDir: string;
}

async function getInstalledRecords(): Promise<Record<string, InstalledRecord>> {
  await migrateLegacyInstalls();
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

    // Fail before writing a single byte rather than halfway through a 1 GB
    // download. 10% headroom keeps the device from hitting a full-disk state.
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      if (free < model.size * 1.1) {
        throw new Error(
          `Espace insuffisant : ${formatBytes(model.size)} nécessaires, ` +
          `${formatBytes(free)} disponibles.`
        );
      }
    } catch (error: any) {
      if (error?.message?.startsWith('Espace insuffisant')) throw error;
      // Storage probing is advisory; never block a download because it failed.
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
        // Base progress from already downloaded files
        const baseProgress = (i / totalFiles) * 100;
        
        const downloadResumable = FileSystem.createDownloadResumable(
          fileUrl,
          filePath,
          {},
          (downloadProgress) => {
            const fileProgress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            // File contributes 1/totalFiles to overall progress
            const overallProgress = baseProgress + (fileProgress * (100 / totalFiles));
            onProgress?.(Math.min(99, Math.round(overallProgress)));
          }
        );

        const downloadResult = await downloadResumable.downloadAsync();

        if (!downloadResult || downloadResult.status !== 200) {
          console.error(`Failed to download ${fileName}: HTTP ${downloadResult?.status}`);
          await FileSystem.deleteAsync(modelDir, { idempotent: true });
          return false;
        }

        // A truncated or error-page download still yields status 200. Every
        // real GGUF here is far above 1 MB, so anything smaller is not a model
        // and would only fail later inside the loader with a cryptic message.
        const written = await FileSystem.getInfoAsync(filePath);
        const writtenSize = written.exists ? written.size ?? 0 : 0;
        if (writtenSize < 1024 * 1024) {
          console.error(`${fileName} is truncated (${writtenSize} bytes)`);
          await FileSystem.deleteAsync(modelDir, { idempotent: true });
          return false;
        }

        totalDownloaded++;
        const currentProgress = (totalDownloaded / totalFiles) * 100;
        onProgress?.(Math.round(currentProgress));
      } catch (error) {
        console.error(`Download error for ${fileName}:`, error);
        await FileSystem.deleteAsync(modelDir, { idempotent: true }).catch(() => {});
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
