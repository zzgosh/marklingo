import * as vscode from 'vscode';
import * as path from 'node:path';
import { getProjectsStorageRoot } from '../storage/paths.js';
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

async function deleteExternalOutput(uri: vscode.Uri, expectedHash: string | undefined): Promise<'deleted' | 'skipped' | 'missing'> {
  let current: Uint8Array;
  try {
    current = await vscode.workspace.fs.readFile(uri);
  } catch {
    return 'missing';
  }

  if (expectedHash) {
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

export async function scanTrackedWorkspaceOutputs(context: vscode.ExtensionContext): Promise<TrackedWorkspaceOutputScan> {
  const storageRoot = getProjectsStorageRoot(context);
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
): Promise<WorkspaceOutputDeleteSummary> {
  const { outputs } = await scanTrackedWorkspaceOutputs(context);
  let deleted = 0;
  let skipped = 0;
  let missing = 0;
  const errors: string[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const { uri, outputHash } = outputs[i];
    progress?.report({ message: `${i + 1}/${outputs.length}` });
    try {
      const result = await deleteExternalOutput(uri, outputHash);
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

export async function deletePrivateTranslationCache(context: vscode.ExtensionContext): Promise<string | undefined> {
  const storageRoot = getProjectsStorageRoot(context);
  try {
    await vscode.workspace.fs.delete(storageRoot, { recursive: true, useTrash: true });
    return undefined;
  } catch (e) {
    const storageFiles = await collectFiles(storageRoot);
    if (storageFiles.length === 0) return undefined;
    return e instanceof Error ? e.message : String(e);
  }
}

export async function deleteAllTranslatedFiles(context: vscode.ExtensionContext) {
  const { storageRoot, storageFiles, outputs } = await scanTrackedWorkspaceOutputs(context);

  if (storageFiles.length === 0 && outputs.length === 0) {
    await vscode.window.showInformationMessage('MarkLingo: No extension-tracked translated files or private cache were found.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `MarkLingo: Delete ${outputs.length} tracked workspace output file(s) and clear the private extension cache?`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;

  const summary = await vscode.window.withProgress<WorkspaceOutputDeleteSummary>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Deleting translated files...',
      cancellable: false,
    },
    async (progress) => {
      const workspaceSummary = await deleteTrackedWorkspaceOutputs(context, progress);

      progress.report({ message: 'Clearing private cache' });
      const cacheError = await deletePrivateTranslationCache(context);
      if (cacheError) {
        workspaceSummary.errors.push(`${storageRoot.fsPath}: ${cacheError}`);
      }

      return workspaceSummary;
    },
  );

  if (summary.errors.length) {
    console.warn('[marklingo] delete errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `MarkLingo: Deleted ${summary.deleted} translated file(s), skipped ${summary.skipped} modified file(s), ${summary.missing} file(s) were already missing, and ${summary.errors.length} operation(s) failed.`,
    );
    return;
  }

  const skippedMessage = summary.skipped > 0 ? ` Skipped ${summary.skipped} modified translated file(s).` : '';
  await vscode.window.showInformationMessage(
    `MarkLingo: Cleared private cache and deleted ${summary.deleted} tracked translated file(s).${skippedMessage}`,
  );
}
