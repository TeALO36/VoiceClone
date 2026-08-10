/**
 * Self-update service.
 *
 * The app is distributed as a signed Android APK attached to GitHub releases
 * (see .github/workflows/build-apk.yml). This service:
 *  1. asks the GitHub API for the latest release,
 *  2. compares its version with the installed one,
 *  3. downloads the APK (with progress, resumable) into the app cache,
 *  4. hands it to the Android package installer through the FileProvider
 *     registered by expo-file-system (`${applicationId}.FileSystemFileProvider`).
 *
 * It only works when the repository is public — the GitHub API is queried
 * without authentication so the app carries no token.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compareVersions, parseVersion } from './version';

export { compareVersions, parseVersion };

export const GITHUB_OWNER = 'TeALO36';
export const GITHUB_REPO = 'VoiceClone';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LAST_CHECK_KEY = 'voxclone:update:last-check';
const AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 h

export interface ReleaseAsset {
  name: string;
  url: string; // browser download URL (github.com/...)
  size: number; // bytes
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  isUpdateAvailable: boolean;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  apkAsset: ReleaseAsset | null;
  releaseUrl: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
  assets?: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

/** Version of the installed build (native manifest first, config as fallback). */
export async function getCurrentAppVersion(): Promise<string> {
  if (Platform.OS === 'android') {
    const native = Application.nativeApplicationVersion;
    if (native && native.trim().length > 0) return native.trim();
  }
  const configured = Constants.expoConfig?.version;
  if (configured && configured.trim().length > 0) return configured.trim();
  return '0.0.0';
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function pickApkAsset(release: GitHubRelease): ReleaseAsset | null {
  const asset = (release.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.apk'));
  if (!asset) return null;
  return { name: asset.name, url: asset.browser_download_url, size: asset.size };
}

/**
 * Fetches the latest public release from GitHub. Throws on network errors,
 * rate limits or a private/missing repository so the UI can fall back to
 * opening the releases page.
 */
export async function fetchLatestRelease(): Promise<UpdateInfo> {
  const currentVersion = await getCurrentAppVersion();

  const response = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'VoiceClone' },
  });
  if (!response.ok) {
    const detail = response.status === 404
      ? 'dépôt introuvable ou privé'
      : `HTTP ${response.status}`;
    throw new Error(`GitHub API ${detail}`);
  }

  const release = (await response.json()) as GitHubRelease;
  const latestVersion = (release.tag_name ?? '').replace(/^v/i, '');
  const apkAsset = pickApkAsset(release);

  return {
    currentVersion,
    latestVersion,
    isUpdateAvailable:
      latestVersion.length > 0 && compareVersions(latestVersion, currentVersion) > 0,
    releaseName: release.name ?? `Version ${latestVersion}`,
    releaseNotes: stripMarkdown(release.body ?? ''),
    publishedAt: release.published_at ?? '',
    apkAsset,
    releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
  };
}

/** Cached auto-check: only hits the API at most once per interval. */
export async function shouldAutoCheck(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(LAST_CHECK_KEY);
    if (stored) {
      const elapsed = Date.now() - Number(stored);
      if (!Number.isNaN(elapsed) && elapsed < AUTO_CHECK_INTERVAL_MS) return false;
    }
  } catch {
    // Ignore storage failures — checking again is harmless.
  }
  return true;
}

export async function markChecked(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    // Non-fatal.
  }
}

/**
 * Removes leftover update files from the cache. Only used when a download is
 * abandoned for good — an interrupted transfer is kept on disk so it can be
 * resumed on the next launch (see findPartialUpdate / downloadAndInstallApk).
 */
export async function cleanUpdateCache(): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const entry of entries) {
      if (entry.startsWith('voxclone-update-')) {
        await FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true });
      }
    }
  } catch {
    // Non-fatal.
  }
}

export function apkCachePath(version: string): string {
  return `${FileSystem.cacheDirectory}voxclone-update-v${version}.apk`;
}

export interface PartialDownload {
  version: string;
  filePath: string;
  downloadedBytes: number;
}

/**
 * Finds the update file left in the cache by an interrupted download (the app
 * was closed mid-transfer, the network dropped, …). Returns null when nothing
 * is on disk. The caller compares downloadedBytes with the release asset size
 * to decide between "resume" (< total) and "already complete" (== total).
 */
