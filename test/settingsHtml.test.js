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
    outputLocation: 'sourceFolder',
    storageRoot: '/tmp/marklingo/projects',
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
  assert.match(html, /Source folder \(\*_mdt\.md\)/);
  assert.match(html, /Private extension storage/);
  assert.match(html, /\.section-warning \{\s+margin-top: 8px;\s+color: var\(--danger\);/);
  assert.match(html, /script-src 'nonce-test-nonce'/);
  assert.match(html, /window\.acquireVsCodeApi/);
  assert.match(html, /API key saved · type to replace/);
  assert.ok(!html.includes('Default shortcut for Markdown editors.'));
  assert.ok(!html.includes('Official endpoint is used by default.'));
  assert.ok(!html.includes('Where translated Markdown files are written.'));
  assert.ok(!html.includes('Type CLEAR to confirm'));
  assert.ok(!html.includes('Can delete saved API key'));
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
