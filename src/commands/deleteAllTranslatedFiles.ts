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

type DeleteSummary = {
  deleted: number;
  skipped: number;
  missing: number;
  errors: string[];
};

export async function deleteAllTranslatedFiles(context: vscode.ExtensionContext) {
  const storageRoot = getProjectsStorageRoot(context);
  const storageFiles = await collectFiles(storageRoot);
  const metaFiles = storageFiles.filter((uri) => uri.fsPath.endsWith('_mdt.meta.json'));

  const externalOutputs = new Map<string, { uri: vscode.Uri; outputHash?: string }>();
  for (const metaUri of metaFiles) {
    const meta = await loadTranslationMeta(metaUri);
    if (!meta?.outputUri) continue;
    const outputUri = vscode.Uri.parse(meta.outputUri);
    if (isInside(storageRoot, outputUri)) continue;
    externalOutputs.set(outputUri.toString(), { uri: outputUri, outputHash: meta.outputHash });
  }

  if (storageFiles.length === 0 && externalOutputs.size === 0) {
    await vscode.window.showInformationMessage('Markdown Translator: 未找到由扩展记录的译文/缓存文件。');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Markdown Translator: 将删除 ${externalOutputs.size} 个已记录的工作区译文文件，并清理扩展私有缓存。是否继续？`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;

  const summary = await vscode.window.withProgress<DeleteSummary>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Markdown Translator: 正在删除译文文件…',
      cancellable: false,
    },
    async (progress) => {
      let deleted = 0;
      let skipped = 0;
      let missing = 0;
      const errors: string[] = [];

      const outputs = [...externalOutputs.values()];
      for (let i = 0; i < outputs.length; i++) {
        const { uri, outputHash } = outputs[i];
        progress.report({ message: `${i + 1}/${outputs.length}` });
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

      progress.report({ message: '清理私有缓存' });
      try {
        await vscode.workspace.fs.delete(storageRoot, { recursive: true, useTrash: true });
      } catch (e) {
        if (storageFiles.length > 0) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${storageRoot.fsPath}: ${msg}`);
        }
      }

      return { deleted, skipped, missing, errors };
    },
  );

  if (summary.errors.length) {
    console.warn('[markdown-translator] delete errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `Markdown Translator: 已删除 ${summary.deleted} 个译文文件，${summary.skipped} 个已修改文件被跳过，${summary.missing} 个文件已不存在，${summary.errors.length} 个失败。`,
    );
    return;
  }

  const skippedMessage = summary.skipped > 0 ? `，跳过 ${summary.skipped} 个已修改译文文件` : '';
  await vscode.window.showInformationMessage(
    `Markdown Translator: 已清理私有缓存，并删除 ${summary.deleted} 个已记录译文文件${skippedMessage}。`,
  );
}
