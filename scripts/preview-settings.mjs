import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST ?? '127.0.0.1';
const requestedPort = Number.parseInt(process.env.PORT ?? '4177', 10);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compile = spawnSync(npmCommand, ['run', 'compile'], {
  cwd: root,
  stdio: 'inherit',
});

if (compile.error) {
  throw compile.error;
}

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const configProperties = packageJson.contributes.configuration.properties;
const defaultProviderType = configProperties['marklingo.openrouter.provider'].default;
const defaultBaseUrl = configProperties['marklingo.openrouter.baseUrl'].default;
const defaultModelId = configProperties['marklingo.openrouter.modelId'].default;
const defaultRequestMode = configProperties['marklingo.translation.requestMode'].default;
const defaultTranslationModelMaxBlocksPerRequest = configProperties['marklingo.translation.translationModelMaxBlocksPerRequest'].default;
const defaultTranslationModelConcurrency = configProperties['marklingo.translation.translationModelConcurrency'].default;
const defaultTranslationModelMaxOutputTokens = configProperties['marklingo.translation.translationModelMaxOutputTokens'].default;
const settingsHtmlUrl = pathToFileURL(path.join(root, 'out/webview/settingsHtml.js')).href;
const promptsUrl = pathToFileURL(path.join(root, 'out/translation/prompts.js')).href;
const translationModelPromptsUrl = pathToFileURL(path.join(root, 'out/translation/translationModelPrompts.js')).href;
const providerPresetsUrl = pathToFileURL(path.join(root, 'out/services/providerPresets.js')).href;
const { createSettingsHtmlNonce, renderSettingsHtml, renderUsageSection } = await import(`${settingsHtmlUrl}?t=${Date.now()}`);
const { resolveSystemPrompt } = await import(`${promptsUrl}?t=${Date.now()}`);
const { getTranslationModelPromptPreview } = await import(`${translationModelPromptsUrl}?t=${Date.now()}`);
const {
  coerceProviderType,
  getProviderDefaultBaseUrl,
  getProviderDefaultModelId,
  PROVIDER_PRESETS,
} = await import(`${providerPresetsUrl}?t=${Date.now()}`);

const providerDefaultBaseUrls = Object.fromEntries(PROVIDER_PRESETS.map((preset) => [
  preset.id,
  preset.defaultBaseUrl,
]));

const usagePreviewRanges = ['1d', '7d', '30d', '365d', 'all'];
const usagePreviewBreakdowns = ['provider', 'model'];
const usagePreviewMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const usagePreviewDayMs = 86_400_000;
const usagePreviewHourMs = 3_600_000;

function serializeForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getPreviewThemeCss(nonce) {
  return `<style nonce="${nonce}">
    :root {
      --vscode-editor-background: #1f1f1f;
      --vscode-foreground: #d4d4d4;
      --vscode-descriptionForeground: #9d9d9d;
      --vscode-sideBar-background: #252526;
      --vscode-widget-border: #3c3c3c;
      --vscode-input-background: #313131;
      --vscode-button-background: #0e639c;
      --vscode-button-foreground: #ffffff;
      --vscode-errorForeground: #f85149;
      --vscode-focusBorder: #007fd4;
      --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --vscode-editor-font-family: "SF Mono", Monaco, Consolas, monospace;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --vscode-editor-background: #ffffff;
        --vscode-foreground: #1f2328;
        --vscode-descriptionForeground: #57606a;
        --vscode-sideBar-background: #f6f8fa;
        --vscode-widget-border: #d0d7de;
        --vscode-input-background: #ffffff;
        --vscode-button-background: #0969da;
        --vscode-button-foreground: #ffffff;
        --vscode-errorForeground: #cf222e;
        --vscode-focusBorder: #0969da;
      }
    }
  </style>`;
}

function getPromptState(adapterMode, promptModelId, targetLanguage, chatPromptInstructions) {
  if (adapterMode === 'translationModel') {
    const preview = getTranslationModelPromptPreview({ targetLanguage, modelId: promptModelId });
    return {
      promptInstructions: preview.prompt,
      promptInstructionsEnhanced: preview.enhanced,
      promptInstructionsEnhancementNote: preview.enhancementNote,
    };
  }
  return {
    promptInstructions: chatPromptInstructions,
    promptInstructionsEnhanced: false,
    promptInstructionsEnhancementNote: undefined,
  };
}

