import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateCostFromTokens,
  estimateProviderModelCost,
  getGatewayModelContextWindow,
  getModelPricing,
} from '../out/usage/modelPricing.js';
import { PROVIDER_PRESETS } from '../out/services/providerPresets.js';

test('reads generated model pricing by Gateway model id', () => {
  const pricing = getModelPricing('openai/gpt-5.4-mini');
  assert.equal(pricing?.input, 0.00000075);
  assert.equal(pricing?.output, 0.0000045);
  assert.equal(pricing?.contextWindow, 400000);
});

test('estimates cost from input and output tokens', () => {
  const estimate = estimateCostFromTokens(
    { input: 0.000001, output: 0.00001 },
    { input: 1000, output: 200 },
  );
  assert.deepEqual(estimate, { amount: 0.003, currency: 'USD' });
});

test('derives output tokens from total when completion tokens are absent', () => {
  const estimate = estimateCostFromTokens(
    { input: 0.000001, output: 0.00001 },
    { input: 1000, total: 1200 },
  );
  assert.deepEqual(estimate, { amount: 0.003, currency: 'USD' });
});

test('estimates direct provider model cost through Gateway mapping', () => {
  const estimate = estimateProviderModelCost('deepseek', 'deepseek-v4-flash', {
    input: 1000,
    output: 500,
  });
  assert.equal(Number(estimate?.amount.toFixed(8)), 0.00028);
  assert.equal(estimate?.currency, 'USD');
});

test('leaves OpenRouter and local/custom models unpriced by the Gateway table', () => {
  assert.equal(estimateProviderModelCost('openrouter', 'google/gemini-3.1-flash-lite', { input: 1000, output: 500 }), undefined);
  assert.equal(estimateProviderModelCost('openaiCompatible', 'hy-mt2', { input: 1000, output: 500 }), undefined);
});

test('exposes Gateway context-window fallback for direct providers', () => {
  assert.equal(getGatewayModelContextWindow('glm', 'glm-5.1'), 202800);
  assert.equal(getGatewayModelContextWindow('openaiCompatible', 'hy-mt2'), undefined);
});

test('covers every direct provider Gateway model id in the generated pricing table', () => {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.id === 'openrouter' || preset.id === 'openaiCompatible') continue;
    for (const option of preset.modelOptions) {
      assert.ok(option.gatewayModelId, `missing Gateway model id for ${preset.id}:${option.modelId}`);
      assert.ok(
        getModelPricing(option.gatewayModelId),
        `missing generated pricing for ${preset.id}:${option.modelId} -> ${option.gatewayModelId}`,
      );
    }
  }
});
