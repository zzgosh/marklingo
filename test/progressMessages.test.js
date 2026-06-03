import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSLATION_PROGRESS_MESSAGES,
  getBatchTranslationProgressMessage,
} from '../out/commands/progressMessages.js';

test('single-file progress messages stay high-level', () => {
  assert.deepEqual(TRANSLATION_PROGRESS_MESSAGES, {
    preparing: 'Preparing',
    cached: 'Using cached content',
    translating: 'Translating content',
    writing: 'Writing file',
  });
});

test('batch progress messages omit file names and request details', () => {
  const message = getBatchTranslationProgressMessage(6, 7);

  assert.equal(message, 'File 7 of 7');
  assert.ok(!message.includes('work-readme.md'));
  assert.ok(!message.includes('Processing batch'));
  assert.ok(!/\bblocks?\b/i.test(message));
});
