import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ConfigurationRegistryRefreshRequired,
  getConfigurationRegistryReloadAction,
  getConfigurationRegistryRefreshMessage,
  isConfigurationRegistryRefreshRequired,
} from '../out/vscodeConfigurationErrors.js';
import { initializeLocalization } from '../out/localization.js';

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

test('localizes the configuration registry reload action', () => {
  const bundle = JSON.parse(fs.readFileSync(new URL('../l10n/bundle.l10n.zh-cn.json', import.meta.url), 'utf8'));
  initializeLocalization((message) => bundle[message] ?? message);
  try {
    assert.equal(getConfigurationRegistryReloadAction(), '重新加载窗口');
  } finally {
    initializeLocalization((message, ...args) => message.replace(/\{(\d+)\}/g, (placeholder, index) => (
      args[Number(index)] === undefined ? placeholder : String(args[Number(index)])
    )));
  }
});
