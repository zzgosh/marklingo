import test from 'node:test';
import assert from 'node:assert/strict';
import { isModelOutputError } from '../out/commands/failureActions.js';
import { initializeLocalization } from '../out/localization.js';
import { readChatCompletionContent } from '../out/services/chatCompletionResponse.js';

test('classifies localized empty chat content as a stable model-output error', () => {
  initializeLocalization(() => 'Provider 返回了空内容或非预期的响应结构。');
  try {
    assert.throws(
      () => readChatCompletionContent({ choices: [{ message: { content: '' } }] }),
      (error) => isModelOutputError(error) && error.message === 'Provider 返回了空内容或非预期的响应结构。',
    );
  } finally {
    initializeLocalization((message, ...args) => message.replace(/\{(\d+)\}/g, (placeholder, index) => (
      args[Number(index)] === undefined ? placeholder : String(args[Number(index)])
    )));
  }
});
