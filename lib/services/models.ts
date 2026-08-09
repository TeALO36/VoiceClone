import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  ggufFiles: { name: string; url: string; expectedSize?: number }[];
  type: 'qwen3' | 'omnivoice' | 'pocket';
  size: number;
  languages: string[];
  /**
   * For Pocket TTS the checkpoint is language-specific (one model per
   * language). This carries the ISO id so the UI can lock the language
   * selector to the model's language.
   */
  langId?: string;
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

// Multilingual Pocket TTS entries (fr/de/pt/it/es). The ONNX packages are
// converted from the Kyutai checkpoints with scripts/convert-pocket-tts.sh
// and uploaded to the pocket-tts-models release of this repository.
const POCKET_LANG_BASE =
  'https://github.com/TeALO36/VoiceClone/releases/download/pocket-tts-models';

// Exact byte sizes of every converted package, read from the release assets.
// fr is the 24-layer model (~4× the LM of the 6-layer base variants used for
// the other languages). Used for a weight-based progress bar (a 305 MB file
// must not look like 1/9 of the download) and for a strict post-download
// size check that catches truncated files.
const POCKET_SHARED_SIZES = {
  lmFlow: 9_962_530,
  encoder: 39_752_071,
  decoder: 22_684_077,
  textConditioner: 16_388_344,
};

const POCKET_LANG_SIZES: Record<string, { lmMain: number; vocab: number; scores: number; voice: number }> = {
  fr: { lmMain: 305_144_125, vocab: 74_240, scores: 128_500, voice: 480_078 },
  de: { lmMain: 76_341_079, vocab: 73_904, scores: 128_037, voice: 480_078 },
  pt: { lmMain: 76_341_079, vocab: 75_062, scores: 129_173, voice: 480_078 },
  it: { lmMain: 76_341_079, vocab: 74_145, scores: 128_076, voice: 354_318 },
  es: { lmMain: 76_341_079, vocab: 74_962, scores: 129_011, voice: 458_622 },
};

const POCKET_LANG_ENTRIES: Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] = [
  {
    id: 'pocket-tts-fr',
    name: 'Pocket TTS — Français',
    description: 'Pocket TTS (Kyutai) en français — clonage zéro-shot 100M, très rapide sur CPU',
    ggufFiles: pocketLangFiles(POCKET_LANG_BASE, 'fr'),
    type: 'pocket',
    langId: 'fr',
    size: pocketLangSize('fr'),
    languages: ['Français'],
  },
  {
    id: 'pocket-tts-de',
    name: 'Pocket TTS — Deutsch',
    description: 'Pocket TTS (Kyutai) auf Deutsch — Zero-Shot-Cloning, sehr schnell auf der CPU',
    ggufFiles: pocketLangFiles(POCKET_LANG_BASE, 'de'),
    type: 'pocket',
    langId: 'de',
    size: pocketLangSize('de'),
    languages: ['Deutsch'],
  },
  {
    id: 'pocket-tts-pt',
    name: 'Pocket TTS — Português',
    description: 'Pocket TTS (Kyutai) em português — clonagem zero-shot 100M, muito rápido na CPU',
    ggufFiles: pocketLangFiles(POCKET_LANG_BASE, 'pt'),
    type: 'pocket',
    langId: 'pt',
    size: pocketLangSize('pt'),
    languages: ['Português'],
  },
  {
    id: 'pocket-tts-it',
    name: 'Pocket TTS — Italiano',
    description: 'Pocket TTS (Kyutai) in italiano — clonazione zero-shot 100M, molto veloce su CPU',
    ggufFiles: pocketLangFiles(POCKET_LANG_BASE, 'it'),
    type: 'pocket',
    langId: 'it',
    size: pocketLangSize('it'),
    languages: ['Italiano'],
  },
  {
    id: 'pocket-tts-es',
    name: 'Pocket TTS — Español',
    description: 'Pocket TTS (Kyutai) en español — clonación zero-shot 100M, muy rápido en CPU',
    ggufFiles: pocketLangFiles(POCKET_LANG_BASE, 'es'),
    type: 'pocket',
    langId: 'es',
    size: pocketLangSize('es'),
    languages: ['Español'],
  },
];

