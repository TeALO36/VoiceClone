import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  modelId: string;
  type: 'qwen' | 'omnivoice' | 'other';
  size: number;
  languages: string[];
  isInstalled: boolean;
  downloadedAt?: number;
}

export interface ModelState {
  installed: TTSModel[];
  available: TTSModel[];
}

// ─── Master catalog — NEVER mutated at runtime ───
const MODEL_CATALOG: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] = [
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Modèle léger avec clonage de voix 3-secondes',
    modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
    type: 'qwen',
    size: 2.4 * 1024 * 1024 * 1024,
    languages: ['Chinese', 'English', 'Japanese', 'Korean', 'German', 'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'],
  },
  {
    id: 'omnivoice-base',
    name: 'OmniVoice',
    description: 'Synthèse vocale multilingue 600+ langues',
    modelId: 'k2-fsa/OmniVoice',
    type: 'omnivoice',
    size: 2.0 * 1024 * 1024 * 1024,
    languages: ['600+ languages supported'],
  },
];

const INSTALLED_KEY = 'voxclone_installed_models';

// Stored format: { [modelId]: { downloadedAt: number } }
interface InstalledRecord {
  downloadedAt: number;
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

class ModelsService {
  /**
   * Get current model state — installed and available are always mutually exclusive.
   * No duplicates: a model appears in EITHER installed OR available, never both.
   */
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
   * Download (install) a model.
   * Prevents duplicate installation — returns false if already installed.
   */
  async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<boolean> {
    const records = await getInstalledRecords();

    // ─── Prevent duplicate install ───
    if (records[modelId]) {
      console.warn('Model already installed:', modelId);
      return false;
    }

    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) {
      console.error('Model not found in catalog:', modelId);
      return false;
    }

    // Simulate download with progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      onProgress?.(i);
    }

    records[modelId] = { downloadedAt: Date.now() };
    await saveInstalledRecords(records);
    return true;
  }

  /**
   * Delete (uninstall) a model.
   */
  async deleteModel(modelId: string): Promise<boolean> {
    const records = await getInstalledRecords();
    if (!records[modelId]) return false;

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

  async getAvailableModels(): Promise<TTSModel[]> {
    const { available } = await this.getState();
    return available;
  }

  async getTotalStorageUsed(): Promise<number> {
    const records = await getInstalledRecords();
    return MODEL_CATALOG
      .filter((m) => records[m.id])
      .reduce((total, m) => total + m.size, 0);
  }

  /**
   * Get the full catalog (all models regardless of install state).
   */
  getCatalog(): Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] {
    return MODEL_CATALOG;
  }
}

export const modelsService = new ModelsService();
