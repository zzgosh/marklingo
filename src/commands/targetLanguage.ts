import * as vscode from 'vscode';

const CUSTOM_TARGET_LANGUAGE_LABEL = '自定义...';

const TARGET_LANGUAGE_OPTIONS = [
  '简体中文',
  '繁体中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
  'Deutsch',
  CUSTOM_TARGET_LANGUAGE_LABEL,
];

async function promptCustomTargetLanguage(current: string): Promise<string | null> {
  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: 自定义目标翻译语言',
    prompt: '请输入目标语言名称（例如 Italiano、Português）',
    value: current,
    ignoreFocusOut: true,
  });
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function setTargetLanguage(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  const current = (cfg.get<string>('translation.targetLanguage') ?? '').trim() || '简体中文';
  const currentCustom = (cfg.get<string>('translation.targetLanguageCustom') ?? '').trim();
  const currentLabel = current === CUSTOM_TARGET_LANGUAGE_LABEL && currentCustom ? `${current}（${currentCustom}）` : current;

  const picked = await vscode.window.showQuickPick(TARGET_LANGUAGE_OPTIONS, {
    title: 'Markdown Translator: 设置目标翻译语言',
    placeHolder: `当前：${currentLabel}`,
    ignoreFocusOut: true,
  });

  if (!picked) return;

  if (picked === CUSTOM_TARGET_LANGUAGE_LABEL) {
    const customValue = await promptCustomTargetLanguage(currentCustom);
    if (!customValue) {
      await vscode.window.showInformationMessage('Markdown Translator: 已取消设置（需要填写自定义目标语言）。');
      return;
    }
    await cfg.update('translation.targetLanguage', CUSTOM_TARGET_LANGUAGE_LABEL, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.targetLanguageCustom', customValue, vscode.ConfigurationTarget.Global);
    await vscode.window.showInformationMessage(`Markdown Translator: 目标语言已设置为「${customValue}」`);
    return;
  }

  await cfg.update('translation.targetLanguage', picked, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(`Markdown Translator: 目标语言已设置为「${picked}」`);
}
