import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigurationRegistryRefreshRequired,
  getConfigurationRegistryRefreshMessage,
  isConfigurationRegistryRefreshRequired,
} from '../out/vscodeConfigurationErrors.js';

test('formats configuration registry refresh guidance', () => {
  assert.equal(
    getConfigurationRegistryRefreshMessage('marklingo.openrouter.provider'),
    'VS Code has not refreshed MarkLingo\'s settings schema after the VSIX update, so "marklingo.openrouter.provider" cannot be written yet. Reload this VS Code window and reopen MarkLingo Settings. If the issue persists, quit all VS Code windows and reopen VS Code.',
  );
});

test('classifies explicit configuration registry refresh errors', () => {
  const error = new ConfigurationRegistryRefreshRequired('marklingo.openrouter.provider');

  assert.equal(isConfigurationRegistryRefreshRequired(error), true);
  assert.equal(isConfigurationRegistryRefreshRequired(new Error('Provider verification failed.')), false);
});