export async function findPartialUpdate(): Promise<PartialDownload | null> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return null;
    const entries = await FileSystem.readDirectoryAsync(dir);
    const fileName = entries.find(
      (e) => e.startsWith('voxclone-update-') && e.endsWith('.apk')
    );
    if (!fileName) return null;
    const info = await FileSystem.getInfoAsync(`${dir}${fileName}`);
    if (!info.exists || (info.size ?? 0) <= 0) return null;
    const version = fileName
      .replace(/^voxclone-update-v/, '')
      .replace(/\.apk$/, '');
    return { version, filePath: `${dir}${fileName}`, downloadedBytes: info.size ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Downloads the release APK into the app cache then hands it to the Android
 * package installer. onProgress receives 0–100.
 *
 * The transfer resumes from whatever is already on disk (a partial file left
 * by an earlier attempt or app close) instead of restarting from zero. On
 * failure the partial file is deliberately kept so the next launch can offer
 * to resume. If the whole APK is already cached, the download is skipped and
 * the installer is launched straight away.
 *
 * On web there is nothing to install — callers should open the release page
 * instead (this throws).
 */
export async function downloadAndInstallApk(
  asset: ReleaseAsset,
  version: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('L’installation directe n’est disponible que sur Android.');
  }

  const filePath = apkCachePath(version);

  // A previous run may already have fetched the full APK (e.g. the user
  // cancelled the installer): install it directly, no re-download.
  const existing = await FileSystem.getInfoAsync(filePath);
  const alreadyComplete = existing.exists && (existing.size ?? 0) === asset.size;
  let done = alreadyComplete;
  if (alreadyComplete) {
    onProgress?.(100);
  }

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));

      // Resume from the partial file on disk (left by a previous run or by an
      // interrupted attempt) — the Range header continues the transfer from
      // that byte offset instead of restarting the 62 MB from zero.
      const partial = await FileSystem.getInfoAsync(filePath);
      const resumeData =
        partial.exists && (partial.size ?? 0) > 0 ? String(partial.size) : undefined;

      const resumable = FileSystem.createDownloadResumable(
        asset.url,
        filePath,
        {},
        (p) => {
          const expected = p.totalBytesExpectedToWrite;
          const written = p.totalBytesWritten;
          if (expected > 0 && written >= 0) {
            onProgress?.(Math.min(99, Math.round((written / expected) * 100)));
          }
        },
        resumeData
      );
      const result = await resumable.downloadAsync();

      if (result && (result.status === 200 || result.status === 206)) {
        if (resumeData != null && result.status === 200) {
          // Server ignored the Range header: the partial file is corrupted.
          lastError = new Error('Serveur sans reprise — redémarrage du fichier');
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          continue;
        }
      } else {
        lastError = new Error(`HTTP ${result?.status}`);
        continue;
      }

      // Strict size check — GitHub serves a stable Content-Length, so any
      // mismatch means a truncated transfer.
      const written = await FileSystem.getInfoAsync(filePath);
      const writtenSize = written.exists ? written.size ?? 0 : 0;
      if (writtenSize !== asset.size) {
        lastError = new Error(`APK tronqué (${writtenSize}/${asset.size} octets)`);
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        continue;
      }

      done = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (!done) {
    // Keep the partial file on disk: the next launch detects it via
    // findPartialUpdate() and offers to resume from this byte offset.
    throw lastError instanceof Error
      ? lastError
      : new Error('Téléchargement de la mise à jour impossible');
  }

  onProgress?.(100);

  // Install via the system package installer. expo-file-system registers a
  // FileProvider (authority `<package>.FileSystemFileProvider`) that exposes
  // the cache directory as `cached_expo_files`, so the content URI below
  // resolves to the downloaded APK without any extra native setup.
  // `applicationId` is the real package name (e.g. com.app.voxclonemobile),
  // which is what the FileProvider authority is built from. Note: do NOT use
  // `getAndroidId()` here — that returns the device's randomized Android ID
  // (a hex string), which would produce an unresolvable content:// URI.
  const packageName = Application.applicationId || Constants.expoConfig?.android?.package || '';
  if (!packageName) {
    throw new Error('Identifiant de l’application introuvable');
  }
  const contentUri = `content://${packageName}.FileSystemFileProvider/cached_expo_files/${apkCachePath(version).split('/').pop()}`;

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      // FLAG_GRANT_READ_URI_PERMISSION — let the installer read our file.
      flags: 1,
    });
  } catch (error) {
    throw new Error(
      `Impossible d’ouvrir l’installeur (${error instanceof Error ? error.message : String(error)}). ` +
        'Autorisez « Installer des applications inconnues » pour VoiceClone, ou installez l’APK depuis la page GitHub.'
    );
  }
}
