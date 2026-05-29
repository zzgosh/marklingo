import * as vscode from 'vscode';

const CUSTOM_TARGET_LANGUAGE_LABEL = 'Custom...';

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
    title: 'Markdown Translator: Custom Target Language',
    prompt: 'Enter the target language name, for example Italiano or Portuguese.',
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
  const currentLabel = current === CUSTOM_TARGET_LANGUAGE_LABEL && currentCustom ? `${current} (${currentCustom})` : current;

  const picked = await vscode.window.showQuickPick(TARGET_LANGUAGE_OPTIONS, {
    title: 'Markdown Translator: Set Target Language',
    placeHolder: `Current: ${currentLabel}`,
    ignoreFocusOut: true,
  });

  if (!picked) return;

  if (picked === CUSTOM_TARGET_LANGUAGE_LABEL) {
    const customValue = await promptCustomTargetLanguage(currentCustom);
    if (!customValue) {
      await vscode.window.showInformationMessage('Markdown Translator: Target language update canceled because a custom language is required.');
      return;
    }
    await cfg.update('translation.targetLanguage', CUSTOM_TARGET_LANGUAGE_LABEL, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.targetLanguageCustom', customValue, vscode.ConfigurationTarget.Global);
    await vscode.window.showInformationMessage(`Markdown Translator: Target language set to "${customValue}".`);
    return;
  }

  await cfg.update('translation.targetLanguage', picked, vscode.ConfigurationTarget.Global);
  await vscode.window.showInformationMessage(`Markdown Translator: Target language set to "${picked}".`);
}
