import * as vscode from 'vscode';

export const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';

export function hasTargetLanguageSelected(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(TARGET_LANGUAGE_SELECTED_KEY) ?? false;
}

export async function markTargetLanguageSelected(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
}

export async function acceptVisibleOnboardingDefaults(context: vscode.ExtensionContext): Promise<void> {
  await markTargetLanguageSelected(context);
}

export async function clearOnboardingState(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, undefined);
}
