import * as vscode from 'vscode';
import {
  deleteOpenRouterApiKeyForCurrentEndpoint,
  getCurrentOpenRouterEndpoint,
  hasOpenRouterApiKeyForCurrentEndpoint,
  storeOpenRouterApiKeyForCurrentEndpoint,
} from '../services/openRouterClient.js';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const endpoint = await getCurrentOpenRouterEndpoint(context);
  const hasExisting = await hasOpenRouterApiKeyForCurrentEndpoint(context);

  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: OpenRouter API Key',
    prompt: hasExisting
      ? `An API key already exists for ${endpoint.origin}. Enter a new key to replace it.`
      : `Enter the API key for ${endpoint.origin}. It will be stored securely in VS Code SecretStorage.`,
    password: true,
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('MarkLingo: API key was empty, so the operation was canceled.');
    return;
  }

  const origin = await storeOpenRouterApiKeyForCurrentEndpoint(context, input.trim());
  await vscode.window.showInformationMessage(`MarkLingo: Saved API key for ${origin} in SecretStorage.`);
}

export async function resetOpenRouterApiKey(context: vscode.ExtensionContext) {
  const endpoint = await getCurrentOpenRouterEndpoint(context);
  const hasExisting = await hasOpenRouterApiKeyForCurrentEndpoint(context);
  if (!hasExisting) {
    await vscode.window.showInformationMessage(`MarkLingo: No OpenRouter API key is saved for ${endpoint.origin}.`);
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `MarkLingo: Delete the saved OpenRouter API key for ${endpoint.origin} from SecretStorage?`,
    { modal: true },
    'Reset',
  );
  if (confirm !== 'Reset') return;

  const origin = await deleteOpenRouterApiKeyForCurrentEndpoint(context);
  await vscode.window.showInformationMessage(`MarkLingo: Deleted the OpenRouter API key for ${origin}.`);
}
