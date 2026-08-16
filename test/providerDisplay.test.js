import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderApiKeyInputPrompt,
  getProviderApiKeyInputTitle,
  getProviderDisplayName,
} from '../out/services/providerDisplay.js';

test('builds provider-specific API key copy', () => {
  assert.equal(getProviderDisplayName('openrouter'), 'OpenRouter');
  assert.equal(getProviderDisplayName('openaiCompatible'), 'Custom OpenAI Compatible');
  assert.equal(getProviderDisplayName('moonshot'), 'Moonshot');
  assert.equal(getProviderDisplayName('glm'), 'GLM');
  assert.equal(getProviderDisplayName('xiaomiMimo'), 'Xiaomi MiMo');
  assert.equal(getProviderApiKeyInputTitle('openrouter'), 'MarkLingo: OpenRouter API Key');
  assert.equal(getProviderApiKeyInputTitle('openaiCompatible'), 'MarkLingo: Custom OpenAI Compatible API Key');

  assert.equal(
    getProviderApiKeyInputPrompt('openrouter', 'https://openrouter.ai/api/v1'),
    'Paste your OpenRouter API key. MarkLingo stores it securely in VS Code SecretStorage.',
  );
  assert.equal(
    getProviderApiKeyInputPrompt('openaiCompatible', 'http://127.0.0.1:8080/v1', true),
    'A key is already saved. Paste a new one to replace it.',
  );
  assert.equal(
    getProviderApiKeyInputPrompt('openaiCompatible', 'http://127.0.0.1:8080/v1'),
    'Paste the API key for http://127.0.0.1:8080/v1. MarkLingo stores it securely in VS Code SecretStorage.',
  );
  assert.equal(
    getProviderApiKeyInputPrompt('openaiCompatible', ''),
    'Paste the API key for Custom OpenAI Compatible. MarkLingo stores it securely in VS Code SecretStorage.',
  );
});
