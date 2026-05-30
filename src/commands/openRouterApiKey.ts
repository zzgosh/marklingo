import * as vscode from 'vscode';
import {
  deleteOpenRouterApiKey,
  hasOpenRouterApiKey,
  storeOpenRouterApiKey,
} from '../services/openRouterClient.js';

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
  await vscode.window.showInformationMessage('MarkLingo: Saved API key in SecretStorage.');
}

export async function resetOpenRouterApiKey(context: vscode.ExtensionContext) {
  const hasExisting = await hasOpenRouterApiKey(context);
  if (!hasExisting) {
    await vscode.window.showInformationMessage('MarkLingo: No OpenRouter API key is saved.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'MarkLingo: Delete the saved OpenRouter API key from SecretStorage?',
    { modal: true },
    'Reset',
  );
  if (confirm !== 'Reset') return;

  await deleteOpenRouterApiKey(context);
  await vscode.window.showInformationMessage('MarkLingo: Deleted the OpenRouter API key.');
}
