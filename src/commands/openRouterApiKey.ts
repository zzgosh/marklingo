import * as vscode from 'vscode';
import {
  hasOpenRouterApiKey,
  storeOpenRouterApiKey,
} from '../services/openRouterClient.js';
import { acceptVisibleOnboardingDefaults } from '../onboardingState.js';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const hasExisting = await hasOpenRouterApiKey(context);

  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: OpenRouter API Key',
    prompt: hasExisting
      ? 'An API key is already saved. Enter a new key to replace it.'
      : 'Enter your OpenRouter API key. It will be stored securely in VS Code SecretStorage.',
    password: true,
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('MarkLingo: API key was empty, so the operation was canceled.');
    return;
  }

  await storeOpenRouterApiKey(context, input.trim());
  await acceptVisibleOnboardingDefaults(context);
  await vscode.window.showInformationMessage('MarkLingo: Saved API key in SecretStorage.');
}
