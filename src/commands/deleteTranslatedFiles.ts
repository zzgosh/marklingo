import * as vscode from 'vscode';
import * as path from 'node:path';
import { getProjectsStorageRoot, getProjectStorageRoot } from '../storage/paths.js';
import { loadTranslationMeta, sha256 } from '../translation/cache.js';

async function collectFiles(root: vscode.Uri): Promise<vscode.Uri[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return [];
  }

  const files: vscode.Uri[] = [];
  for (const [name, type] of entries) {
    const child = vscode.Uri.joinPath(root, name);
    if (type === vscode.FileType.Directory) {
      files.push(...await collectFiles(child));
      continue;
    }
    files.push(child);
  }
  return files;
}

function isInside(parent: vscode.Uri, child: vscode.Uri): boolean {
  const relative = path.relative(parent.fsPath, child.fsPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function deleteExternalOutput(
  uri: vscode.Uri,
  expectedHash: string | undefined,
  options: { skipModified: boolean },
): Promise<'deleted' | 'skipped' | 'missing'> {
  let current: Uint8Array;
  try {
    current = await vscode.workspace.fs.readFile(uri);
  } catch {
    return 'missing';
  }

  if (options.skipModified && expectedHash) {
    const currentHash = sha256(Buffer.from(current).toString('utf8'));
    if (currentHash !== expectedHash) return 'skipped';
  }

  await vscode.workspace.fs.delete(uri, { useTrash: true });
  return 'deleted';
}

export type WorkspaceOutputDeleteSummary = {
  deleted: number;
  skipped: number;
  missing: number;
  tracked: number;
  errors: string[];
};

type TrackedWorkspaceOutput = {
  uri: vscode.Uri;
  outputHash?: string;
};

type TrackedWorkspaceOutputScan = {
  storageRoot: vscode.Uri;
  storageFiles: vscode.Uri[];
  outputs: TrackedWorkspaceOutput[];
};

type CleanupStorageOptions = {
  projectUri?: vscode.Uri;
};

type DeleteTrackedWorkspaceOutputOptions = CleanupStorageOptions & {
  skipModified?: boolean;
};

function getCleanupStorageRoot(context: vscode.ExtensionContext, options: CleanupStorageOptions = {}): vscode.Uri {
  return options.projectUri
    ? getProjectStorageRoot(context, options.projectUri)
    : getProjectsStorageRoot(context);
}

function getCurrentProjectUri(): vscode.Uri | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === 'file') return activeUri;

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) return folders[0].uri;
  return undefined;
}

export async function scanTrackedWorkspaceOutputs(
  context: vscode.ExtensionContext,
  options: CleanupStorageOptions = {},
): Promise<TrackedWorkspaceOutputScan> {
  const storageRoot = getCleanupStorageRoot(context, options);
  const storageFiles = await collectFiles(storageRoot);
  const metaFiles = storageFiles.filter((uri) => uri.fsPath.endsWith('_mdt.meta.json'));

  const externalOutputs = new Map<string, TrackedWorkspaceOutput>();
  for (const metaUri of metaFiles) {
    const meta = await loadTranslationMeta(metaUri);
    if (!meta?.outputUri) continue;
    const outputUri = vscode.Uri.parse(meta.outputUri);
    if (isInside(storageRoot, outputUri)) continue;
    externalOutputs.set(outputUri.toString(), { uri: outputUri, outputHash: meta.outputHash });
  }

  return { storageRoot, storageFiles, outputs: [...externalOutputs.values()] };
}

export async function deleteTrackedWorkspaceOutputs(
  context: vscode.ExtensionContext,
  progress?: vscode.Progress<{ message?: string }>,
  options: DeleteTrackedWorkspaceOutputOptions = {},
): Promise<WorkspaceOutputDeleteSummary> {
  const { outputs } = await scanTrackedWorkspaceOutputs(context, options);
  const skipModified = options.skipModified ?? true;
  let deleted = 0;
  let skipped = 0;
  let missing = 0;
  const errors: string[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const { uri, outputHash } = outputs[i];
    progress?.report({ message: `${i + 1}/${outputs.length}` });
    try {
      const result = await deleteExternalOutput(uri, outputHash, { skipModified });
      if (result === 'deleted') deleted++;
      if (result === 'skipped') skipped++;
      if (result === 'missing') missing++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${uri.fsPath}: ${msg}`);
    }
  }

  return { deleted, skipped, missing, tracked: outputs.length, errors };
}

export async function deletePrivateTranslationCache(
  context: vscode.ExtensionContext,
  projectUri?: vscode.Uri,
): Promise<string | undefined> {
  const storageRoot = projectUri
    ? getProjectStorageRoot(context, projectUri)
    : getProjectsStorageRoot(context);
  try {
    await vscode.workspace.fs.delete(storageRoot, { recursive: true, useTrash: true });
    return undefined;
  } catch (e) {
    const storageFiles = await collectFiles(storageRoot);
    if (storageFiles.length === 0) return undefined;
    return e instanceof Error ? e.message : String(e);
  }
}

export async function deleteProjectTranslationData(
  context: vscode.ExtensionContext,
  projectUri: vscode.Uri,
  progress?: vscode.Progress<{ message?: string }>,
): Promise<WorkspaceOutputDeleteSummary> {
  const { storageRoot } = await scanTrackedWorkspaceOutputs(context, { projectUri });
  const summary = await deleteTrackedWorkspaceOutputs(context, progress, { projectUri, skipModified: false });

  progress?.report({ message: 'Clearing translation metadata/cache' });
  const cacheError = await deletePrivateTranslationCache(context, projectUri);
  if (cacheError) {
    summary.errors.push(`${storageRoot.fsPath}: ${cacheError}`);
  }

  return summary;
}

export async function deleteCurrentProjectTranslatedFiles(context: vscode.ExtensionContext) {
  const projectUri = getCurrentProjectUri();
  if (!projectUri) {
    await vscode.window.showErrorMessage('MarkLingo: Open a file in the project before deleting project translations.');
    return;
  }

  const { storageRoot, storageFiles, outputs } = await scanTrackedWorkspaceOutputs(context, { projectUri });

  if (storageFiles.length === 0 && outputs.length === 0) {
    await vscode.window.showInformationMessage('MarkLingo: No translated files or translation metadata/cache were found for the current project.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    "MarkLingo: Delete this project's tracked translated files, including files edited after generation, and translation metadata/cache?",
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;

  const summary = await vscode.window.withProgress<WorkspaceOutputDeleteSummary>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Deleting current project translations...',
      cancellable: false,
    },
    async (progress) => {
      return deleteProjectTranslationData(context, projectUri, progress);
    },
  );

  if (summary.errors.length) {
    console.warn('[marklingo] current project delete errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `MarkLingo: Deleted ${summary.deleted} translated file(s), ${summary.missing} file(s) were already missing, and ${summary.errors.length} operation(s) failed.`,
    );
    return;
  }

  await vscode.window.showInformationMessage(
    `MarkLingo: Cleared current project metadata/cache and deleted ${summary.deleted} tracked translated file(s).`,
  );
}
