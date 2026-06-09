import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage, aggregateUsageView, coerceUsageQuery } from '../out/usage/usageAggregate.js';

let counter = 0;
function event(overrides = {}) {
  counter += 1;
  return {
    schemaVersion: 1,
    eventId: `e${counter}`,
    batchRunId: 'b',
    runId: 'r',
    startedAt: '2026-06-08T10:00:00.000Z',
    finishedAt: '2026-06-08T10:00:05.000Z',
    status: 'success',
    projectId: 'p1',
    projectName: 'proj',
    sourceFileName: 'a.md',
    sourceUriHash: 'h-a',
    targetLanguage: '简体中文',
    providerType: 'openrouter',
    modelId: 'm1',
    translatedBlocks: 10,
    reusedBlocks: 30,
    fallbackBlocks: 0,
    tokens: { input: 1000, source: 'estimated' },
    ...overrides,
  };
}

test('returns an empty summary for no events', () => {
  const summary = aggregateUsage([]);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.filesTranslated, 0);
  assert.equal(summary.projectsTouched, 0);
  assert.equal(summary.reusePercent, undefined);
  assert.equal(summary.estimatedInputTokens, 0);
  assert.equal(summary.reportedTotalTokens, 0);
  assert.equal(summary.hasEstimatedCost, false);
  assert.equal(summary.estimatedCost, 0);
  assert.deepEqual(summary.recentRuns, []);
  assert.deepEqual(summary.providers, []);
});

test('aggregates runs, files, reuse, tokens and breakdowns', () => {
  const events = [
    event({ sourceUriHash: 'h-a', status: 'success', translatedBlocks: 10, reusedBlocks: 30, tokens: { input: 1000, source: 'estimated' } }),
    event({ sourceUriHash: 'h-a', status: 'success', translatedBlocks: 2, reusedBlocks: 38, tokens: { input: 500, source: 'estimated' } }),
    event({ sourceUriHash: 'h-b', status: 'error', modelId: 'm2', providerType: 'openaiCompatible', projectId: 'p2', tokens: { source: 'unavailable' }, translatedBlocks: undefined, reusedBlocks: undefined }),
  ];
  const summary = aggregateUsage(events);
  assert.equal(summary.totalRuns, 3);
  assert.equal(summary.successRuns, 2);
  assert.equal(summary.failedRuns, 1);
  // Only h-a reached success; the failed h-b run does not count as a translated file.
  assert.equal(summary.filesTranslated, 1);
  assert.equal(summary.projectsTouched, 2);
  assert.equal(summary.translatedBlocks, 12);
  assert.equal(summary.reusedBlocks, 68);
  assert.equal(Math.round(summary.reusePercent), Math.round((68 / 80) * 100));
  assert.equal(summary.estimatedInputTokens, 1500);
  assert.equal(summary.providers.length, 2);
  assert.equal(summary.providers[0].key, 'openrouter');
  assert.equal(summary.providers[0].runs, 2);
  assert.equal(summary.providers[0].files, 1);
});

test('does not add unavailable-source tokens to the estimated total', () => {
  const summary = aggregateUsage([
    event({ tokens: { input: 800, source: 'estimated' } }),
    event({ tokens: { input: 999, output: 111, total: 1110, cachedProviderTokens: 222, source: 'reported' } }),
    event({ tokens: { source: 'unavailable' } }),
  ]);
  assert.equal(summary.estimatedInputTokens, 800);
  assert.equal(summary.hasReportedTokens, true);
  assert.equal(summary.reportedInputTokens, 999);
  assert.equal(summary.reportedOutputTokens, 111);
  assert.equal(summary.reportedTotalTokens, 1110);
  assert.equal(summary.cachedProviderTokens, 222);
});

test('aggregates cost and tracks mixed currencies', () => {
  const summary = aggregateUsage([
    event({ cost: { amount: 0.01, currency: 'USD', source: 'reported' } }),
    event({ cost: { amount: 0.02, currency: 'USD', source: 'estimated' } }),
  ]);
  assert.equal(summary.hasEstimatedCost, true);
  assert.equal(Number(summary.estimatedCost.toFixed(2)), 0.03);
  assert.equal(summary.costCurrency, 'USD');

  const mixed = aggregateUsage([
    event({ cost: { amount: 1, currency: 'USD', source: 'reported' } }),
    event({ cost: { amount: 1, currency: 'EUR', source: 'reported' } }),
  ]);
  assert.equal(mixed.costCurrency, 'mixed');
});

