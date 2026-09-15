import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSettingsHtml } from '../out/webview/settingsHtml.js';
import { initializeLocalization } from '../out/localization.js';

function getState(overrides = {}) {
  return {
    shortcuts: [
      {
        id: 'translateCurrentMarkdown',
        title: 'Translate Current Markdown',
        shortcutLabel: 'Option + Command + T',
        shortcutStatus: 'Default shortcut for Markdown editors.',
        shortcutWarning: '',
      },
      {
        id: 'deleteCurrentProjectTranslatedFiles',
        title: 'Delete Current Project Translated Files',
        shortcutLabel: 'Option + Command + D',
        shortcutStatus: 'Default shortcut for current project cleanup.',
        shortcutWarning: 'If MarkLingo cannot use this shortcut, macOS may already use it for Dock. Change it in System Settings > Keyboard > Keyboard Shortcuts... > Dock > Turn Dock hiding on/off.',
      },
    ],
    providerType: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    openRouterModelId: 'google/gemini-3.1-flash-lite',
    openRouterHasApiKey: true,
    openRouterVerifiedAdapterMode: 'chatJson',
    openRouterPromptInstructions: 'You are a precise Markdown translation assistant.',
    openRouterPromptInstructionsEnhanced: false,
    openRouterPromptInstructionsEnhancementNote: undefined,
    openAiCompatibleBaseUrl: '',
    openAiCompatibleModelId: '',
    openAiCompatibleHasApiKey: false,
    openAiCompatibleVerifiedAdapterMode: undefined,
    openAiCompatiblePromptInstructions: 'You are a precise Markdown translation assistant.',
    openAiCompatiblePromptInstructionsEnhanced: false,
    openAiCompatiblePromptInstructionsEnhancementNote: undefined,
    hasApiKey: true,
    modelId: 'openrouter/example-model',
    verifiedAdapterMode: 'chatJson',
    requestMode: 'chatJson',
    translationModelMaxBlocksPerRequest: 12,
    translationModelConcurrency: 1,
    translationModelMaxOutputTokens: 0,
    targetLanguage: '简体中文',
    targetLanguageCustom: '',
    promptInstructions: 'You are a precise Markdown translation assistant.',
    promptInstructionsEnhanced: false,
    promptInstructionsEnhancementNote: undefined,
    chatPromptInstructions: 'You are a precise Markdown translation assistant.',
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
    usage: {
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      filesTranslated: 0,
      projectsTouched: 0,
      translatedBlocks: 0,
      reusedBlocks: 0,
      fallbackBlocks: 0,
      reusePercent: undefined,
      tokenTotal: 0,
      estimatedInputTokens: 0,
      hasReportedTokens: false,
      reportedInputTokens: 0,
      reportedOutputTokens: 0,
      reportedTotalTokens: 0,
      cachedProviderTokens: 0,
      hasEstimatedCost: false,
      estimatedCost: 0,
      costCurrency: undefined,
      providers: [],
      models: [],
      targetLanguages: [],
      recentRuns: [],
      query: { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' },
      buckets: [],
      dimensionKeys: [],
      tops: [],
      topModelsByTokens: [],
      topModelsByCost: [],
      reuse: { translated: 0, reused: 0, fallback: 0 },
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
  assert.match(html, /Delete Current Project Translated Files/);
  assert.match(html, />Edit<\/button>/);
  assert.match(html, /class="info-tip shortcut-info"/);
  assert.match(html, /data-shortcut-info="deleteCurrentProjectTranslatedFiles"[\s\S]*If MarkLingo cannot use this shortcut, macOS may already use it for Dock\. Change it in System Settings &gt; Keyboard &gt; Keyboard Shortcuts\.\.\. &gt; Dock &gt; Turn Dock hiding on\/off\./);
  assert.match(html, /data-shortcut-warning="deleteCurrentProjectTranslatedFiles"><\/div>/);
  assert.match(html, /type: 'openKeyboardShortcuts', shortcutId:/);
  assert.match(html, /System Instructions/);
  assert.match(html, /<h2>Provider<\/h2>/);
  assert.match(html, /<section class="card provider-card">/);
  assert.match(html, /Markdown content is sent to the configured OpenAI-compatible endpoint for translation\./);
  assert.ok(html.indexOf('<h2>Usage</h2>') < html.indexOf('<h2>Output</h2>'));
  assert.match(html, /<option value="openrouter" selected>OpenRouter<\/option>/);
  assert.match(html, /<option value="moonshot">Moonshot<\/option>/);
  assert.match(html, /<option value="glm">GLM<\/option>/);
  assert.match(html, /<option value="xiaomiMimo">Xiaomi MiMo<\/option>/);
  assert.match(html, /<option value="openaiCompatible">Custom OpenAI Compatible<\/option>/);
  assert.ok(!html.includes('value="ollama"'));
  assert.ok(!html.includes('value="lmStudio"'));
  assert.ok(!html.includes('id="baseUrlPresetRow"'));
  assert.match(html, /id="baseUrlRow" hidden/);
  assert.ok(!html.includes('id="modelPresetRow"'));
  assert.match(html, /<div class="label">Model ID<\/div>/);
  assert.match(html, /<input id="modelId" hidden value="google\/gemini-3\.1-flash-lite"/);
  assert.match(html, /id="modelIdSelectWrap">/);
  assert.match(html, /<option value="google\/gemini-3\.1-flash-lite" selected>google\/gemini-3\.1-flash-lite<\/option>/);
  assert.match(html, /<option value="deepseek\/deepseek-v4-flash">deepseek\/deepseek-v4-flash<\/option>/);
  assert.match(html, /<option value="xiaomi\/mimo-v2\.5">xiaomi\/mimo-v2\.5<\/option>/);
  assert.ok(!html.includes('xiaomi/mimo-v2-flash'));
  assert.match(html, /<option value="">Custom\.\.\.<\/option>/);
  assert.match(html, /id="model-tags"><span class="model-tag model-tag-quality">Quality<\/span><span class="model-tag model-tag-fast"><svg class="model-tag-icon"[\s\S]*?<\/svg>Fast<\/span><\/div>/);
  assert.match(html, /\.model-tag-icon \{\s+width: 11px;/);
  assert.match(html, /const MODEL_TAG_ICONS = \{/);
  assert.match(html, /\.model-tags \{\s+display: flex;/);
  assert.match(html, /\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /\.provider-card \.row \{\s+border-bottom: 0;/);
  assert.match(html, /\.provider-actions \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(html, /\.provider-feedback \{\s+display: flex;/);
  assert.match(html, /select \{\s+appearance: none;\s+color: var\(--fg\);/);
  assert.match(html, /select option \{\s+background: var\(--input\);\s+color: var\(--fg\);/);
  assert.match(html, /id="verify-provider">Save and Verify<\/button>/);
  assert.ok(!html.includes('Verified: Chat JSON'));
  assert.ok(!html.includes('<div class="label">Translation Mode</div>'));
  assert.ok(!html.includes('Model Blocks'));
  assert.ok(!html.includes('Model Concurrency'));
  assert.ok(!html.includes('Max Output Tokens'));
  assert.match(html, /Copy system instructions/);
  assert.match(html, /You are a precise Markdown translation assistant\./);
  assert.match(html, /CHAT_PROMPT_INSTRUCTIONS/);
  assert.match(html, /Translation Metadata Folder/);
  assert.match(html, /Stores translation metadata and cached translations under VS Code globalStorageUri\./);
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
  assert.match(html, /Delete the API key from SecretStorage, settings, metadata\/cache under globalStorageUri, and tracked translated files if selected\./);
  assert.match(html, /id="clear-all-data">Clear all data<\/button>/);
  assert.match(html, /\.danger-row \{\s+grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(html, /<div class="row top-align danger-row">/);
  assert.match(html, /\.section-warning \{\s+margin-top: 8px;\s+color: var\(--danger\);/);
  assert.match(html, /script-src 'nonce-test-nonce'/);
  assert.match(html, /window\.acquireVsCodeApi/);
  assert.match(html, /id="apiKey" type="password" autocomplete="off" value="•{32}" data-masked="true"/);
  assert.match(html, /"modelId":"google\/gemini-3\.1-flash-lite"/);
  assert.match(html, /"openaiCompatible":\{"baseUrl":"","modelId":"","hasApiKey":false,"apiKeyInput":""\}/);
  assert.match(html, /showApiKeyMask\(\)/);
  assert.match(html, /providerDrafts/);
  assert.match(html, /selectedProviderType/);
  assert.match(html, /providerModelIdEditable/);
  assert.match(html, /renderSelectedModelTags/);
  assert.match(html, /function parseIpv4Literal\(hostname\)/);
  assert.doesNotMatch(html, /host\.startsWith\('10\.'\)/);
  assert.match(html, /showProviderSuccessFeedback/);
  assert.ok(!html.includes('Provider verified.'));
  assert.match(html, /Verified - using smaller batches for reliability\./);
  assert.match(html, /Some models need smaller Markdown batches to keep output reliable/);
  assert.match(html, /id="provider-mode-tip"/);
  assert.ok(!html.includes('This model could not reliably follow structured JSON instructions.'));
  assert.match(html, /apiKeyInput\.addEventListener\('input', handleProviderInput\);/);
  assert.match(html, /modelIdSelect\.addEventListener\('change', handleModelIdSelectChange\);/);
  assert.match(html, /modelCustomMode = true;\s+modelIdInput\.value = '';/);
  assert.match(html, /if \(modelCustomMode && modelIdInput && !modelIdInput\.hidden\) modelIdInput\.focus\(\);/);
  assert.match(html, /setProviderStatus\(msg\.message \|\| UI\.verificationFailed, true\);/);
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

test('renders shortcut fallbacks when state omits shortcut details', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({ shortcuts: undefined }),
  });

  assert.match(html, /Translate Current Markdown/);
  assert.match(html, /Delete Current Project Translated Files/);
  assert.match(html, /Not assigned/);
  assert.match(html, /No active shortcut\. Edit keyboard shortcuts to assign one\./);
});

test('keeps the saved OpenAI-compatible provider draft when OpenRouter is active', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      providerType: 'openrouter',
      openAiCompatibleBaseUrl: 'http://127.0.0.1:8080/v1',
      openAiCompatibleModelId: 'hy-mt2',
      openAiCompatibleHasApiKey: true,
      openAiCompatibleVerifiedAdapterMode: 'translationModel',
      openAiCompatiblePromptInstructions: '### Task\nTranslate the user-facing text in each `markdown` field.',
      openAiCompatiblePromptInstructionsEnhanced: true,
      openAiCompatiblePromptInstructionsEnhancementNote: 'MarkLingo uses a model-specific optimized prompt for Hy-MT2 translation models.',
    }),
  });

  assert.match(html, /"openaiCompatible":\{"baseUrl":"http:\/\/127\.0\.0\.1:8080\/v1","modelId":"hy-mt2","hasApiKey":true,"verifiedAdapterMode":"translationModel"/);
  assert.match(html, /"openaiCompatible":\{"baseUrl":"http:\/\/127\.0\.0\.1:8080\/v1","modelId":"hy-mt2","hasApiKey":true,"apiKeyInput":""\}/);
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
    state: getState({ hasApiKey: false, openRouterHasApiKey: false }),
  });

  assert.match(html, /<input id="apiKey" type="password" autocomplete="off">/);
  assert.ok(!html.includes('data-masked="true"'));
  assert.ok(!html.includes('API key saved · type to replace'));
  assert.ok(!html.includes('Enter API key'));
});

test('does not present cached model capability as verified when the API key is missing', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      hasApiKey: false,
      openRouterHasApiKey: false,
      verifiedAdapterMode: 'chatJson',
    }),
  });

  assert.match(html, /<input id="apiKey" type="password" autocomplete="off">/);
  assert.match(html, /"hasApiKey":false,"verifiedAdapterMode":""/);
  assert.match(html, /id="verify-provider">Save and Verify<\/button>/);
  assert.ok(!html.includes('data-masked="true"'));
});

test('renders OpenAI-compatible provider with Base URL visible', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      providerType: 'openaiCompatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      openAiCompatibleBaseUrl: 'http://127.0.0.1:8080/v1',
      modelId: 'hy-mt2-1.8b',
      openAiCompatibleModelId: 'hy-mt2-1.8b',
      openAiCompatibleHasApiKey: true,
      openAiCompatibleVerifiedAdapterMode: 'translationModel',
      openAiCompatiblePromptInstructions: '### Task\nTranslate the user-facing text in each `blocks[i].markdown` value.',
      openAiCompatiblePromptInstructionsEnhanced: true,
      openAiCompatiblePromptInstructionsEnhancementNote: 'MarkLingo uses a model-specific optimized prompt for Hy-MT2 translation models.',
      verifiedAdapterMode: 'translationModel',
      promptInstructions: '### Task\nTranslate the user-facing text in each `blocks[i].markdown` value.',
      promptInstructionsEnhanced: true,
      promptInstructionsEnhancementNote: 'MarkLingo uses a model-specific optimized prompt for Hy-MT2 translation models.',
      chatPromptInstructions: 'You are a precise Markdown translation assistant.',
    }),
  });

  assert.match(html, /<option value="openaiCompatible" selected>Custom OpenAI Compatible<\/option>/);
  assert.match(html, /id="baseUrlRow">/);
  assert.match(html, /value="http:\/\/127\.0\.0\.1:8080\/v1"/);
  assert.match(html, /<div class="model-tags" id="model-tags"><span class="model-tag model-tag-local">Local<\/span><span class="model-tag model-tag-slow">Slow<\/span><\/div>/);
  assert.ok(!html.includes('Verified: Translation Model'));
  assert.match(html, /id="customPromptRow" hidden/);
  assert.doesNotMatch(html, /Custom Instructions are disabled for verified Translation Model providers/);
  assert.match(html, /prompt-enhanced-badge/);
  assert.match(html, /model-specific optimized prompt for Hy-MT2/);
  assert.match(html, /### Task/);
  assert.match(html, /const CHAT_PROMPT_INSTRUCTIONS = "You are a precise Markdown translation assistant\."/);
});

