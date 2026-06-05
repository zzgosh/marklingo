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
  const endpointText = endpoint ? ` Endpoint: ${endpoint}.` : '';
  if (hasExisting) {
    return `Current Provider: ${providerName}.${endpointText} An API key is already saved for this provider. Enter a new key to replace it.`;
  }
  return `Current Provider: ${providerName}.${endpointText} Enter the API key for ${providerName}. It will be stored in VS Code SecretStorage.`;
}

export function getMissingProviderApiKeyMessage(providerType: ProviderDisplayType): string {
  return `Missing ${getProviderDisplayName(providerType)} API key. Save and verify it from MarkLingo settings or run translation again.`;
}