function coerceUsagePreviewRange(value) {
  return usagePreviewRanges.includes(value) ? value : '7d';
}

function coerceUsagePreviewBreakdown(value) {
  return usagePreviewBreakdowns.includes(value) ? value : 'model';
}

function getUsagePreviewGroupBy(range) {
  if (range === '1d') return 'hour';
  if (range === '365d') return 'week';
  if (range === 'all') return 'month';
  return 'day';
}

function getUsagePreviewDimensionKeys(breakdown) {
  if (breakdown === 'provider') return ['openrouter', 'openaiCompatible'];
  return ['google/gemini-3.1-flash-lite', 'hy-mt2'];
}

function formatUsagePreviewDayLabel(date) {
  return `${usagePreviewMonths[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function buildUsagePreviewBucketDate(range, index, count) {
  const base = Date.UTC(2026, 5, 8);
  if (range === '1d') return new Date(base - (count - 1 - index) * usagePreviewHourMs);
  if (range === '365d') return new Date(base - (count - 1 - index) * 7 * usagePreviewDayMs);
  if (range === 'all') return new Date(Date.UTC(2026, 5 - (count - 1 - index), 1));
  return new Date(base - (count - 1 - index) * usagePreviewDayMs);
}

function buildUsagePreviewBuckets(range, dimensionKeys) {
  const count = range === '1d' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : range === '365d' ? 53 : 6;
  return Array.from({ length: count }, (_, index) => {
    const date = buildUsagePreviewBucketDate(range, index, count);
    const segments = dimensionKeys.map((key, dimensionIndex) => {
      const wave = Math.abs(Math.sin((index + 1) * (dimensionIndex + 1) * 0.73));
      const ceiling = dimensionIndex === 0 ? 6 : dimensionIndex === 1 ? 4 : 3;
      const runs = Math.round(wave * ceiling) + (dimensionIndex === 0 && index % 4 === 0 ? 1 : 0);
      const tokens = runs * (dimensionIndex === 0 ? 6400 : 4200) + Math.round(wave * 900);
      return { key, runs, tokens };
    });
    let totalRuns = segments.reduce((sum, segment) => sum + segment.runs, 0);
    if (totalRuns === 0 && segments.length > 0) {
      segments[0].runs = 1;
      segments[0].tokens = 6400;
      totalRuns = 1;
    }
    const totalTokens = segments.reduce((sum, segment) => sum + segment.tokens, 0);
    const key = range === 'all'
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : range === '1d'
        ? date.toISOString().slice(0, 13)
      : date.toISOString().slice(0, 10);
    const label = range === 'all'
      ? `${usagePreviewMonths[date.getUTCMonth()]}`
      : range === '1d'
        ? `${String(date.getUTCHours()).padStart(2, '0')}:00`
      : formatUsagePreviewDayLabel(date);
    return { key, label, totalRuns, totalTokens, segments };
  });
}

function buildUsagePreviewTops(dimensionKeys, buckets) {
  return dimensionKeys
    .map((key) => {
      const runs = buckets.reduce((sum, bucket) => {
        const segment = bucket.segments.find((item) => item.key === key);
        return sum + (segment?.runs ?? 0);
      }, 0);
      return { key, runs, files: Math.max(1, Math.ceil(runs / 3)) };
    })
    .filter((entry) => entry.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 5);
}

function buildUsagePreviewView(baseUsage, rangeValue, breakdownValue) {
  const range = coerceUsagePreviewRange(rangeValue);
  const breakdown = coerceUsagePreviewBreakdown(breakdownValue);
  const query = { range, groupBy: getUsagePreviewGroupBy(range), scope: 'allProjects', breakdown };
  if (baseUsage.totalRuns === 0) {
    return { ...baseUsage, query };
  }

  const dimensionKeys = getUsagePreviewDimensionKeys(breakdown);
  const buckets = buildUsagePreviewBuckets(range, dimensionKeys);
  const tops = buildUsagePreviewTops(dimensionKeys, buckets);
  const totalRuns = buckets.reduce((sum, bucket) => sum + bucket.totalRuns, 0);
  const tokenTotal = buckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0);
  const failedRuns = Math.max(1, Math.round(totalRuns * 0.07));
  return {
    ...baseUsage,
    totalRuns,
    successRuns: Math.max(0, totalRuns - failedRuns),
    failedRuns,
    filesTranslated: Math.max(1, Math.round(totalRuns * 0.45)),
    projectsTouched: baseUsage.projectsTouched,
    tokenTotal,
    estimatedInputTokens: Math.round(totalRuns * 4200),
    reportedInputTokens: Math.round(totalRuns * 3800),
    reportedOutputTokens: Math.round(totalRuns * 760),
    reportedTotalTokens: Math.round(totalRuns * 4560),
    estimatedCost: Number((totalRuns * 0.00195).toFixed(5)),
    query,
    dimensionKeys,
    buckets,
    tops,
  };
}

function buildUsagePreviewResponses(baseUsage) {
  const responses = {};
  usagePreviewRanges.forEach((range) => {
    usagePreviewBreakdowns.forEach((breakdown) => {
      const view = buildUsagePreviewView(baseUsage, range, breakdown);
      responses[`${range}:${breakdown}`] = {
        query: view.query,
        html: renderUsageSection(view),
      };
    });
  });
  return responses;
}

function getPreviewBridgeScript(nonce, url, usage) {
  const usesCustomLanguage = url.searchParams.get('custom') === '1';
  const targetLanguage = usesCustomLanguage ? 'Brazilian Portuguese' : '简体中文';
  const chatPromptInstructions = resolveSystemPrompt('', targetLanguage);
  const adapterMode = url.search.includes('capability=translationModel') ? 'translationModel' : 'chatJson';
  const promptModelId = url.searchParams.get('openaiModel') ?? url.searchParams.get('model') ?? defaultModelId;
  const promptState = getPromptState(adapterMode, promptModelId, targetLanguage, chatPromptInstructions);
  const usageDelay = Number.parseInt(url.searchParams.get('usageDelay') ?? '140', 10);
  const replyDelay = Number.isFinite(usageDelay) && usageDelay >= 0 ? usageDelay : 140;
  const usageBaseUrl = new URL(url.toString());
  usageBaseUrl.searchParams.delete('usage');
  const usagePreviewResponses = buildUsagePreviewResponses(usage ?? buildState(usageBaseUrl).usage);
  return `<script nonce="${nonce}">
    window.__marklingoPreviewMessages = [];
    const usagePreviewResponses = ${serializeForScript(usagePreviewResponses)};
    window.acquireVsCodeApi = () => ({
      postMessage(message) {
        window.__marklingoPreviewMessages.push(message);
        console.info('[MarkLingo Settings preview]', message);
        if (!message || typeof message.type !== 'string') return;
        const reply = (payload) => window.setTimeout(() => window.postMessage(payload, window.location.origin), ${replyDelay});
        if (message.type === 'updateSetting') {
          reply({ type: 'saved', key: message.key, value: message.value, saveId: message.saveId });
          return;
        }
        if (message.type === 'usageQuery') {
          const range = ${serializeForScript(usagePreviewRanges)}.includes(message.range) ? message.range : '7d';
          const breakdown = ${serializeForScript(usagePreviewBreakdowns)}.includes(message.breakdown) ? message.breakdown : 'model';
          const usageResponse = usagePreviewResponses[range + ':' + breakdown] || usagePreviewResponses['7d:model'];
          if (usageResponse) {
            reply({ type: 'usageSection', html: usageResponse.html, query: usageResponse.query, requestId: message.requestId });
          }
          return;
        }
        if (message.type === 'verifyProvider') {
          if (window.location.search.includes('verify=fail')) {
            reply({ type: 'providerVerification', ok: false, message: 'Verification failed.', saveId: message.saveId });
            return;
          }
          const adapterMode = window.location.search.includes('capability=translationModel') ? 'translationModel' : 'chatJson';
          reply({
            type: 'providerVerification',
            ok: true,
            hasKey: true,
            providerType: message.providerType,
            baseUrl: message.providerType === 'openaiCompatible'
              ? message.baseUrl
              : (${JSON.stringify(providerDefaultBaseUrls)}[message.providerType] || ${JSON.stringify(defaultBaseUrl)}),
            modelId: message.modelId,
            adapterMode,
            promptInstructions: adapterMode === 'translationModel' ? ${JSON.stringify(promptState.promptInstructions)} : ${JSON.stringify(chatPromptInstructions)},
            promptInstructionsEnhanced: adapterMode === 'translationModel' ? ${JSON.stringify(promptState.promptInstructionsEnhanced)} : false,
            promptInstructionsEnhancementNote: adapterMode === 'translationModel' ? ${JSON.stringify(promptState.promptInstructionsEnhancementNote ?? '')} : '',
            message: 'Verified.',
            saveId: message.saveId,
          });
          return;
        }
        if (message.type === 'clearCurrentProjectData') {
          console.info('[MarkLingo Settings preview] clearCurrentProjectData is mocked; no files or metadata are deleted.');
          return;
        }
        if (message.type === 'clearAllData') {
          console.info('[MarkLingo Settings preview] clearAllData is mocked; resetting preview state.');
          window.setTimeout(() => window.location.replace(window.location.origin + window.location.pathname), 140);
          return;
        }
        if (message.type === 'optimizeStorage') {
          console.info('[MarkLingo Settings preview] optimizeStorage is mocked; no cached translations are changed.');
          return;
        }
        if (message.type === 'copySystemPrompt') {
          navigator.clipboard?.writeText(message.value ?? '').catch(() => {});
          console.info('[MarkLingo Settings preview] copySystemPrompt is mocked.');
        }
      },
    });
  </script>`;
}

function buildState(url) {
  const usesCustomLanguage = url.searchParams.get('custom') === '1';
  const targetLanguage = usesCustomLanguage ? 'Brazilian Portuguese' : '简体中文';
  const chatPromptInstructions = resolveSystemPrompt('', targetLanguage);
  const providerType = coerceProviderType(url.searchParams.get('provider') ?? defaultProviderType);
  const isOpenAiCompatible = providerType === 'openaiCompatible';
  const isOpenRouter = providerType === 'openrouter';
  const providerDefaultModelId = getProviderDefaultModelId(providerType);
  const providerDefaultBaseUrl = getProviderDefaultBaseUrl(providerType);
  const modelId = url.searchParams.get('model') ?? (isOpenAiCompatible ? '' : providerDefaultModelId);
  const baseUrl = isOpenAiCompatible ? (url.searchParams.get('baseUrl') ?? '') : providerDefaultBaseUrl;
  const openRouterModelId = url.searchParams.get('openrouterModel') ?? (isOpenRouter ? modelId : defaultModelId);
  const currentProviderHasApiKey = url.searchParams.get('apiKey') === 'present';
  const openAiCompatibleBaseUrl = url.searchParams.get('openaiBaseUrl') ?? (isOpenAiCompatible ? baseUrl : '');
  const openAiCompatibleModelId = url.searchParams.get('openaiModel') ?? (isOpenAiCompatible ? modelId : '');
  const openRouterHasApiKey = url.searchParams.get('openrouterKey') === 'present' || (isOpenRouter && currentProviderHasApiKey);
  const openAiCompatibleHasApiKey = url.searchParams.get('openaiKey') === 'present' || (isOpenAiCompatible && currentProviderHasApiKey);
  const shouldUseVerifiedCapability = url.searchParams.get('verified') !== '0';
  const verifiedAdapterMode = currentProviderHasApiKey && shouldUseVerifiedCapability
    ? (url.searchParams.get('capability') ?? 'chatJson')
    : undefined;
  const openRouterVerifiedAdapterMode = openRouterHasApiKey && shouldUseVerifiedCapability
    ? (url.searchParams.get('openrouterCapability') ?? 'chatJson')
    : undefined;
  const openAiCompatibleVerifiedAdapterMode = openAiCompatibleHasApiKey && shouldUseVerifiedCapability
    ? (url.searchParams.get('openaiCapability') ?? (isOpenAiCompatible ? verifiedAdapterMode : undefined))
    : undefined;
  const currentPromptState = getPromptState(verifiedAdapterMode, modelId, targetLanguage, chatPromptInstructions);
  const openRouterPromptState = getPromptState(openRouterVerifiedAdapterMode, openRouterModelId, targetLanguage, chatPromptInstructions);
  const openAiCompatiblePromptState = getPromptState(openAiCompatibleVerifiedAdapterMode, openAiCompatibleModelId, targetLanguage, chatPromptInstructions);
  const initialUsageBuckets = buildUsagePreviewBuckets('7d', ['google/gemini-3.1-flash-lite', 'hy-mt2']);
  const initialUsageTokenTotal = initialUsageBuckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0);
  const shortcutWarning = url.searchParams.get('warning') === '1'
    ? 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.'
    : '';
  return {
    shortcuts: [
      {
        id: 'translateCurrentMarkdown',
        title: 'Translate Current Markdown',
        shortcutLabel: 'Option + Command + T',
        shortcutStatus: shortcutWarning ? 'Potential user keybinding conflict: workbench.action.tasks.runTask' : 'Default shortcut for Markdown editors.',
        shortcutWarning,
      },
      {
        id: 'deleteCurrentProjectTranslatedFiles',
        title: 'Delete Current Project Translated Files',
        shortcutLabel: 'Option + Command + D',
        shortcutStatus: 'Default shortcut for current project cleanup.',
        shortcutWarning: 'If MarkLingo cannot use this shortcut, macOS may already use it for Dock. Change it in System Settings > Keyboard > Keyboard Shortcuts... > Dock > Turn Dock hiding on/off.',
      },
    ],
    providerType,
    baseUrl,
    openRouterBaseUrl: defaultBaseUrl,
    openRouterModelId,
    openRouterHasApiKey,
    openRouterVerifiedAdapterMode,
    openRouterPromptInstructions: openRouterPromptState.promptInstructions,
    openRouterPromptInstructionsEnhanced: openRouterPromptState.promptInstructionsEnhanced,
    openRouterPromptInstructionsEnhancementNote: openRouterPromptState.promptInstructionsEnhancementNote,
    openAiCompatibleBaseUrl,
    openAiCompatibleModelId,
    openAiCompatibleHasApiKey,
    openAiCompatibleVerifiedAdapterMode,
    openAiCompatiblePromptInstructions: openAiCompatiblePromptState.promptInstructions,
    openAiCompatiblePromptInstructionsEnhanced: openAiCompatiblePromptState.promptInstructionsEnhanced,
    openAiCompatiblePromptInstructionsEnhancementNote: openAiCompatiblePromptState.promptInstructionsEnhancementNote,
    hasApiKey: currentProviderHasApiKey,
    modelId,
    verifiedAdapterMode,
    requestMode: url.searchParams.get('mode') ?? defaultRequestMode,
    translationModelMaxBlocksPerRequest: Number.parseInt(url.searchParams.get('blocks') ?? String(defaultTranslationModelMaxBlocksPerRequest), 10),
    translationModelConcurrency: Number.parseInt(url.searchParams.get('concurrency') ?? String(defaultTranslationModelConcurrency), 10),
    translationModelMaxOutputTokens: Number.parseInt(url.searchParams.get('maxTokens') ?? String(defaultTranslationModelMaxOutputTokens), 10),
    targetLanguage: usesCustomLanguage ? 'Custom...' : '简体中文',
    targetLanguageCustom: usesCustomLanguage ? 'Brazilian Portuguese' : '',
    promptInstructions: currentPromptState.promptInstructions,
    promptInstructionsEnhanced: currentPromptState.promptInstructionsEnhanced,
    promptInstructionsEnhancementNote: currentPromptState.promptInstructionsEnhancementNote,
    chatPromptInstructions,
    customPrompt: '',
    storageRoot: path.join(root, '.vscode-test', 'marklingo-preview', 'globalStorage', 'projects'),
    currentProjectPath: root,
    storageStats: {
      totalBytes: url.searchParams.get('storage') === 'full' ? 285 * 1024 * 1024 : 46 * 1024 * 1024,
      quotaBytes: 300 * 1024 * 1024,
      projectCount: 3,
      metaFileCount: 14,
      activeCacheCount: 11,
      evictedCacheCount: 3,
      cachePayloadBytes: url.searchParams.get('storage') === 'full' ? 250 * 1024 * 1024 : 38 * 1024 * 1024,
    },
    usage: url.searchParams.get('usage') === 'loading'
      ? undefined
      : url.searchParams.get('usage') === 'empty'
      ? {
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
        }
      : {
          totalRuns: 42,
          successRuns: 39,
          failedRuns: 3,
          filesTranslated: 18,
          projectsTouched: 3,
          translatedBlocks: 512,
          reusedBlocks: 1340,
          fallbackBlocks: 7,
          reusePercent: (1340 / (1340 + 512)) * 100,
          tokenTotal: initialUsageTokenTotal,
          estimatedInputTokens: 184000,
          hasReportedTokens: true,
          reportedInputTokens: 166200,
          reportedOutputTokens: 32680,
          reportedTotalTokens: 198880,
          cachedProviderTokens: 24120,
          hasEstimatedCost: true,
          estimatedCost: 0.08342,
          costCurrency: 'USD',
          providers: [
            { key: 'openrouter', runs: 30, files: 12 },
            { key: 'openaiCompatible', runs: 12, files: 6 },
          ],
          models: [
            { key: 'google/gemini-3.1-flash-lite', runs: 24, files: 10 },
            { key: 'hy-mt2', runs: 12, files: 6 },
          ],
          targetLanguages: [
            { key: '简体中文', runs: 28, files: 12 },
            { key: 'English', runs: 14, files: 6 },
          ],
          recentRuns: [
            { eventId: 'r1', startedAt: '2026-06-08T09:58:00.000Z', finishedAt: '2026-06-08T09:58:11.000Z', status: 'success', projectName: 'marklingo', sourceFileName: 'README.md', targetLanguage: '简体中文', providerType: 'openrouter', modelId: 'google/gemini-3.1-flash-lite', translatedBlocks: 12, reusedBlocks: 36, fallbackBlocks: 0, durationMs: 11230, tokensInput: 18000, tokensOutput: 4200, tokensTotal: 22200, cachedProviderTokens: 1800, tokensSource: 'reported', costAmount: 0.0098, costCurrency: 'USD', costSource: 'reported' },
            { eventId: 'r2', startedAt: '2026-06-08T09:40:00.000Z', finishedAt: '2026-06-08T09:40:06.500Z', status: 'success', projectName: 'marklingo', sourceFileName: 'AGENTS.md', targetLanguage: '简体中文', providerType: 'openrouter', modelId: 'google/gemini-3.1-flash-lite', translatedBlocks: 4, reusedBlocks: 58, fallbackBlocks: 0, durationMs: 6500, tokensInput: 9000, tokensOutput: 1200, tokensTotal: 10200, cachedProviderTokens: 2200, tokensSource: 'reported', costAmount: 0.0031, costCurrency: 'USD', costSource: 'reported' },
            { eventId: 'r3', startedAt: '2026-06-07T22:10:00.000Z', finishedAt: '2026-06-07T22:10:02.100Z', status: 'error', projectName: 'docs-site', sourceFileName: 'guide.md', targetLanguage: 'English', providerType: 'openaiCompatible', modelId: 'hy-mt2', durationMs: 2100, tokensSource: 'unavailable' },
          ],
          query: { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' },
          dimensionKeys: ['google/gemini-3.1-flash-lite', 'hy-mt2'],
          buckets: initialUsageBuckets,
          tops: [
            { key: 'google/gemini-3.1-flash-lite', runs: 24, files: 10 },
            { key: 'hy-mt2', runs: 12, files: 6 },
          ],
          topModelsByTokens: [
            { key: 'google/gemini-3.1-flash-lite', value: 154000, runs: 24 },
            { key: 'hy-mt2', value: 44880, runs: 12 },
          ],
          topModelsByCost: [
            { key: 'google/gemini-3.1-flash-lite', value: 0.0712, runs: 24, source: 'reported' },
          ],
          reuse: { translated: 512, reused: 1340, fallback: 7 },
        },
  };
}

let actualPort = requestedPort;

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${actualPort}`);
  if (requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  if (requestUrl.pathname !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  const nonce = createSettingsHtmlNonce();
  const state = buildState(requestUrl);
  const html = renderSettingsHtml({
    beforeMainScript: getPreviewBridgeScript(nonce, requestUrl, state.usage),
    cspSource: "'self'",
    extraHead: getPreviewThemeCss(nonce),
    nonce,
    state,
  });
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(html);
});

async function listen(port) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

try {
  await listen(requestedPort);
} catch (error) {
  if (error?.code !== 'EADDRINUSE' || process.env.PORT) {
    throw error;
  }
  await listen(0);
}

const address = server.address();
actualPort = typeof address === 'object' && address ? address.port : requestedPort;
const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
console.log(`MarkLingo Settings preview: http://${displayHost}:${actualPort}/`);
console.log('Press Ctrl+C to stop the preview server.');
