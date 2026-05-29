import { normalizeTranslatedBlockLines } from './modelOutput.js';
import { restoreMarkdown, type ProtectResult } from './placeholders.js';

export type RestoredBlockResult =
  | { ok: true; text: string }
  | { ok: false; fallbackText: string; reason: string };

export function restoreTranslatedBlock(
  value: unknown,
  blockId: string,
  sourceText: string,
  protectedResult: ProtectResult,
): RestoredBlockResult {
  try {
    const lines = normalizeTranslatedBlockLines(value, blockId);
    return { ok: true, text: restoreMarkdown(lines.join('\n'), protectedResult.placeholders) };
  } catch (error) {
    return {
      ok: false,
      fallbackText: sourceText,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
