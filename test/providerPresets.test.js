import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceProviderModelId,
  getProviderModelTags,
  getProviderBaseUrlCandidates,
  getProviderGatewayModelId,
  getProviderPreset,
  isLocalEndpoint,
  PROVIDER_PRESETS,
  providerRequiresApiKey,
  providerSupportsApiKey,
  providerSupportsEditableModelId,
  providerSupportsReasoningDisable,
  providerSupportsTemperatureControl,
} from '../out/services/providerPresets.js';
import { MARKLINGO_CONFIGURATION_KEYS } from '../out/configurationKeys.js';

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
    ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5.5'],
  );
  assert.equal(getProviderPreset('moonshot').modelOptions.some((option) => option.modelId === ''), false);
  assert.equal(providerSupportsReasoningDisable('openrouter'), true);
  assert.equal(providerSupportsReasoningDisable('openai'), true);
  assert.equal(providerSupportsReasoningDisable('deepseek'), true);
  assert.equal(providerSupportsReasoningDisable('openaiCompatible'), false);
  assert.equal(providerSupportsTemperatureControl('moonshot'), false);
  assert.equal(providerSupportsTemperatureControl('deepseek'), true);
});

test('replaces deprecated Xiaomi MiMo V2 Flash model ids with V2.5', () => {
  assert.deepEqual(
    getProviderPreset('openrouter').modelOptions.map((option) => option.modelId),
    [
      'google/gemini-3.1-flash-lite',
      'deepseek/deepseek-v4-flash',
      'openai/gpt-5.4-mini',
      'xiaomi/mimo-v2.5',
    ],
  );

  const xiaomiMimoPreset = getProviderPreset('xiaomiMimo');
  assert.equal(xiaomiMimoPreset.defaultModelId, 'mimo-v2.5');
  assert.deepEqual(
    xiaomiMimoPreset.modelOptions.map((option) => option.modelId),
    ['mimo-v2.5', 'mimo-v2.5-pro'],
  );
  assert.equal(coerceProviderModelId('xiaomiMimo', 'mimo-v2-flash'), 'mimo-v2.5');
  assert.equal(coerceProviderModelId('openrouter', 'xiaomi/mimo-v2-flash'), 'xiaomi/mimo-v2.5');
  assert.equal(getProviderGatewayModelId('xiaomiMimo', 'mimo-v2-flash'), 'xiaomi/mimo-v2.5');
});

test('exposes curated model tags and conservative local model tags', () => {
  assert.deepEqual(
    getProviderModelTags('openai', 'https://api.openai.com/v1', 'gpt-5.4-mini'),
    ['quality', 'fast'],
  );
  assert.deepEqual(
    getProviderModelTags('openrouter', 'https://openrouter.ai/api/v1', 'unknown/model'),
    [],
  );
  assert.deepEqual(
    getProviderModelTags('openaiCompatible', 'http://127.0.0.1:8080/v1', 'custom-model'),
    ['local'],
  );
  assert.deepEqual(
    getProviderModelTags('openaiCompatible', 'http://127.0.0.1:8080/v1', 'hy-mt2-1.8b-q4'),
    ['local', 'slow'],
  );
  assert.deepEqual(
    getProviderModelTags('openaiCompatible', 'http://127.0.0.1:8080/v1', 'hy-mt2'),
    ['local', 'slow'],
  );
  assert.deepEqual(
    getProviderModelTags('openaiCompatible', 'http://127.0.0.1:8080/v1', 'hy-mt2-base'),
    ['local', 'slow'],
  );
  assert.equal(isLocalEndpoint('https://192.168.1.20/v1'), true);
  assert.equal(isLocalEndpoint('https://10.0.0.2/v1'), true);
  assert.equal(isLocalEndpoint('https://172.16.0.1/v1'), true);
  assert.equal(isLocalEndpoint('http://[::1]:8080/v1'), true);
  assert.equal(isLocalEndpoint('https://10.example.com/v1'), false);
  assert.equal(isLocalEndpoint('https://192.168.example.com/v1'), false);
  assert.equal(isLocalEndpoint('https://172.32.0.1/v1'), false);
  assert.equal(isLocalEndpoint('https://api.openai.com/v1'), false);
});

test('keeps provider preset setting references registered', () => {
  for (const preset of PROVIDER_PRESETS) {
    for (const key of [preset.baseUrlSetting, preset.modelIdSetting]) {
      if (!key) continue;
      assert.ok(
        MARKLINGO_CONFIGURATION_KEYS.includes(key),
        `unregistered preset setting: ${key}`,
      );
    }
  }
});

test('maps every direct provider model to Gateway pricing ids', () => {
  for (const preset of PROVIDER_PRESETS) {
    if (preset.id === 'openrouter' || preset.id === 'openaiCompatible') continue;
    for (const option of preset.modelOptions) {
      assert.equal(
        getProviderGatewayModelId(preset.id, option.modelId),
        option.gatewayModelId,
        `missing Gateway pricing id for ${preset.id}:${option.modelId}`,
      );
      assert.match(option.gatewayModelId, /^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
  }
});
