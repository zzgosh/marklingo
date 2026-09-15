import * as vscode from 'vscode';
import {
  hasExplicitOpenRouterProviderConfiguration,
  hasOpenRouterApiKey,
  providerRequiresApiKey,
  resolveConfiguredProvider,
  storeOpenRouterApiKey,
} from '../services/openRouterClient.js';
import { getProviderApiKeyInputPrompt, getProviderApiKeyInputTitle, getProviderDisplayName } from '../services/providerDisplay.js';
import { acceptVisibleOnboardingDefaults } from '../onboardingState.js';
import { l10n } from '../localization.js';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const provider = resolveConfiguredProvider();
  if (!providerRequiresApiKey(provider.providerType)) {
    await vscode.window.showInformationMessage(l10n(
      'MarkLingo: {0} does not require an API key.',
      getProviderDisplayName(provider.providerType),
    ));
    return;
  }

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
    await vscode.window.showWarningMessage(l10n('MarkLingo: API key was empty, so the operation was canceled.'));
    return;
  }

  await storeOpenRouterApiKey(context, input.trim(), provider.baseUrl);
  await acceptVisibleOnboardingDefaults(context);
  await vscode.window.showInformationMessage(l10n(
    'MarkLingo: {0} API key saved.',
    getProviderDisplayName(provider.providerType),
  ));
}
