import { getProviderPreset, type ProviderType } from './providerPresets.js';
import { l10n } from '../localization.js';

export type ProviderDisplayType = ProviderType;

export function getProviderDisplayName(providerType: ProviderDisplayType): string {
  return getProviderPreset(providerType).label;
}

export function getProviderApiKeyInputTitle(providerType: ProviderDisplayType): string {
  return l10n('MarkLingo: {0} API Key', getProviderDisplayName(providerType));
}

export function getProviderApiKeyInputPrompt(
  providerType: ProviderDisplayType,
  baseUrl: string,
  hasExisting = false,
): string {
  const providerName = getProviderDisplayName(providerType);
  const endpoint = baseUrl.trim();
  if (hasExisting) {
    return l10n('A key is already saved. Paste a new one to replace it.');
  }
  if (providerType === 'openrouter') {
    return l10n('Paste your OpenRouter API key. MarkLingo stores it securely in VS Code SecretStorage.');
  }
  return endpoint
    ? l10n('Paste the API key for {0}. MarkLingo stores it securely in VS Code SecretStorage.', endpoint)
    : l10n('Paste the API key for {0}. MarkLingo stores it securely in VS Code SecretStorage.', providerName);
}
