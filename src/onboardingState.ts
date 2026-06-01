import * as vscode from 'vscode';

export const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';
export const OPENROUTER_MODEL_ACCEPTED_KEY = 'marklingo.openrouter.modelAccepted';

export function hasTargetLanguageSelected(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(TARGET_LANGUAGE_SELECTED_KEY) ?? false;
}

export async function markTargetLanguageSelected(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
}

export function hasOpenRouterModelAccepted(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(OPENROUTER_MODEL_ACCEPTED_KEY) ?? false;
}

export async function markOpenRouterModelAccepted(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(OPENROUTER_MODEL_ACCEPTED_KEY, true);
}

export async function acceptVisibleOnboardingDefaults(context: vscode.ExtensionContext): Promise<void> {
  await Promise.all([
    markTargetLanguageSelected(context),
    markOpenRouterModelAccepted(context),
  ]);
}

export async function clearOnboardingState(context: vscode.ExtensionContext): Promise<void> {
  await Promise.all([
    context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, undefined),
    context.globalState.update(OPENROUTER_MODEL_ACCEPTED_KEY, undefined),
  ]);
}
