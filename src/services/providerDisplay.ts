import { getProviderPreset, type ProviderType } from './providerPresets.js';

export type ProviderDisplayType = ProviderType;

export function getProviderDisplayName(providerType: ProviderDisplayType): string {
  return getProviderPreset(providerType).label;
}

export function getProviderApiKeyInputTitle(providerType: ProviderDisplayType): string {
  return `MarkLingo: ${getProviderDisplayName(providerType)} API Key`;
}

export function getProviderApiKeyInputPrompt(
  providerType: ProviderDisplayType,
  baseUrl: string,
  hasExisting = false,
): string {
  const providerName = getProviderDisplayName(providerType);
  const endpoint = baseUrl.trim();
  if (hasExisting) {
    return 'A key is already saved. Paste a new one to replace it.';
  }
  if (providerType === 'openrouter') {
    return 'Paste your OpenRouter API key. MarkLingo stores it securely in VS Code.';
  }
  return endpoint
    ? `Paste the API key for ${endpoint}. MarkLingo stores it securely in VS Code.`
    : `Paste the API key for ${providerName}. MarkLingo stores it securely in VS Code.`;
}
