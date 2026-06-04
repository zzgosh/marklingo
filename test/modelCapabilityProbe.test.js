import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getChatJsonProbeMessages,
  validateChatJsonProbeResponse,
} from '../out/services/modelCapabilityProbe.js';

test('chat JSON probe asks for an out-of-input capability marker', () => {
  const messages = getChatJsonProbeMessages();
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /precise Markdown translation assistant/);
  assert.match(messages[0].content, /"_capability"/);
  assert.match(messages[0].content, /"chat-json-ok"/);
  assert.match(messages[0].content, /Do not return a "blocks" array/);
  assert.match(messages[1].content, /Translate these Markdown blocks/);
  assert.match(messages[1].content, /"blocks"/);
  assert.doesNotMatch(messages[1].content, /_capability/);
});

test('chat JSON probe accepts structured instruction-following responses', () => {
  assert.doesNotThrow(() => validateChatJsonProbeResponse(JSON.stringify({
    _capability: 'chat-json-ok',
    b0: '你好 **世界**。',
    b1: '保持 __MDT_PROBE_0__ 在 [这个链接](https://example.com) 中不变。',
    b2: '- 从 `package.json` 安装。\n- 不要翻译 `marklingo.openrouter.modelId`。',
  })));
});

test('chat JSON probe rejects translation-only JSON responses', () => {
  assert.throws(
    () => validateChatJsonProbeResponse(JSON.stringify({
      b0: '你好 **世界**。',
      b1: '保持 __MDT_PROBE_0__ 在 [这个链接](https://example.com) 中不变。',
      b2: '- 从 `package.json` 安装。\n- 不要翻译 `marklingo.openrouter.modelId`。',
    })),
    /required top-level JSON shape/,
  );
});

test('chat JSON probe rejects translation-model blocks-array responses', () => {
  assert.throws(
    () => validateChatJsonProbeResponse(JSON.stringify({
      blocks: [
        { id: 'b0', markdown: '你好 **世界**。' },
        { id: 'b1', markdown: '保持 __MDT_PROBE_0__ 在 [这个链接](https://example.com) 中不变。' },
        { id: 'b2', markdown: '- 从 `package.json` 安装。\n- 不要翻译 `marklingo.openrouter.modelId`。' },
      ],
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
      b2: '- 从 package.json 安装。\n- 不要翻译 marklingo.openrouter.modelId。',
    })),
    /Markdown formatting/,
  );
});
