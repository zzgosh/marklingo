import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSLATION_PROGRESS_MESSAGES,
  getBatchTranslationProgressMessage,
  getTranslationRequestProgressMessage,
} from '../out/commands/progressMessages.js';

test('single-file progress messages stay high-level', () => {
  assert.deepEqual(TRANSLATION_PROGRESS_MESSAGES, {
    prompting: 'Prompting',
    cached: 'Using saved translations',
    writing: 'Writing files',
  });
});

test('request progress messages use request counts without implementation terms', () => {
  const message = getTranslationRequestProgressMessage(0, 3);

  assert.equal(message, 'Request 1 of 3');
  assert.ok(!/\bchunks?\b/i.test(message));
  assert.ok(!/\bblocks?\b/i.test(message));
});

test('batch progress messages omit file names and request details', () => {
  const message = getBatchTranslationProgressMessage(6, 7);

  assert.equal(message, 'File 7 of 7');
  assert.ok(!message.includes('work-readme.md'));
  assert.ok(!message.includes('Processing batch'));
  assert.ok(!/\bblocks?\b/i.test(message));
});
