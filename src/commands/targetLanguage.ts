import * as vscode from 'vscode';

const TARGET_LANGUAGE_OPTIONS = [
  '简体中文',
  '繁体中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
  'Deutsch',
];

export async function setTargetLanguage(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  const current = (cfg.get<string>('translation.targetLanguage') ?? '').trim() || '简体中文';

  const picked = await vscode.window.showQuickPick(TARGET_LANGUAGE_OPTIONS, {
    title: 'Markdown Translator: 设置目标翻译语言',
    placeHolder: `当前：${current}`,
    ignoreFocusOut: true,
  });

  if (!picked) return;

  await cfg.update('translation.targetLanguage', picked, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(`Markdown Translator: 目标语言已设置为「${picked}」`);
}

