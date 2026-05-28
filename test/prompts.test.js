import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from '../out/translation/prompts.js';

test('resolves the default system prompt with target language placeholder', () => {
  const prompt = resolveSystemPrompt('', 'English');

  assert.match(prompt, /翻译为English/);
  assert.equal(prompt.includes('{targetLanguage}'), false);
});

test('resolves a custom system prompt template', () => {
  const prompt = resolveSystemPrompt('Translate to {targetLanguage}. Keep Markdown.', '日本語');

  assert.equal(prompt, 'Translate to 日本語. Keep Markdown.');
});

test('keeps the default prompt visible for settings UI', () => {
  assert.match(DEFAULT_SYSTEM_PROMPT, /__MDT_xxx__/);
  assert.match(DEFAULT_SYSTEM_PROMPT, /合法的 JSON 对象/);
});
