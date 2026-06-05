import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderBaseUrlCandidates,
  getProviderPreset,
  providerRequiresApiKey,
  providerSupportsApiKey,
  providerSupportsEditableModelId,
  providerSupportsReasoningDisable,
  providerSupportsTemperatureControl,
} from '../out/services/providerPresets.js';

test('defines OpenAI-compatible provider presets with regional endpoints', () => {
  assert.deepEqual(
    getProviderBaseUrlCandidates('moonshot'),
    [
      'https://api.moonshot.ai/v1',
      'https://api.moonshot.cn/v1',
    ],
  );
  assert.deepEqual(
    getProviderBaseUrlCandidates('glm'),
    [
      'https://api.z.ai/api/paas/v4',
      'https://open.bigmodel.cn/api/paas/v4',
    ],
  );
  assert.equal(getProviderPreset('xiaomiMimo').defaultBaseUrl, 'https://api.xiaomimimo.com/v1');
  assert.equal(getProviderPreset('moonshot').baseUrlEditable, false);
  assert.equal(getProviderPreset('glm').baseUrlEditable, false);
  assert.equal(providerSupportsApiKey('openaiCompatible'), true);
  assert.equal(providerRequiresApiKey('openaiCompatible'), false);
  assert.equal(providerSupportsEditableModelId('openrouter'), true);
  assert.equal(providerSupportsEditableModelId('openaiCompatible'), true);
  assert.equal(providerSupportsEditableModelId('moonshot'), false);
  assert.deepEqual(
    getProviderPreset('openai').modelOptions.map((option) => option.modelId),
    ['gpt-5.2'],
  );
  assert.equal(getProviderPreset('moonshot').modelOptions.some((option) => option.modelId === ''), false);
  assert.equal(providerSupportsReasoningDisable('openrouter'), true);
  assert.equal(providerSupportsReasoningDisable('openai'), true);
  assert.equal(providerSupportsReasoningDisable('deepseek'), true);
  assert.equal(providerSupportsReasoningDisable('openaiCompatible'), false);
  assert.equal(providerSupportsTemperatureControl('moonshot'), false);
  assert.equal(providerSupportsTemperatureControl('deepseek'), true);
});
