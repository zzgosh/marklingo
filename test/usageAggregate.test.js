import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from '../out/usage/usageAggregate.js';

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
    event({ tokens: { input: 999, source: 'reported' } }),
    event({ tokens: { source: 'unavailable' } }),
  ]);
  assert.equal(summary.estimatedInputTokens, 800);
  assert.equal(summary.hasReportedTokens, true);
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
