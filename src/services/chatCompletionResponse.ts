import { l10n } from '../localization.js';
import { ModelOutputError } from '../modelOutputError.js';

export function readChatCompletionContent(response: unknown): string {
  const data = response as { choices?: Array<{ message?: { content?: unknown } }> } | undefined;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new ModelOutputError(l10n('Provider returned empty content or an unexpected response shape.'));
  }
  return content;
}
