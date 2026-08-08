import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  ggufFiles: { name: string; url: string }[];
  type: 'qwen3' | 'omnivoice' | 'pocket';
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
    id: 'pocket-tts',
    name: 'Pocket TTS (Kyutai)',
    description: 'Clonage zéro-shot 100M — très rapide sur CPU, modèle 2026 de Kyutai',
    // Pocket TTS is a 100M-parameter zero-shot TTS from Kyutai, run through
    // sherpa-onnx (ONNX Runtime). The five ONNX files are the flow LM, main LM,
    // encoder, decoder and text conditioner; the two JSON files are the vocab
    // and token scores. `voices/*.wav` are bundled reference voices so plain
    // TTS works without any upload (Pocket TTS always needs a reference voice).
    // Mirrored from the sherpa-onnx release archive to HuggingFace so each file
    // can be downloaded individually by the app's resumable downloader.
    ggufFiles: [
      { name: 'lm_flow.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/lm_flow.int8.onnx' },
      { name: 'lm_main.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/lm_main.int8.onnx' },
      { name: 'encoder.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/encoder.onnx' },
      { name: 'decoder.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/decoder.int8.onnx' },
      { name: 'text_conditioner.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/text_conditioner.onnx' },
      { name: 'vocab.json', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/vocab.json' },
      { name: 'token_scores.json', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/token_scores.json' },
      { name: 'voices/bria.wav', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/test_wavs/bria.wav' },
      { name: 'voices/loona.wav', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/test_wavs/loona.wav' },
    ],
    type: 'pocket',
    size: 9_962_530 + 76_341_079 + 72_713_165 + 22_693_618 + 16_388_343 + 69_478 + 123_616 + 2_152_986 + 50_478,
    languages: ['English'],
  },
  {
    id: 'qwen3-tts-06b',
    name: 'Qwen3-TTS 0.6B',
    description: 'Clonage sans transcription — génération 2× plus rapide',
    // Served from TeALO/qwen3-tts-gguf because the other Qwen3-TTS GGUFs on the
    // Hub (cstr/*) target CrispASR, a different runtime: they ship
    // code_pred.output.N.weight where this engine wants code_pred.lm_head.*,
    // and no pre_tfm block at all. These come from qwen3-tts.cpp's own
    // converter, so the layout matches by construction. The filenames are the
    // ones Qwen3TTS::load_models hardcodes — renaming them breaks loading.
    ggufFiles: [
      { name: 'qwen3-tts-0.6b-q8_0.gguf', url: 'https://huggingface.co/TeALO/qwen3-tts-gguf/resolve/main/qwen3-tts-0.6b-q8_0.gguf' },
      { name: 'qwen3-tts-tokenizer-f16.gguf', url: 'https://huggingface.co/TeALO/qwen3-tts-gguf/resolve/main/qwen3-tts-tokenizer-f16.gguf' },
    ],
    type: 'qwen3',
    size: 1_342_925_920 + 273_327_360,
    languages: ['Français', 'English', '中文', '日本語', '한국어', 'Deutsch', 'Русский', 'Português', 'Español', 'Italiano'],
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

let prunedOrphans = false;

/**
 * Drop installs whose model left the catalog. Without this a withdrawn model
 * keeps its files — over a gigabyte for the Qwen3 checkpoints — with no entry
 * in the UI to delete them from.
 */
async function pruneOrphanInstalls(): Promise<void> {
  if (prunedOrphans) return;
  prunedOrphans = true;

  try {
    const stored = await AsyncStorage.getItem(INSTALLED_KEY);
    if (!stored) return;

    const records = JSON.parse(stored) as Record<string, InstalledRecord>;
    const known = new Set(MODEL_CATALOG.map((m) => m.id));
    let changed = false;

    for (const [id, record] of Object.entries(records)) {
      if (known.has(id)) continue;
      try {
        await FileSystem.deleteAsync(record.modelDir, { idempotent: true });
      } catch {
        // Reclaiming the space is best effort; the record still goes.
      }
      delete records[id];
      changed = true;
      console.log(`Removed withdrawn model ${id}`);
    }

    if (changed) await AsyncStorage.setItem(INSTALLED_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn('Orphan install pruning failed:', error);
  }
}

async function getInstalledRecords(): Promise<Record<string, InstalledRecord>> {
  await migrateLegacyInstalls();
  await pruneOrphanInstalls();
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

// Every mutation of the record map runs through this chain. Two downloads
// finishing at the same moment would otherwise both read the old map and the
// second write would silently drop the first model.
let recordsLock: Promise<unknown> = Promise.resolve();

function withRecords<T>(
  mutate: (records: Record<string, InstalledRecord>) => Promise<T> | T
): Promise<T> {
  const run = recordsLock.then(async () => {
    const records = await getInstalledRecords();
    return mutate(records);
  });
  // Keep the chain alive even when a caller rejects.
  recordsLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Models currently downloading, so a second tap cannot start the same one twice. */
const inFlight = new Map<string, number>();

function reservedBytes(): number {
  let total = 0;
  for (const size of inFlight.values()) total += size;
  return total;
}

/** Real bytes on disk, as opposed to the catalog's advertised size. */
async function directorySize(dir: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return 0;

    const entries = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const entry of entries) {
      const entryInfo = await FileSystem.getInfoAsync(`${dir}/${entry}`);
      if (entryInfo.exists && !entryInfo.isDirectory) {
        total += entryInfo.size ?? 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
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

    if (inFlight.has(modelId)) {
      console.warn('Model already downloading:', modelId);
      return false;
    }

    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) {
      console.error('Model not found in catalog:', modelId);
      return false;
    }

    // Fail before writing a single byte rather than halfway through a 1 GB
    // download. Space already promised to downloads in flight counts as taken,
    // otherwise starting three installs at once passes three separate checks
    // and they collectively run the disk dry.
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => -1);
    if (free >= 0) {
      const needed = model.size * 1.1;
      const available = free - reservedBytes();
      if (available < needed) {
        throw new Error(
          `Espace insuffisant : ${formatBytes(model.size)} nécessaires, ` +
          `${formatBytes(Math.max(0, available))} disponibles.`
        );
      }
    }

    inFlight.set(modelId, model.size);
    try {
      return await this.runDownload(model, onProgress);
    } finally {
      inFlight.delete(modelId);
    }
  }

  private async runDownload(
    model: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    const modelId = model.id;
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

      // Catalog entries may nest files in subdirectories (e.g. voices/*.wav).
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      const parentInfo = await FileSystem.getInfoAsync(parentDir);
      if (!parentInfo.exists) {
        await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
      }

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

    // Re-read under the lock: another install may have completed while this
    // one was downloading, and writing a map captured earlier would erase it.
    await withRecords(async (current) => {
      current[modelId] = { downloadedAt: Date.now(), modelDir };
      await saveInstalledRecords(current);
    });
    return true;
  }

  async deleteModel(modelId: string): Promise<boolean> {
    return withRecords(async (records) => {
      if (!records[modelId]) return false;

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
    });
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

  /** Bytes actually occupied on disk, not the catalog's advertised sizes. */
  async getTotalStorageUsed(): Promise<number> {
    const records = await getInstalledRecords();
    let total = 0;
    for (const record of Object.values(records)) {
      total += await directorySize(record.modelDir);
    }
    return total;
  }

  /** Free space left on the device, minus what downloads in flight will claim. */
  async getFreeStorage(): Promise<number> {
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => 0);
    return Math.max(0, free - reservedBytes());
  }

  /** True when the model still has all of its files on disk. */
  async verifyInstall(modelId: string): Promise<boolean> {
    const records = await getInstalledRecords();
    const record = records[modelId];
    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!record || !model) return false;

    for (const file of model.ggufFiles) {
      const info = await FileSystem.getInfoAsync(`${record.modelDir}/${file.name}`);
      if (!info.exists || (info.size ?? 0) < 1024 * 1024) return false;
    }
    return true;
  }

  getCatalog(): Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] {
    return MODEL_CATALOG;
  }
}

export const modelsService = new ModelsService();