function pocketLangFiles(base: string, lang: string) {
  const s = POCKET_LANG_SIZES[lang] ?? POCKET_LANG_SIZES.de;
  return [
    { name: 'lm_flow.int8.onnx', url: `${base}/${lang}_lm_flow.int8.onnx`, expectedSize: POCKET_SHARED_SIZES.lmFlow },
    { name: 'lm_main.int8.onnx', url: `${base}/${lang}_lm_main.int8.onnx`, expectedSize: s.lmMain },
    { name: 'encoder.onnx', url: `${base}/${lang}_encoder.onnx`, expectedSize: POCKET_SHARED_SIZES.encoder },
    { name: 'decoder.int8.onnx', url: `${base}/${lang}_decoder.int8.onnx`, expectedSize: POCKET_SHARED_SIZES.decoder },
    { name: 'text_conditioner.onnx', url: `${base}/${lang}_text_conditioner.onnx`, expectedSize: POCKET_SHARED_SIZES.textConditioner },
    { name: 'vocab.json', url: `${base}/${lang}_vocab.json`, expectedSize: s.vocab },
    { name: 'token_scores.json', url: `${base}/${lang}_token_scores.json`, expectedSize: s.scores },
    { name: 'voices/bria.wav', url: `${base}/${lang}_default.wav`, expectedSize: s.voice },
    { name: 'voices/loona.wav', url: `${base}/${lang}_default.wav`, expectedSize: s.voice },
  ];
}

