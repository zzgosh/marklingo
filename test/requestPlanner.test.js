import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { planTranslationRequests } from '../out/translation/requestPlanner.js';

const buildPrompt = (blocks) => ({
  system: 'Translate Markdown to Simplified Chinese. Return JSON only.',
  user: JSON.stringify({ blocks }),
});

test('uses one request when blocks fit the context-window budget', () => {
  const blocks = Array.from({ length: 20 }, (_, index) => ({
    id: `b${index}`,
    markdown: `Short markdown block ${index}.`,
  }));

  const plan = planTranslationRequests(blocks, {
    modelContextLength: 128_000,
    maxContextUsageRatio: 0.5,
    fallbackMaxBlocksPerRequest: 4,
    buildPrompt,
  });

  assert.equal(plan.strategy, 'contextWindow');
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.chunks[0].blocks.length, 20);
});

test('falls back to block count when context length is unavailable', () => {
  const blocks = Array.from({ length: 9 }, (_, index) => ({
    id: `b${index}`,
    markdown: `Short markdown block ${index}.`,
  }));

  const plan = planTranslationRequests(blocks, {
    maxContextUsageRatio: 0.5,
    fallbackMaxBlocksPerRequest: 4,
    buildPrompt,
  });

  assert.equal(plan.strategy, 'fallbackBlocks');
  assert.deepEqual(plan.chunks.map((chunk) => chunk.blocks.length), [4, 4, 1]);
});

test('splits requests by estimated prompt budget', () => {
  const largeBlock = 'word '.repeat(1200);
  const blocks = Array.from({ length: 5 }, (_, index) => ({
    id: `b${index}`,
    markdown: `${largeBlock}${index}`,
  }));

  const plan = planTranslationRequests(blocks, {
    modelContextLength: 4_000,
    maxContextUsageRatio: 0.5,
    fallbackMaxBlocksPerRequest: 20,
    buildPrompt,
  });

  assert.equal(plan.strategy, 'contextWindow');
  assert.ok(plan.chunks.length > 1);
  for (const chunk of plan.chunks) {
    assert.ok(chunk.estimatedPromptTokens > 0);
  }
});

test('plans large block sets in linear time', () => {
  const blocks = Array.from({ length: 12_000 }, (_, index) => ({
    id: `b${index}`,
    markdown: `Block ${index}: ${'word '.repeat(30)}`,
  }));

  const startedAt = performance.now();
  const plan = planTranslationRequests(blocks, {
    modelContextLength: 1_048_576,
    maxContextUsageRatio: 0.5,
    fallbackMaxBlocksPerRequest: 24,
    buildPrompt,
  });
  const elapsedMs = performance.now() - startedAt;

  assert.ok(plan.chunks.length > 0);
  assert.ok(elapsedMs < 500, `expected planning to stay fast, got ${elapsedMs.toFixed(1)}ms`);
});
