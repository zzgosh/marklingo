import * as vscode from 'vscode';

export async function deleteAllTranslatedFiles() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    await vscode.window.showWarningMessage('Markdown Translator: 当前未打开工作区，无法执行清理。');
    return;
  }

  const [translatedFiles, metaFiles] = await Promise.all([
    vscode.workspace.findFiles('**/*_mdt.md', '**/node_modules/**'),
    vscode.workspace.findFiles('**/*_mdt.meta.json', '**/node_modules/**'),
  ]);

  const all = [...translatedFiles, ...metaFiles];
  const uniq = new Map<string, vscode.Uri>();
  for (const uri of all) uniq.set(uri.toString(), uri);
  const targets = [...uniq.values()];

  if (targets.length === 0) {
    await vscode.window.showInformationMessage('Markdown Translator: 未找到需要删除的译文文件（*_mdt.md / *_mdt.meta.json）。');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Markdown Translator: 将删除 ${targets.length} 个译文/缓存文件（优先移入回收站）。是否继续？`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Markdown Translator: 正在删除译文文件…',
      cancellable: false,
    },
    async (progress) => {
      let deleted = 0;
      const errors: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const uri = targets[i];
        progress.report({ message: `${i + 1}/${targets.length}` });
        try {
          await vscode.workspace.fs.delete(uri, { useTrash: true });
          deleted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${uri.fsPath}: ${msg}`);
        }
      }

      if (errors.length) {
        await vscode.window.showWarningMessage(`Markdown Translator: 已删除 ${deleted}/${targets.length} 个文件，${errors.length} 个失败。`);
        // 失败明细太长时不弹窗刷屏，放到输出面板更合适；这里先控制输出量
        console.warn('[markdown-translator] delete errors:', errors.slice(0, 20));
        return;
      }

      await vscode.window.showInformationMessage(`Markdown Translator: 已删除 ${deleted} 个译文/缓存文件。`);
    },
  );
}


