import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('translation keybinding is available for markdown file extensions', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const binding = pkg.contributes.keybindings.find((item) => item.command === 'marklingo.translateCurrentMarkdown');

  assert.ok(binding, 'expected translate command keybinding');
  assert.match(binding.when, /editorLangId == markdown/);
  assert.match(binding.when, /resourceExtname == \.md/);
  assert.match(binding.when, /resourceExtname == \.markdown/);
});

test('settings-only cleanup actions are not command palette contributions', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const commandIds = new Set(pkg.contributes.commands.map((item) => item.command));

  assert.ok(!commandIds.has('marklingo.clearExtensionData'));
  assert.ok(!commandIds.has('marklingo.openrouter.resetApiKey'));
});
