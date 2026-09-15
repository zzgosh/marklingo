import { l10n } from '../localization.js';
import { ModelOutputError } from '../modelOutputError.js';

function splitMarkdownLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

export function normalizeTranslatedBlockLines(value: unknown, blockId: string): string[] {
  if (typeof value === 'string') {
    return splitMarkdownLines(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.flatMap((item) => splitMarkdownLines(item));
  }

  throw new ModelOutputError(l10n('Invalid model output: block {0} must be a string or an array of strings.', blockId));
}
