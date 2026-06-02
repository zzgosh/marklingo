import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettingsHtml } from '../out/webview/settingsHtml.js';

function getState(overrides = {}) {
  return {
    shortcutLabel: 'Option + Command + T',
    shortcutStatus: 'Default shortcut for Markdown editors.',
    shortcutWarning: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    hasApiKey: true,
    modelId: 'openrouter/example-model',
    targetLanguage: '简体中文',
    targetLanguageCustom: '',
    systemPrompt: 'You are a precise Markdown translation assistant.',
    customPrompt: '',
    storageRoot: '/tmp/marklingo/projects',
    storageStats: {
      totalBytes: 42 * 1024 * 1024,
      quotaBytes: 300 * 1024 * 1024,
      projectCount: 2,
      metaFileCount: 7,
      activeCacheCount: 6,
      evictedCacheCount: 1,
      cachePayloadBytes: 35 * 1024 * 1024,
    },
    ...overrides,
  };
}

test('renders settings HTML without importing the VS Code runtime', () => {
  const html = renderSettingsHtml({
    beforeMainScript: '<script nonce="test-nonce">window.acquireVsCodeApi = () => ({ postMessage() {} });</script>',
    cspSource: "'self'",
    extraHead: '<style nonce="test-nonce">:root { --vscode-editor-background: #fff; }</style>',
    nonce: 'test-nonce',
    state: getState(),
  });

  assert.match(html, /<title>MarkLingo Settings<\/title>/);
  assert.match(html, /<h2>Keyboard Shortcuts<\/h2>/);
  assert.match(html, /Translate Current Markdown/);
  assert.match(html, />Edit<\/button>/);
  assert.match(html, /System Instructions/);
  assert.match(html, /Copy system instructions/);
  assert.match(html, /You are a precise Markdown translation assistant\./);
  assert.match(html, /Translation Metadata Folder/);
  assert.match(html, /Stores translation metadata and cached translations\./);
  assert.match(html, /Metadata Storage/);
  assert.match(html, /42 MB of 300 MB used/);
  assert.match(html, /2 projects · 7 metadata files · 1 small tracking record/);
  assert.match(html, /class="storage-meter" data-state="normal"/);
  assert.match(html, /class="storage-meter-fill" style="width: 14%"/);
  assert.match(html, /Optimize removes the oldest cache\. Translated files stay\./);
  assert.match(html, /class="info-tip"/);
  assert.match(html, /When usage reaches 300 MB, MarkLingo automatically removes the oldest cached translations/);
  assert.match(html, />Optimize<\/button>/);
  assert.match(html, /\.section-warning \{\s+margin-top: 8px;\s+color: var\(--danger\);/);
  assert.match(html, /script-src 'nonce-test-nonce'/);
  assert.match(html, /window\.acquireVsCodeApi/);
  assert.match(html, /id="apiKey" type="password" autocomplete="off" value="•{32}" data-masked="true"/);
  assert.match(html, /showApiKeyMask\(\)/);
  assert.ok(!html.includes('API key saved · type to replace'));
  assert.ok(!html.includes('Enter API key'));
  assert.ok(!html.includes('masked-secret'));
  assert.ok(!html.includes('Default shortcut for Markdown editors.'));
  assert.ok(!html.includes('Official endpoint is used by default.'));
  assert.ok(!html.includes('Where translated Markdown files are written.'));
  assert.ok(!html.includes('e.g. Keep product names'));
  assert.ok(!html.includes('targetLanguage-hint'));
  assert.ok(!html.includes('outputLocation-hint'));
  assert.ok(!html.includes('Type CLEAR to confirm'));
  assert.ok(!html.includes('Can delete saved API key'));
});

test('renders empty API key input when no key is on file', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({ hasApiKey: false }),
  });

  assert.match(html, /<input id="apiKey" type="password" autocomplete="off">/);
  assert.ok(!html.includes('data-masked="true"'));
  assert.ok(!html.includes('API key saved · type to replace'));
  assert.ok(!html.includes('Enter API key'));
});

test('escapes settings state before rendering into HTML', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      baseUrl: '<img src=x onerror=alert(1)>',
      customPrompt: '<b>Keep names</b>',
      shortcutWarning: '<script>alert(1)</script>',
      targetLanguage: 'Custom...',
      targetLanguageCustom: 'Brazilian Portuguese',
    }),
  });

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;Keep names&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /value="Brazilian Portuguese"/);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
});
