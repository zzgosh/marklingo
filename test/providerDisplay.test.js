import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMissingProviderApiKeyMessage,
  getProviderApiKeyInputPrompt,
  getProviderApiKeyInputTitle,
  getProviderDisplayName,
} from '../out/services/providerDisplay.js';

test('builds provider-specific command onboarding copy', () => {
  assert.equal(getProviderDisplayName('openrouter'), 'OpenRouter');
  assert.equal(getProviderDisplayName('openaiCompatible'), 'OpenAI Compatible');
  assert.equal(getProviderApiKeyInputTitle('openrouter'), 'MarkLingo: OpenRouter API Key');
  assert.equal(getProviderApiKeyInputTitle('openaiCompatible'), 'MarkLingo: OpenAI Compatible API Key');

  assert.equal(
    getProviderApiKeyInputPrompt('openrouter', 'https://openrouter.ai/api/v1'),
    'Current Provider: OpenRouter. Endpoint: https://openrouter.ai/api/v1. Enter the API key for OpenRouter. It will be stored in VS Code SecretStorage.',
  );
  assert.equal(
    getProviderApiKeyInputPrompt('openaiCompatible', 'http://127.0.0.1:8080/v1', true),
    'Current Provider: OpenAI Compatible. Endpoint: http://127.0.0.1:8080/v1. An API key is already saved for this provider. Enter a new key to replace it.',
  );
  assert.equal(
    getMissingProviderApiKeyMessage('openaiCompatible'),
    'Missing OpenAI Compatible API key. Save and verify it from MarkLingo settings or run translation again.',
  );
});
