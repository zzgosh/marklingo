export type ProviderDisplayType = 'openrouter' | 'openaiCompatible';

export function getProviderDisplayName(providerType: ProviderDisplayType): string {
  return providerType === 'openaiCompatible' ? 'OpenAI Compatible' : 'OpenRouter';
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

export function getMissingProviderApiKeyMessage(providerType: ProviderDisplayType): string {
  return `No ${getProviderDisplayName(providerType)} API key saved. Add one in Settings, or run translation again.`;
}
