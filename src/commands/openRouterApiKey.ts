import * as vscode from 'vscode';
import {
  hasExplicitOpenRouterProviderConfiguration,
  hasOpenRouterApiKey,
  resolveConfiguredProvider,
  storeOpenRouterApiKey,
} from '../services/openRouterClient.js';
import { getProviderApiKeyInputPrompt, getProviderApiKeyInputTitle, getProviderDisplayName } from '../services/providerDisplay.js';
import { acceptVisibleOnboardingDefaults } from '../onboardingState.js';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const provider = resolveConfiguredProvider();
  const hasExisting = await hasOpenRouterApiKey(context, provider.baseUrl, {
    includeLegacy: !hasExplicitOpenRouterProviderConfiguration(),
  });

  const input = await vscode.window.showInputBox({
    title: getProviderApiKeyInputTitle(provider.providerType),
    prompt: getProviderApiKeyInputPrompt(provider.providerType, provider.baseUrl, hasExisting),
    password: true,
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('MarkLingo: API key was empty, so the operation was canceled.');
    return;
  }

  await storeOpenRouterApiKey(context, input.trim(), provider.baseUrl);
  await acceptVisibleOnboardingDefaults(context);
  await vscode.window.showInformationMessage(`MarkLingo: Saved ${getProviderDisplayName(provider.providerType)} API key in SecretStorage.`);
}
