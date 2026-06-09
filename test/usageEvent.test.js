import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageEventFromDebug, shouldRecordUsageEvent } from '../out/usage/usageEvent.js';

function baseDebug(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: 'run-123',
    startedAt: '2026-06-08T10:00:00.000Z',
    finishedAt: '2026-06-08T10:00:11.230Z',
    durationMs: 11230,
    status: 'success',
    extension: { id: 'zzgosh.marklingo', version: '0.0.4', mode: 'production' },
    environment: { appName: 'VS Code', vscodeVersion: '1.123.0', uiKind: 'desktop', workspaceFolderCount: 1 },
    document: {
      languageId: 'markdown',
      lineCount: 330,
      sourceBytes: 12774,
      sourceHash: 'doc-hash',
      totalSegments: 50,
      translatableBlocks: 48,
      blocksToTranslate: 12,
      cacheHits: 36,
    },
    settings: {
      providerType: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'google/gemini-3.1-flash-lite',
      targetLanguage: '简体中文',
      outputLocation: 'sourceFolder',
      adapterMode: 'Chat JSON',
      request: { stream: false },
    },
    plan: {
      mode: 'incremental',
      requestedMode: 'auto',
      strategy: 'contextWindow',
      chunkCount: 2,
      actualRequestCount: 2,
      chunks: [
        { index: 0, blockCount: 6, estimatedPromptTokens: 9000 },
        { index: 1, blockCount: 6, estimatedPromptTokens: 9000 },
      ],
    },
    result: { outputHash: 'out', translatedBlocks: 12, reusedBlocks: 36, fallbackBlocks: 0, warningCount: 0 },
    warnings: [],
    events: [],
    ...overrides,
  };
}

const ctx = {
  eventId: 'evt-1',
  batchRunId: 'batch-1',
  projectId: 'proj12',
  projectName: 'marklingo',
  sourceFileName: 'README.md',
  sourceUriHash: 'srchash',
  outputUriHash: 'outhash',
};

test('maps a successful debug into a usage event', () => {
  const event = buildUsageEventFromDebug(baseDebug(), ctx);
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.eventId, 'evt-1');
  assert.equal(event.batchRunId, 'batch-1');
  assert.equal(event.runId, 'run-123');
  assert.equal(event.status, 'success');
  assert.equal(event.projectId, 'proj12');
  assert.equal(event.projectName, 'marklingo');
  assert.equal(event.sourceFileName, 'README.md');
  assert.equal(event.sourceUriHash, 'srchash');
  assert.equal(event.outputUriHash, 'outhash');
  assert.equal(event.targetLanguage, '简体中文');
  assert.equal(event.providerType, 'openrouter');
  assert.equal(event.modelId, 'google/gemini-3.1-flash-lite');
  assert.equal(event.adapterMode, 'Chat JSON');
  assert.equal(event.sourceBytes, 12774);
  assert.equal(event.lineCount, 330);
  assert.equal(event.translatableBlocks, 48);
  assert.equal(event.blocksToTranslate, 12);
  assert.equal(event.translatedBlocks, 12);
  assert.equal(event.reusedBlocks, 36);
  assert.equal(event.fallbackBlocks, 0);
  assert.equal(event.requestCount, 2);
  assert.deepEqual(event.tokens, { input: 18000, source: 'estimated' });
});

test('uses chunkCount when actualRequestCount is missing', () => {
  const debug = baseDebug();
  debug.plan.actualRequestCount = undefined;
  const event = buildUsageEventFromDebug(debug, ctx);
  assert.equal(event.requestCount, 2);
});

test('falls back to document.cacheHits for reused blocks when result is absent', () => {
  const event = buildUsageEventFromDebug(baseDebug({ status: 'error', result: undefined }), ctx);
  assert.equal(event.status, 'error');
  assert.equal(event.translatedBlocks, undefined);
  assert.equal(event.fallbackBlocks, undefined);
  assert.equal(event.reusedBlocks, 36);
});

test('marks tokens unavailable when there is no plan', () => {
  const event = buildUsageEventFromDebug(baseDebug({ plan: undefined }), ctx);
  assert.deepEqual(event.tokens, { source: 'unavailable' });
  assert.equal(event.requestCount, undefined);
});

test('uses provider-reported tokens and cost when available', () => {
  const event = buildUsageEventFromDebug(baseDebug({
    usage: {
      promptTokens: 1234,
      completionTokens: 345,
      totalTokens: 1579,
      cachedTokens: 222,
      cacheWriteTokens: 111,
      reasoningTokens: 12,
      cost: 0.00042,
      costCurrency: 'credits',
      source: 'reported',
    },
  }), ctx);
  assert.deepEqual(event.tokens, {
    input: 1234,
    output: 345,
    total: 1579,
    cachedProviderTokens: 222,
    source: 'reported',
  });
  assert.deepEqual(event.cost, {
    amount: 0.00042,
    currency: 'USD',
    source: 'reported',
  });
});

test('estimates direct-provider cost from reported tokens and Gateway pricing', () => {
  const event = buildUsageEventFromDebug(baseDebug({
    settings: {
      ...baseDebug().settings,
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-5.4-mini',
    },
    usage: {
      promptTokens: 1234,
      completionTokens: 345,
      totalTokens: 1579,
      cost: 999,
      costCurrency: 'USD',
      source: 'reported',
    },
  }), ctx);
  assert.equal(event.cost?.currency, 'USD');
  assert.equal(event.cost?.source, 'estimated');
  assert.equal(Number(event.cost?.amount.toFixed(6)), 0.002478);
});

test('leaves local/custom provider cost unavailable without pricing', () => {
  const event = buildUsageEventFromDebug(baseDebug({
    settings: {
      ...baseDebug().settings,
      providerType: 'openaiCompatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      modelId: 'hy-mt2',
    },
    usage: {
      promptTokens: 1234,
      completionTokens: 345,
      totalTokens: 1579,
      cost: 999,
      costCurrency: 'USD',
      source: 'reported',
    },
  }), ctx);
  assert.equal(event.cost, undefined);
});

test('skips successful cache-only runs with no provider requests', () => {
  const debug = baseDebug({
    document: {
      ...baseDebug().document,
      blocksToTranslate: 0,
      cacheHits: 48,
    },
    plan: {
      ...baseDebug().plan,
      chunkCount: 0,
      actualRequestCount: 0,
      chunks: [],
    },
    result: { outputHash: 'out', translatedBlocks: 0, reusedBlocks: 48, fallbackBlocks: 0, warningCount: 0 },
  });
  assert.equal(shouldRecordUsageEvent(debug), false);
});

test('keeps failed attempts in usage even when no provider request completed', () => {
  const debug = baseDebug({
    status: 'error',
    document: {
      ...baseDebug().document,
      blocksToTranslate: 0,
      cacheHits: 48,
    },
    plan: {
      ...baseDebug().plan,
      chunkCount: 0,
      actualRequestCount: 0,
      chunks: [],
    },
    result: undefined,
  });
  assert.equal(shouldRecordUsageEvent(debug), true);
});

test('does not leak the provider base URL into the serialized event', () => {
  const event = buildUsageEventFromDebug(baseDebug(), ctx);
  const json = JSON.stringify(event);
  assert.ok(!json.includes('openrouter.ai'));
  assert.ok(!json.includes('doc-hash'));
});
