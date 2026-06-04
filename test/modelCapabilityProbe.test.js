import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getChatJsonProbeMessages,
  validateChatJsonProbeResponse,
} from '../out/services/modelCapabilityProbe.js';

test('chat JSON probe asks for an out-of-input capability marker', () => {
  const messages = getChatJsonProbeMessages();
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /"_capability"/);
  assert.match(messages[0].content, /"chat-json-ok"/);
  assert.doesNotMatch(messages[1].content, /_capability/);
});

test('chat JSON probe accepts structured instruction-following responses', () => {
  assert.doesNotThrow(() => validateChatJsonProbeResponse(JSON.stringify({
    _capability: 'chat-json-ok',
    b0: '你好 **世界**。',
    b1: '保持 __MDT_PROBE_0__ 不变。',
  })));
});

test('chat JSON probe rejects translation-only JSON responses', () => {
  assert.throws(
    () => validateChatJsonProbeResponse(JSON.stringify({
      b0: '你好 **世界**。',
      b1: '保持 __MDT_PROBE_0__ 不变。',
    })),
    /required top-level JSON shape/,
  );
});

test('chat JSON probe rejects responses that change Markdown or placeholders', () => {
  assert.throws(
    () => validateChatJsonProbeResponse(JSON.stringify({
      _capability: 'chat-json-ok',
      b0: '你好 世界。',
      b1: '保持 __BROKEN__ 不变。',
    })),
    /Markdown formatting/,
  );
});
