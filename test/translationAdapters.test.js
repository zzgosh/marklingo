import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTranslationModelPrompt,
  coerceTranslationModelConcurrency,
  coerceTranslationModelMaxBlocksPerRequest,
  coerceTranslationModelMaxOutputTokens,
  coerceTranslationRequestMode,
  parseTranslatedBlockMap,
  resolveTranslationAdapterMode,
  resolveTranslationModelMaxOutputTokens,
} from '../out/translation/translationAdapters.js';

const blocks = [
  { id: 'b0', markdown: '# Title' },
  { id: 'b1', markdown: 'See __MDT_b1_URL_0__.' },
];

test('auto mode uses verified capability and otherwise falls back to chat JSON', () => {
  assert.equal(resolveTranslationAdapterMode('auto', 'translationModel'), 'translationModel');
  assert.equal(resolveTranslationAdapterMode('auto', 'chatJson'), 'chatJson');
  assert.equal(resolveTranslationAdapterMode('auto'), 'chatJson');
  assert.equal(resolveTranslationAdapterMode('chatJson', 'translationModel'), 'chatJson');
  assert.equal(resolveTranslationAdapterMode('translationModel', 'chatJson'), 'translationModel');
  assert.equal(coerceTranslationRequestMode('bad'), 'auto');
});

test('clamps translation-model tuning settings', () => {
  assert.equal(coerceTranslationModelMaxBlocksPerRequest(999), 24);
  assert.equal(coerceTranslationModelMaxBlocksPerRequest(0), 1);
  assert.equal(coerceTranslationModelConcurrency(999), 4);
  assert.equal(coerceTranslationModelConcurrency(0), 1);
  assert.equal(coerceTranslationModelMaxOutputTokens(999999), 32768);
  assert.equal(coerceTranslationModelMaxOutputTokens(-1), 0);
});

test('resolves translation-model max output tokens from context when set to auto', () => {
  assert.equal(resolveTranslationModelMaxOutputTokens({
    configuredMaxOutputTokens: 2048,
    modelContextLength: 8192,
    estimatedPromptTokens: 1000,
  }), 2048);
  assert.equal(resolveTranslationModelMaxOutputTokens({
    configuredMaxOutputTokens: 0,
    modelContextLength: 8192,
    estimatedPromptTokens: 1000,
  }), 6750);
  assert.equal(resolveTranslationModelMaxOutputTokens({
    configuredMaxOutputTokens: 0,
    estimatedPromptTokens: 1000,
  }), 4096);
});

test('builds translation-model prompts around same-shape JSON blocks', () => {
  const prompt = buildTranslationModelPrompt(blocks, {
    targetLanguage: '简体中文',
    systemPrompt: '',
  });

  assert.equal(prompt.messages.length, 1);
  assert.equal(prompt.messages[0].role, 'user');
  assert.match(prompt.messages[0].content, /same top-level "blocks" array shape/);
  assert.match(prompt.messages[0].content, /Do not output example ids/);
  assert.doesNotMatch(prompt.messages[0].content, /Additional custom instructions/);
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
