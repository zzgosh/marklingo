import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTranslationModelPrompt,
  coerceTranslationRequestMode,
  parseTranslatedBlockMap,
  resolveTranslationAdapterMode,
} from '../out/translation/translationAdapters.js';

const blocks = [
  { id: 'b0', markdown: '# Title' },
  { id: 'b1', markdown: 'See __MDT_b1_URL_0__.' },
];

test('auto mode routes Hy-MT model IDs to translation-model mode', () => {
  assert.equal(resolveTranslationAdapterMode('auto', 'hy-mt2'), 'translationModel');
  assert.equal(resolveTranslationAdapterMode('auto', 'tencent/Hy-MT2-1.8B-GGUF:Q4_K_M'), 'translationModel');
  assert.equal(resolveTranslationAdapterMode('auto', 'google/gemini-3.1-flash-lite'), 'chatJson');
  assert.equal(resolveTranslationAdapterMode('chatJson', 'hy-mt2'), 'chatJson');
  assert.equal(coerceTranslationRequestMode('bad'), 'auto');
});

test('builds translation-model prompts around same-shape JSON blocks', () => {
  const prompt = buildTranslationModelPrompt(blocks, {
    targetLanguage: '简体中文',
    systemPrompt: '',
    customPrompt: 'Keep MarkLingo untranslated.',
  });

  assert.equal(prompt.messages.length, 1);
  assert.equal(prompt.messages[0].role, 'user');
  assert.match(prompt.messages[0].content, /same top-level "blocks" array shape/);
  assert.match(prompt.messages[0].content, /Do not output example ids/);
  assert.match(prompt.messages[0].content, /Keep MarkLingo untranslated/);
  assert.match(prompt.messages[0].content, /"blocks"/);
});

test('parses top-level block-id mapping responses', () => {
  const parsed = parseTranslatedBlockMap('{"b0":"# 标题","b1":"见 __MDT_b1_URL_0__。"}', blocks);

  assert.deepEqual(parsed, {
    b0: '# 标题',
    b1: '见 __MDT_b1_URL_0__。',
  });
});

test('parses same-shape blocks array responses with leading non-json text', () => {
  const parsed = parseTranslatedBlockMap(
    '---\n{"blocks":[{"id":"b0","markdown":"# 标题"},{"id":"b1","markdown":"见 __MDT_b1_URL_0__。"}]}',
    blocks,
  );

  assert.deepEqual(parsed, {
    b0: '# 标题',
    b1: '见 __MDT_b1_URL_0__。',
  });
});
