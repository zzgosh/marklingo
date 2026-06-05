import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isModelOutputError,
  shouldOfferSettingsActionForFailures,
} from '../out/commands/failureActions.js';

test('classifies model output errors for retry and settings actions', () => {
  assert.equal(isModelOutputError(new SyntaxError('Unexpected token')), true);
  assert.equal(isModelOutputError('Model output is not valid JSON.'), true);
  assert.equal(isModelOutputError('OpenRouter returned empty content or an unexpected response shape.'), true);
  assert.equal(isModelOutputError('ENOENT: no such file or directory'), false);
});

test('offers settings only for provider or model-output batch failures', () => {
  assert.equal(shouldOfferSettingsActionForFailures(['HTTP 500 from provider']), true);
  assert.equal(shouldOfferSettingsActionForFailures(['API key is required.']), true);
  assert.equal(shouldOfferSettingsActionForFailures(['Model output is not valid JSON.']), true);
  assert.equal(shouldOfferSettingsActionForFailures(['ENOENT: no such file or directory']), false);
});
