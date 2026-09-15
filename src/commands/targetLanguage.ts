import * as vscode from 'vscode';
import { markTargetLanguageSelected } from '../onboardingState.js';
import { l10n } from '../localization.js';

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
    title: l10n('MarkLingo: Custom Target Language'),
    prompt: l10n('Language name, e.g. Italiano or Portuguese.'),
    value: current,
    ignoreFocusOut: true,
  });
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function setTargetLanguage(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const current = (cfg.get<string>('translation.targetLanguage') ?? '').trim() || '简体中文';
  const currentCustom = (cfg.get<string>('translation.targetLanguageCustom') ?? '').trim();
  const currentLabel = current === CUSTOM_TARGET_LANGUAGE_LABEL && currentCustom
    ? `${l10n('Custom...')} (${currentCustom})`
    : current;

  const picked = await vscode.window.showQuickPick(TARGET_LANGUAGE_OPTIONS.map((value) => ({
    label: value === CUSTOM_TARGET_LANGUAGE_LABEL ? l10n('Custom...') : value,
    value,
  })), {
    title: l10n('MarkLingo: Set Target Language'),
    placeHolder: l10n('Current: {0}', currentLabel),
    ignoreFocusOut: true,
  });

  if (!picked) return;

  if (picked.value === CUSTOM_TARGET_LANGUAGE_LABEL) {
    const customValue = await promptCustomTargetLanguage(currentCustom);
    if (!customValue) {
      await vscode.window.showInformationMessage(l10n('MarkLingo: Target language update canceled because a custom language is required.'));
      return;
    }
    await cfg.update('translation.targetLanguage', CUSTOM_TARGET_LANGUAGE_LABEL, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.targetLanguageCustom', customValue, vscode.ConfigurationTarget.Global);
    await markTargetLanguageSelected(context);
    await vscode.window.showInformationMessage(l10n('MarkLingo: Target language set to "{0}".', customValue));
    return;
  }

  await cfg.update('translation.targetLanguage', picked.value, vscode.ConfigurationTarget.Global);
  await markTargetLanguageSelected(context);
  await vscode.window.showInformationMessage(l10n('MarkLingo: Target language set to "{0}".', picked.value));
}
