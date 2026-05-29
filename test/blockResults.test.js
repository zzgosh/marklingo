import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreTranslatedBlock } from '../out/translation/blockResults.js';

test('restores normalized translated block output', () => {
  const result = restoreTranslatedBlock(
    ['See __MDT_b1_URL_0__'],
    'b1',
    'See [docs](https://example.com)',
    {
      text: 'See __MDT_b1_URL_0__',
      placeholders: { __MDT_b1_URL_0__: 'https://example.com' },
    },
  );

  assert.deepEqual(result, { ok: true, text: 'See https://example.com' });
});

test('falls back to source when a placeholder is damaged', () => {
  const result = restoreTranslatedBlock(
    ['See MDT_b1_URL_0'],
    'b1',
    'See [docs](https://example.com)',
    {
      text: 'See __MDT_b1_URL_0__',
      placeholders: { __MDT_b1_URL_0__: 'https://example.com' },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.fallbackText, 'See [docs](https://example.com)');
  assert.match(result.reason, /placeholder/i);
});
