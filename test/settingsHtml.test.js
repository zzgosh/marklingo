import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettingsHtml } from '../out/webview/settingsHtml.js';

function getState(overrides = {}) {
  return {
    shortcutLabel: 'Option + Command + T',
    shortcutStatus: 'Default shortcut for Markdown editors.',
    shortcutWarning: '',
    providerType: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    openRouterModelId: 'google/gemini-3.1-flash-lite',
    openRouterHasApiKey: true,
    openAiCompatibleDefaultBaseUrl: 'http://127.0.0.1:8080/v1',
    openAiCompatibleBaseUrl: 'http://127.0.0.1:8080/v1',
    openAiCompatibleModelId: 'hy-mt2',
    openAiCompatibleHasApiKey: false,
    hasApiKey: true,
    modelId: 'openrouter/example-model',
    verifiedAdapterMode: 'chatJson',
    requestMode: 'chatJson',
    translationModelMaxBlocksPerRequest: 12,
    translationModelConcurrency: 1,
    translationModelMaxOutputTokens: 0,
    targetLanguage: '简体中文',
    targetLanguageCustom: '',
    systemPrompt: 'You are a precise Markdown translation assistant.',
    customPrompt: '',
    storageRoot: '/tmp/marklingo/projects',
    currentProjectPath: '/Users/example/project',
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
  assert.match(html, /<h2>Provider<\/h2>/);
  assert.match(html, /<option value="openrouter" selected>OpenRouter<\/option>/);
  assert.match(html, /<option value="openaiCompatible">OpenAI Compatible<\/option>/);
  assert.match(html, /id="baseUrlRow" hidden/);
  assert.match(html, /\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /id="verify-provider">Save and Verify<\/button>/);
  assert.match(html, /Verified: Chat JSON/);
  assert.ok(!html.includes('<div class="label">Translation Mode</div>'));
  assert.ok(!html.includes('Model Blocks'));
  assert.ok(!html.includes('Model Concurrency'));
  assert.ok(!html.includes('Max Output Tokens'));
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
  assert.match(html, /Clear Current Project Data/);
  assert.match(html, /\/Users\/example\/project/);
  assert.match(html, /id="clear-current-project-data">Clear current project data<\/button>/);
  assert.match(html, /Clear All Data/);
  assert.match(html, /Delete the saved API key, settings, metadata\/cache, and tracked translated files if selected\./);
  assert.match(html, /id="clear-all-data">Clear all data<\/button>/);
  assert.match(html, /\.danger-row \{\s+grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(html, /<div class="row top-align danger-row">/);
  assert.match(html, /\.section-warning \{\s+margin-top: 8px;\s+color: var\(--danger\);/);
  assert.match(html, /script-src 'nonce-test-nonce'/);
  assert.match(html, /window\.acquireVsCodeApi/);
  assert.match(html, /id="apiKey" type="password" autocomplete="off" value="•{32}" data-masked="true"/);
  assert.match(html, /modelId: "google\/gemini-3\.1-flash-lite"/);
  assert.match(html, /showApiKeyMask\(\)/);
  assert.match(html, /providerDrafts/);
  assert.match(html, /selectedProviderType/);
  assert.match(html, /verifyProvider/);
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
  assert.ok(!html.includes('id="clear-data"'));
});

test('renders disabled current project cleanup when no project is selected', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({ currentProjectPath: undefined }),
  });

  assert.match(html, /Open a file or single workspace folder to select a current project\./);
  assert.match(html, /id="clear-current-project-data" disabled>Clear current project data<\/button>/);
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

test('renders OpenAI-compatible provider with Base URL visible', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      providerType: 'openaiCompatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      modelId: 'hy-mt2',
      verifiedAdapterMode: 'translationModel',
    }),
  });

  assert.match(html, /<option value="openaiCompatible" selected>OpenAI Compatible<\/option>/);
  assert.match(html, /id="baseUrlRow">/);
  assert.match(html, /value="http:\/\/127\.0\.0\.1:8080\/v1"/);
  assert.match(html, /Verified: Translation Model/);
  assert.match(html, /<textarea id="customPrompt" disabled>/);
  assert.match(html, /Custom Instructions are disabled for verified Translation Model providers/);
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