test('renders fixed provider models as Model ID choices without Base URL controls', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      providerType: 'moonshot',
      baseUrl: 'https://api.moonshot.ai/v1',
      modelId: 'kimi-k2.6',
    }),
  });

  assert.match(html, /<option value="moonshot" selected>Moonshot<\/option>/);
  assert.match(html, /id="baseUrlRow" hidden/);
  assert.ok(!html.includes('id="baseUrlPresetRow"'));
  assert.match(html, /<input id="modelId" hidden value="kimi-k2\.6"/);
  assert.match(html, /id="modelIdSelectWrap">/);
  assert.match(html, /<option value="kimi-k2\.6" selected>kimi-k2\.6<\/option>/);
  assert.match(html, /<div class="model-tags" id="model-tags"><span class="model-tag model-tag-quality">Quality<\/span><\/div>/);
});

test('escapes settings state before rendering into HTML', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      providerType: 'openaiCompatible',
      baseUrl: '<img src=x onerror=alert(1)>',
      openAiCompatibleBaseUrl: '<img src=x onerror=alert(1)>',
      customPrompt: '<b>Keep names</b>',
      shortcuts: [
        {
          id: 'translateCurrentMarkdown',
          title: 'Translate Current Markdown',
          shortcutLabel: 'Option + Command + T',
          shortcutStatus: 'Default shortcut for Markdown editors.',
          shortcutWarning: '<script>alert(1)</script>',
        },
      ],
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

test('stacks derived controls under the dropdown with the label aligned to the first control', () => {
  const html = renderSettingsHtml({ cspSource: "'self'", nonce: 'test-nonce', state: getState() });

  assert.match(html, /\.row\.stacked-row \{\s+align-items: start;/);
  assert.match(html, /\.row\.stacked-row > div:first-child \{\s+min-height: 34px;\s+display: flex;\s+align-items: center;/);
  assert.match(html, /<div class="row stacked-row">\s*<div>\s*<div class="label">Model ID<\/div>/);
  assert.match(html, /<div class="control-full field-stack">/);
  assert.ok(!html.includes('class="control-full model-control"'));
});

test('renders the Target Language custom input inline without a separate row or save button', () => {
  const hiddenHtml = renderSettingsHtml({ cspSource: "'self'", nonce: 'test-nonce', state: getState() });
  assert.match(hiddenHtml, /<div class="row stacked-row">\s*<div>\s*<div class="label">Target Language<\/div>/);
  assert.match(hiddenHtml, /<input id="targetLanguageCustom" hidden value="" placeholder="Enter target language">/);
  assert.ok(!hiddenHtml.includes('id="customLanguageRow"'));
  assert.ok(!hiddenHtml.includes('>Custom Language<'));
  assert.ok(!hiddenHtml.includes('data-key="translation.targetLanguageCustom"'));
  assert.match(hiddenHtml, /customLanguageInput\.hidden = !isCustom;/);

  const customHtml = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({ targetLanguage: 'Custom...', targetLanguageCustom: 'Brazilian Portuguese' }),
  });
  assert.match(customHtml, /<input id="targetLanguageCustom" value="Brazilian Portuguese" placeholder="Enter target language">/);
});

test('renders an empty Usage section when there is no usage history', () => {
  const html = renderSettingsHtml({ cspSource: "'self'", nonce: 'test-nonce', state: getState() });

  assert.match(html, /<h2>Usage<\/h2>/);
  assert.match(html, /No translations in this range yet/);
  assert.ok(!html.includes('class="usage-table"'));
  // The persistent control shell renders even with no history.
  assert.match(html, /data-usage-control="range"/);
  assert.match(html, /class="select-wrap usage-range-wrap"><select class="usage-range-select" data-usage-control="range" aria-label="Usage range"/);
  assert.match(html, /data-usage-control="breakdown"/);
  assert.ok(!html.includes('data-usage-control="scope"'));
  assert.ok(!html.includes('data-usage-control="groupBy"'));
  assert.ok(!html.includes('data-value="targetLanguage"'));
});

test('renders a Usage skeleton when usage is deferred', () => {
  const html = renderSettingsHtml({ cspSource: "'self'", nonce: 'test-nonce', state: getState({ usage: undefined }) });

  assert.match(html, /<h2>Usage<\/h2>/);
  assert.match(html, /id="usage-body" aria-busy="true" data-loading="true"/);
  assert.match(html, /class="usage-skeleton"/);
  assert.match(html, /@keyframes usage-skeleton-shimmer/);
  assert.match(html, /requestUsage\(\);/);
  assert.match(html, /let usageRequestSerial = 0;/);
  assert.match(html, /let latestUsageRequestId = 0;/);
  assert.match(html, /const requestId = \+\+usageRequestSerial;/);
  assert.match(html, /type: 'usageQuery',\s*requestId,/);
  assert.match(html, /msg\.requestId !== latestUsageRequestId/);
  assert.match(html, /"range":"7d"/);
  assert.match(html, /"breakdown":"model"/);
  assert.ok(!html.includes('No translations in this range yet'));
  assert.ok(!html.includes('class="usage-table"'));
});

test('renders Usage summary cards and recent runs when usage exists', () => {
  const html = renderSettingsHtml({
    cspSource: "'self'",
    nonce: 'test-nonce',
    state: getState({
      usage: {
        totalRuns: 5,
        successRuns: 4,
        failedRuns: 1,
        filesTranslated: 3,
        projectsTouched: 2,
        translatedBlocks: 20,
        reusedBlocks: 60,
        fallbackBlocks: 0,
        reusePercent: 75,
        tokenTotal: 9000,
        estimatedInputTokens: 12000,
        hasReportedTokens: true,
        reportedInputTokens: 10000,
        reportedOutputTokens: 2400,
        reportedTotalTokens: 12400,
        cachedProviderTokens: 300,
        hasEstimatedCost: true,
        estimatedCost: 0.0048,
        costCurrency: 'USD',
        providers: [{ key: 'openrouter', runs: 5, files: 3 }],
        models: [{ key: 'm1', runs: 5, files: 3 }],
        targetLanguages: [{ key: '简体中文', runs: 5, files: 3 }],
        recentRuns: [
          {
            eventId: 'e1',
            startedAt: '2026-06-08T10:00:00.000Z',
            finishedAt: '2026-06-08T10:00:11.000Z',
            status: 'success',
            projectName: 'marklingo',
            sourceFileName: 'README.md',
            targetLanguage: '简体中文',
            providerType: 'openrouter',
            modelId: 'google/gemini-3.1-flash-lite',
            translatedBlocks: 12,
            reusedBlocks: 36,
            fallbackBlocks: 0,
            durationMs: 11000,
            tokensInput: 7200,
            tokensOutput: 1800,
            tokensTotal: 9000,
            cachedProviderTokens: 300,
            tokensSource: 'reported',
            costAmount: 0.003,
            costCurrency: 'USD',
            costSource: 'reported',
          },
          {
            eventId: 'e3',
            startedAt: '2026-06-08T09:30:00.000Z',
            finishedAt: '2026-06-08T09:30:03.000Z',
            status: 'success',
            projectName: 'api-docs',
            sourceFileName: 'draft.md',
            targetLanguage: 'German',
            providerType: 'openaiCompatible',
            modelId: 'openai-compatible/model',
            durationMs: 3000,
            tokensInput: 1500,
            tokensSource: 'estimated',
            costAmount: 0.0012,
            costCurrency: 'USD',
            costSource: 'estimated',
          },
          {
            eventId: 'e2',
            startedAt: '2026-06-08T09:00:00.000Z',
            finishedAt: '2026-06-08T09:00:02.000Z',
            status: 'error',
            projectName: 'docs-site',
            sourceFileName: 'very-long-reference-guide-file-name.md',
            targetLanguage: 'English',
            providerType: 'openaiCompatible',
            modelId: 'very-long/custom-model-name-for-table.md',
            durationMs: 2000,
            tokensSource: 'unavailable',
          },
        ],
        query: { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' },
        dimensionKeys: ['google/gemini-3.1-flash-lite'],
        buckets: [
          { key: '2026-06-08', label: 'Jun 8', totalRuns: 5, totalTokens: 9000, segments: [{ key: 'google/gemini-3.1-flash-lite', runs: 5, tokens: 9000 }] },
        ],
        tops: [{ key: 'google/gemini-3.1-flash-lite', runs: 5, files: 3 }],
        topModelsByTokens: [{ key: 'google/gemini-3.1-flash-lite', value: 9000, runs: 1 }],
        topModelsByCost: [{ key: 'google/gemini-3.1-flash-lite', value: 0.003, runs: 1, source: 'reported' }],
        reuse: { translated: 20, reused: 60, fallback: 0 },
      },
    }),
  });

  assert.match(html, /<h2>Usage<\/h2>/);
  assert.match(html, /Translated files/);
  assert.match(html, /Translation tasks/);
  assert.match(html, /Tokens/);
  assert.match(html, /\$0\.0048/);
  assert.match(html, /Estimated cost/);
  assert.match(html, /class="usage-table"/);
  assert.match(html, /README\.md/);
  assert.match(html, /usage-status-dot" data-status="success" title="Success"/);
  assert.match(html, /usage-status-dot" data-status="error" title="Failed"/);
  assert.match(html, />ZH-CN<\/td>/);
  assert.match(html, />EN<\/td>/);
  assert.match(html, /<div class="usage-value">9\.0K<\/div><div class="usage-caption">Tokens<\/div>/);
  assert.match(html, /title="9,000 tokens">9\.0K/);
  assert.match(html, /title="Reported cost: \$0\.0030">\$0\.0030/);
  assert.match(html, /title="Calculated from preset pricing: \$0\.0012">\$0\.0012/);
  assert.match(html, /title="Cost unavailable">—/);
  assert.match(html, /data-usage-control="range"/);
  assert.match(html, /class="select-wrap usage-range-wrap"><select class="usage-range-select" data-usage-control="range" aria-label="Usage range"/);
  assert.ok(!html.includes('class="usage-control-label">Range</span>'));
  assert.match(html, /<option value="7d" selected>Past 1 week<\/option>/);
  assert.match(html, /class="usage-seg-btn active" data-usage-control="breakdown" data-value="model"/);
  assert.ok(!html.includes('data-value="project"'));
  assert.match(html, /class="usage-bars"/);
  assert.match(html, /<rect class="usage-seg-c0"/);
  assert.match(html, /Tokens by model/);
  assert.match(html, /Models ranked by token usage/);
  assert.match(html, /data-ranking-mode="cost"/);
  assert.match(html, /Models ranked by cost/);
  assert.ok(!html.includes('Spend ranking'));
  assert.match(html, /class="usage-top-row"/);
  assert.match(html, /class="usage-top-fill usage-seg-c0"/);
  assert.match(html, /\.usage-charts \{\s*display: grid;\s*grid-template-columns: 1fr;/);
  assert.match(html, /\.usage-top-row \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) minmax\(112px, 36%\) 11ch;/);
  assert.match(html, /\.usage-top-value \{\s*color: var\(--muted\);\s*text-align: right;\s*font-variant-numeric: tabular-nums;\s*overflow: hidden;\s*text-overflow: ellipsis;\s*white-space: nowrap;\s*\}/);
  assert.match(html, /\.usage-top-bar \{ background: var\(--input\); border-radius: 0;/);
  assert.match(html, /\.usage-table th:nth-child\(1\),\s*\.usage-table td:nth-child\(1\) \{ width: 14%; \}/);
  assert.match(html, /\.usage-table th:nth-child\(2\),\s*\.usage-table td:nth-child\(2\) \{ width: 25%; \}/);
  assert.match(html, /<th>Tokens<\/th><th>Cost<\/th><th>Status<\/th>/);
  assert.ok(!html.includes('<th>Work</th>'));
  assert.ok(!html.includes('Cache reuse'));
  assert.ok(!html.includes('data-value="targetLanguage"'));
  assert.ok(!html.includes('No translations recorded yet'));
});

test('renders Simplified Chinese webview copy while preserving technical identifiers', () => {
  const bundle = JSON.parse(fs.readFileSync(new URL('../l10n/bundle.l10n.zh-cn.json', import.meta.url), 'utf8'));
  const format = (message, ...args) => (bundle[message] ?? message).replace(/\{(\d+)\}/g, (placeholder, index) => (
    args[Number(index)] === undefined ? placeholder : String(args[Number(index)])
  ));
  initializeLocalization(format);
  try {
    const html = renderSettingsHtml({
      cspSource: "'self'",
      locale: 'zh-cn',
      nonce: 'test-nonce',
      state: getState(),
    });

    assert.match(html, /<html lang="zh-cn">/);
    assert.match(html, /<title>MarkLingo 设置<\/title>/);
    assert.match(html, /<h2>键盘快捷键<\/h2>/);
    assert.match(html, /Markdown 内容会发送到所配置的 OpenAI-compatible 端点进行翻译。/);
    assert.match(html, /已验证——为提高可靠性，将使用较小批次。/);
    assert.match(html, /部分模型需要使用较小的 Markdown 批次来确保输出可靠，因此大文件的处理速度可能稍慢。/);
    assert.match(html, /SecretStorage/);
    assert.match(html, /globalStorageUri/);
    assert.match(html, /Base URL/);
    assert.match(html, /Model ID/);
    assert.match(html, /google\/gemini-3\.1-flash-lite/);
  } finally {
    initializeLocalization((message, ...args) => message.replace(/\{(\d+)\}/g, (placeholder, index) => (
      args[Number(index)] === undefined ? placeholder : String(args[Number(index)])
    )));
  }
});
