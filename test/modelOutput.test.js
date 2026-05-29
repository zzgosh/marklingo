import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranslatedBlockLines } from '../out/translation/modelOutput.js';

test('normalizes string block output into markdown lines', () => {
  const value = '- `markdownTranslator.openrouter.baseUrl`\n  - Default: `https://openrouter.ai/api/v1`';

  assert.deepEqual(normalizeTranslatedBlockLines(value, 'b20'), [
    '- `markdownTranslator.openrouter.baseUrl`',
    '  - Default: `https://openrouter.ai/api/v1`',
  ]);
});

test('normalizes string array items that contain newlines', () => {
  const value = ['line 1\nline 2', 'line 3'];

  assert.deepEqual(normalizeTranslatedBlockLines(value, 'b1'), ['line 1', 'line 2', 'line 3']);
});

test('rejects non-string block output', () => {
  assert.throws(() => normalizeTranslatedBlockLines({ text: 'line' }, 'b1'), /block b1/);
});
