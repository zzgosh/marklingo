import * as vscode from 'vscode';
import {
  evictTranslationMetaCachePayload,
  loadTranslationMeta,
  saveTranslationMeta,
  type TranslationMetaV1,
} from '../translation/cache.js';
import { getProjectsStorageRoot } from './paths.js';

export const PRIVATE_STORAGE_QUOTA_BYTES = 300 * 1024 * 1024;
export const PRIVATE_STORAGE_COMPACT_TARGET_BYTES = 150 * 1024 * 1024;

export type PrivateStorageStats = {
  rootUri: string;
  totalBytes: number;
  quotaBytes: number;
  projectCount: number;
  metaFileCount: number;
  activeCacheCount: number;
  evictedCacheCount: number;
  cachePayloadBytes: number;
  oldestCacheAccessedAt?: string;
  newestCacheAccessedAt?: string;
};

export type PrivateStorageCompactionSummary = {
  beforeBytes: number;
  afterBytes: number;
  quotaBytes: number;
  targetBytes: number;
  reclaimedBytes: number;
  evictedEntries: number;
  errors: string[];
};

type StorageFileEntry = {
  uri: vscode.Uri;
  sizeBytes: number;
  mtime: number;
};

type MetaStorageEntry = StorageFileEntry & {
  meta: TranslationMetaV1;
  hasCachePayload: boolean;
  lastAccessedAtMs: number;
  lastAccessedAt?: string;
};

type PrivateStorageScan = {
  files: StorageFileEntry[];
  metas: MetaStorageEntry[];
  projectCount: number;
};

function isMetaFile(uri: vscode.Uri): boolean {
  return uri.fsPath.endsWith('_mdt.meta.json');
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function hasCachePayload(meta: TranslationMetaV1): boolean {
  if (meta.cache?.payloadStatus === 'evicted') return false;
  return meta.segments.length > 0 || Object.keys(meta.translations).length > 0 || Boolean(meta.debug);
}

function getMetaAccessTime(meta: TranslationMetaV1, stat: StorageFileEntry): { iso?: string; ms: number } {
  const iso = meta.cache?.lastAccessedAt ?? meta.updatedAt;
  return { iso, ms: parseTime(iso) ?? stat.mtime };
}

async function collectStorageFiles(root: vscode.Uri): Promise<StorageFileEntry[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return [];
  }

  const files: StorageFileEntry[] = [];
  for (const [name, type] of entries) {
    const child = vscode.Uri.joinPath(root, name);
    if (type === vscode.FileType.Directory) {
      files.push(...await collectStorageFiles(child));
      continue;
    }
    try {
      const stat = await vscode.workspace.fs.stat(child);
      files.push({ uri: child, sizeBytes: stat.size, mtime: stat.mtime });
    } catch {
      // Ignore entries deleted while scanning.
    }
  }
  return files;
}

async function countProjectDirectories(root: vscode.Uri): Promise<number> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(root);
    return entries.filter(([, type]) => type === vscode.FileType.Directory).length;
  } catch {
    return 0;
  }
}

async function readMetaStorageEntries(files: StorageFileEntry[]): Promise<MetaStorageEntry[]> {
  const metas: MetaStorageEntry[] = [];
  for (const file of files) {
    if (!isMetaFile(file.uri)) continue;
    const meta = await loadTranslationMeta(file.uri);
    if (!meta) continue;
    const access = getMetaAccessTime(meta, file);
    metas.push({
      ...file,
      meta,
      hasCachePayload: hasCachePayload(meta),
      lastAccessedAt: access.iso,
      lastAccessedAtMs: access.ms,
    });
  }
  return metas;
}

async function scanPrivateStorage(context: vscode.ExtensionContext): Promise<PrivateStorageScan> {
  const root = getProjectsStorageRoot(context);
  const [files, projectCount] = await Promise.all([
    collectStorageFiles(root),
    countProjectDirectories(root),
  ]);

  return { files, metas: await readMetaStorageEntries(files), projectCount };
}

function buildStats(context: vscode.ExtensionContext, scan: PrivateStorageScan, quotaBytes: number): PrivateStorageStats {
  const totalBytes = scan.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const activeMetas = scan.metas.filter((entry) => entry.hasCachePayload);
  const accessedTimes = activeMetas
    .map((entry) => entry.lastAccessedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    rootUri: getProjectsStorageRoot(context).toString(),
    totalBytes,
    quotaBytes,
    projectCount: scan.projectCount,
    metaFileCount: scan.metas.length,
    activeCacheCount: activeMetas.length,
    evictedCacheCount: scan.metas.filter((entry) => entry.meta.cache?.payloadStatus === 'evicted').length,
    cachePayloadBytes: activeMetas.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    oldestCacheAccessedAt: accessedTimes[0],
    newestCacheAccessedAt: accessedTimes.at(-1),
  };
}

export async function readPrivateStorageStats(
  context: vscode.ExtensionContext,
  quotaBytes = PRIVATE_STORAGE_QUOTA_BYTES,
): Promise<PrivateStorageStats> {
  return buildStats(context, await scanPrivateStorage(context), quotaBytes);
}

export async function compactPrivateStorage(
  context: vscode.ExtensionContext,
  options: { targetBytes?: number; quotaBytes?: number } = {},
): Promise<PrivateStorageCompactionSummary> {
  const quotaBytes = options.quotaBytes ?? PRIVATE_STORAGE_QUOTA_BYTES;
  const targetBytes = Math.max(0, options.targetBytes ?? quotaBytes);
  const files = await collectStorageFiles(getProjectsStorageRoot(context));
  let currentBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const beforeBytes = currentBytes;
  const errors: string[] = [];
  let evictedEntries = 0;

  if (currentBytes <= targetBytes) {
    return {
      beforeBytes,
      afterBytes: currentBytes,
      quotaBytes,
      targetBytes,
      reclaimedBytes: 0,
      evictedEntries: 0,
      errors,
    };
  }

  const evictable = (await readMetaStorageEntries(files))
    .filter((entry) => entry.hasCachePayload)
    .sort((a, b) => a.lastAccessedAtMs - b.lastAccessedAtMs || a.uri.toString().localeCompare(b.uri.toString()));

  for (const entry of evictable) {
    if (currentBytes <= targetBytes) break;
    try {
      const evicted = evictTranslationMetaCachePayload(entry.meta);
      await saveTranslationMeta(entry.uri, evicted);
      const nextStat = await vscode.workspace.fs.stat(entry.uri);
      currentBytes -= Math.max(0, entry.sizeBytes - nextStat.size);
      evictedEntries++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${entry.uri.fsPath}: ${message}`);
    }
  }

  return {
    beforeBytes,
    afterBytes: currentBytes,
    quotaBytes,
    targetBytes,
    reclaimedBytes: Math.max(0, beforeBytes - currentBytes),
    evictedEntries,
    errors,
  };
}

export async function enforcePrivateStorageQuota(
  context: vscode.ExtensionContext,
  quotaBytes = PRIVATE_STORAGE_QUOTA_BYTES,
): Promise<PrivateStorageCompactionSummary> {
  return compactPrivateStorage(context, { quotaBytes, targetBytes: quotaBytes });
}
