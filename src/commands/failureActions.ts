import { hasModelOutputErrorCode } from '../modelOutputError.js';

export function isModelOutputError(error: unknown): boolean {
  if (hasModelOutputErrorCode(error)) return true;
  if (error instanceof SyntaxError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /JSON|Model output|unexpected response shape|empty content/i.test(message);
}

export function shouldOfferSettingsActionForFailures(messages: string[]): boolean {
  return messages.some((message) => (
    isModelOutputError(message) ||
    /api key|base url|endpoint|provider|model id|openrouter|connection|connectivity|timeout|http \d{3}|fetch|verification/i.test(message)
  ));
}