test('sorts recent runs by finished time desc and applies the limit', () => {
  const events = [
    event({ eventId: 'old', finishedAt: '2026-06-01T00:00:00.000Z' }),
    event({ eventId: 'new', finishedAt: '2026-06-08T00:00:00.000Z' }),
    event({ eventId: 'mid', finishedAt: '2026-06-05T00:00:00.000Z' }),
  ];
  const summary = aggregateUsage(events, { recentLimit: 2 });
  assert.equal(summary.recentRuns.length, 2);
  assert.equal(summary.recentRuns[0].eventId, 'new');
  assert.equal(summary.recentRuns[1].eventId, 'mid');
});

const VIEW_NOW = new Date('2026-06-08T12:00:00.000Z');

test('aggregateUsageView filters by range', () => {
  const events = [
    event({ finishedAt: '2026-06-08T10:00:00.000Z' }),
    event({ finishedAt: '2026-05-01T10:00:00.000Z' }),
  ];
  const recent = aggregateUsageView(events, { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' }, { now: VIEW_NOW });
  assert.equal(recent.totalRuns, 1);
  const all = aggregateUsageView(events, { range: 'all', groupBy: 'month', scope: 'allProjects', breakdown: 'model' }, { now: VIEW_NOW });
  assert.equal(all.totalRuns, 2);
});

test('aggregateUsageView filters by scope and project id', () => {
  const events = [
    event({ projectId: 'p1', finishedAt: '2026-06-08T10:00:00.000Z' }),
    event({ projectId: 'p2', finishedAt: '2026-06-08T10:00:00.000Z' }),
  ];
  const view = aggregateUsageView(events, { range: 'all', groupBy: 'day', scope: 'currentProject', breakdown: 'model' }, { now: VIEW_NOW, currentProjectId: 'p1' });
  assert.equal(view.totalRuns, 1);
  assert.equal(view.projectsTouched, 1);
});

test('aggregateUsageView builds continuous day buckets with stacked segments', () => {
  const events = [
    event({ finishedAt: '2026-06-08T09:00:00.000Z', modelId: 'm1', sourceUriHash: 'h1' }),
    event({ finishedAt: '2026-06-08T10:00:00.000Z', modelId: 'm2', sourceUriHash: 'h2' }),
    event({ finishedAt: '2026-06-06T10:00:00.000Z', modelId: 'm1', sourceUriHash: 'h3' }),
  ];
  const view = aggregateUsageView(events, { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' }, { now: VIEW_NOW });
  assert.equal(view.buckets.length, 7);
  const last = view.buckets[view.buckets.length - 1];
  assert.equal(last.key, '2026-06-08');
  assert.equal(last.totalRuns, 2);
  assert.deepEqual([...view.dimensionKeys].sort(), ['m1', 'm2']);
  assert.equal(last.segments.length, view.dimensionKeys.length);
});

test('aggregateUsageView truncates beyond the top stack keys into Other', () => {
  const events = [];
  for (let i = 0; i < 8; i += 1) {
    events.push(event({ finishedAt: '2026-06-08T10:00:00.000Z', modelId: `model-${i}`, sourceUriHash: `h-${i}` }));
  }
  const view = aggregateUsageView(events, { range: '7d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' }, { now: VIEW_NOW });
  assert.equal(view.dimensionKeys.includes('Other'), true);
  assert.equal(view.dimensionKeys.length, 7);
});

test('aggregateUsageView exposes tops and reuse totals', () => {
  const events = [
    event({ finishedAt: '2026-06-08T10:00:00.000Z', modelId: 'm1', translatedBlocks: 10, reusedBlocks: 30 }),
    event({ finishedAt: '2026-06-08T11:00:00.000Z', modelId: 'm1', translatedBlocks: 5, reusedBlocks: 15 }),
  ];
  const view = aggregateUsageView(events, { range: '30d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' }, { now: VIEW_NOW });
  assert.equal(view.tops[0].key, 'm1');
  assert.equal(view.tops[0].runs, 2);
  assert.deepEqual(view.reuse, { translated: 15, reused: 45, fallback: 0 });
});

test('coerceUsageQuery keeps valid values and falls back otherwise', () => {
  assert.deepEqual(
    coerceUsageQuery({ range: '7d', groupBy: 'week', scope: 'currentProject', breakdown: 'provider' }),
    { range: '7d', groupBy: 'week', scope: 'currentProject', breakdown: 'provider' },
  );
  assert.deepEqual(
    coerceUsageQuery({ range: 'bogus', breakdown: 42 }),
    { range: '30d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' },
  );
  assert.deepEqual(
    coerceUsageQuery(null),
    { range: '30d', groupBy: 'day', scope: 'allProjects', breakdown: 'model' },
  );
});