function pocketLangSize(lang: string): number {
  const s = POCKET_LANG_SIZES[lang] ?? POCKET_LANG_SIZES.de;
  return (
    POCKET_SHARED_SIZES.lmFlow + s.lmMain + POCKET_SHARED_SIZES.encoder +
    POCKET_SHARED_SIZES.decoder + POCKET_SHARED_SIZES.textConditioner +
    s.vocab + s.scores + s.voice + s.voice
  );
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
      { name: 'lm_flow.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/lm_flow.int8.onnx', expectedSize: 9_962_530 },
      { name: 'lm_main.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/lm_main.int8.onnx', expectedSize: 76_341_079 },
      { name: 'encoder.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/encoder.onnx', expectedSize: 72_713_165 },
      { name: 'decoder.int8.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/decoder.int8.onnx', expectedSize: 22_693_618 },
      { name: 'text_conditioner.onnx', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/text_conditioner.onnx', expectedSize: 16_388_343 },
      { name: 'vocab.json', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/vocab.json', expectedSize: 69_478 },
      { name: 'token_scores.json', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/token_scores.json', expectedSize: 123_616 },
      { name: 'voices/bria.wav', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/test_wavs/bria.wav', expectedSize: 2_152_986 },
      { name: 'voices/loona.wav', url: 'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/main/test_wavs/loona.wav', expectedSize: 50_478 },
    ],
    type: 'pocket',
    langId: 'en',
    size: 9_962_530 + 76_341_079 + 72_713_165 + 22_693_618 + 16_388_343 + 69_478 + 123_616 + 2_152_986 + 50_478,
    languages: ['English'],
  },
  // Multilingual Pocket TTS — the Kyutai checkpoints (fr/de/pt/it/es) are
  // converted to the same sherpa-onnx ONNX layout and hosted as release
  // assets on this repository (tag pocket-tts-models). Each language is a
  // separate catalog entry: the checkpoint itself is language-specific, and
  // one download per language keeps installs ~190 MB.
  ...(POCKET_LANG_ENTRIES as Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[]),
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

/**
 * Minimum plausible size for a downloaded file, used to spot truncated
 * downloads. Model binaries must be substantial; tiny companion files only
 * need to be non-empty.
 */
function minSanityBytes(fileName: string): number {
  return /\.(onnx|gguf)$/i.test(fileName) ? 1024 * 1024 : 1;
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

    // Progress is weighted by each file's expected byte size, not by file
    // count. A 305 MB lm_main would otherwise look like 1/9 of the download
    // and the bar would appear stuck at ~15% for most of the install.
    const totalWeight = model.ggufFiles.reduce(
      (sum, f) => sum + (f.expectedSize ?? minSanityBytes(f.name)),
      0
    );
    let downloadedWeight = 0;

    for (let i = 0; i < model.ggufFiles.length; i++) {
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

      const fileWeight = fileInfo.expectedSize ?? minSanityBytes(fileName);
      const baseProgress = (downloadedWeight / totalWeight) * 100;

      // Retry with resume: the native side resumes a transfer when given the
      // byte offset already on disk (Range header + append). After a
      // mid-transfer failure we re-read the partial file's size and rebuild
      // the resumable with it, so the next attempt continues from where the
      // connection dropped instead of restarting a 300 MB transfer from zero.
      const MAX_ATTEMPTS = 3;
      let downloadResult: FileSystem.FileSystemDownloadResult | undefined;
      let lastError: unknown;
      const onFileProgress = (downloadProgress: FileSystem.DownloadProgressData) => {
        const expected = downloadProgress.totalBytesExpectedToWrite;
        const written = downloadProgress.totalBytesWritten;
        if (expected > 0 && written >= 0) {
          const fileProgress = Math.min(1, written / expected);
          onProgress?.(Math.min(99, Math.round(baseProgress + fileProgress * (fileWeight / totalWeight) * 100)));
        }
      };
      let done = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
        let resumeData: string | undefined;
        try {
          // resumeData is the byte offset of the partial file on disk — the
          // same value the native pauseAsync() reports as file.length(). Any
          // existing partial file is resumed even on the first attempt (e.g.
          // the app was killed mid-transfer); the strict size check below
          // catches a corrupted append and restarts from scratch.
          const partial = await FileSystem.getInfoAsync(filePath);
          if (partial.exists && (partial.size ?? 0) > 0) {
            resumeData = String(partial.size);
          }
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
          const resumable = FileSystem.createDownloadResumable(
            fileUrl,
            filePath,
            {},
            onFileProgress,
            resumeData
          );
          downloadResult = await resumable.downloadAsync();

          // A plain download answers 200; a resumed one answers 206 (Partial
          // Content) because of the Range header. Both are success. A plain
          // 200 while we asked for a Range means the server ignored it and
          // would have appended onto the partial file — discard and restart.
          if (downloadResult && (downloadResult.status === 200 || downloadResult.status === 206)) {
            if (resumeData != null && downloadResult.status === 200) {
              lastError = new Error('Server ignored Range header, restarting file');
              await FileSystem.deleteAsync(filePath, { idempotent: true });
              continue;
            }
          } else {
            lastError = new Error(`HTTP ${downloadResult?.status}`);
            continue;
          }

          // A truncated or error-page download still yields status 200. When
          // the exact size is known (catalog), require it — GitHub/HF serve
          // content with a stable Content-Length, so any mismatch means the
          // transfer was cut off. For files without a known size, fall back to
          // the 1 MB sanity floor for binaries and non-empty for tiny
          // companion files.
          const written = await FileSystem.getInfoAsync(filePath);
          const writtenSize = written.exists ? written.size ?? 0 : 0;
          const expectedSize = fileInfo.expectedSize;
          if (expectedSize != null
            ? writtenSize !== expectedSize
            : writtenSize < minSanityBytes(fileName)) {
            lastError = new Error(`${fileName} truncated (${writtenSize}/${expectedSize ?? '?'} bytes)`);
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            continue;
          }
          done = true;
        } catch (error) {
          lastError = error;
        }
      }

      if (!done) {
        console.error(`Failed to download ${fileName}:`, lastError);
        await FileSystem.deleteAsync(modelDir, { idempotent: true });
        return false;
      }

      downloadedWeight += fileWeight;
      onProgress?.(Math.min(99, Math.round((downloadedWeight / totalWeight) * 100)));
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
      if (!info.exists || (info.size ?? 0) < minSanityBytes(file.name)) return false;
    }
    return true;
  }

  getCatalog(): Omit<TTSModel, 'isInstalled' | 'downloadedAt'>[] {
    return MODEL_CATALOG;
  }
}

export const modelsService = new ModelsService();
