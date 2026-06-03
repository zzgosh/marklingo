import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKLINGO_CONFIGURATION_KEYS } from '../out/configurationKeys.js';

function readPackageJson() {
  return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
}

test('translation keybinding is available for markdown file extensions', () => {
  const pkg = readPackageJson();
  const binding = pkg.contributes.keybindings.find((item) => item.command === 'marklingo.translateCurrentMarkdown');

  assert.ok(binding, 'expected translate command keybinding');
  assert.equal(binding.key, 'ctrl+alt+t');
  assert.equal(binding.mac, 'alt+cmd+t');
  assert.equal(binding.win, 'ctrl+alt+t');
  assert.equal(binding.linux, 'ctrl+alt+t');
  assert.match(binding.when, /editorLangId == markdown/);
  assert.match(binding.when, /resourceExtname == \.md/);
  assert.match(binding.when, /resourceExtname == \.markdown/);
});

test('command palette contributions expose only main user actions', () => {
  const pkg = readPackageJson();
  const commandIds = new Set(pkg.contributes.commands.map((item) => item.command));

  assert.deepEqual([...commandIds].sort(), [
    'marklingo.deleteCurrentProjectTranslatedFiles',
    'marklingo.ignoreTranslatedFilesInGit',
    'marklingo.openSettings',
    'marklingo.translateCurrentMarkdown',
    'marklingo.translateCurrentMarkdownFull',
    'marklingo.translateFolderMarkdown',
  ]);
  assert.ok(!commandIds.has('marklingo.clearExtensionData'));
  assert.ok(!commandIds.has('marklingo.openrouter.resetApiKey'));
  assert.ok(!commandIds.has('marklingo.deleteAllTranslatedFiles'));
  assert.ok(!commandIds.has('marklingo.openrouter.setApiKey'));
  assert.ok(!commandIds.has('marklingo.openrouter.setModelId'));
  assert.ok(!commandIds.has('marklingo.setTargetLanguage'));
});

test('context menus expose markdown and folder translation actions', () => {
  const pkg = readPackageJson();
  const editorMenus = pkg.contributes.menus['editor/context'];
  const explorerMenus = pkg.contributes.menus['explorer/context'];

  const editorTranslate = editorMenus.find((item) => item.command === 'marklingo.translateCurrentMarkdown');
  assert.ok(editorTranslate, 'expected editor context menu translation command');
  assert.match(editorTranslate.when, /editorLangId == markdown/);
  assert.match(editorTranslate.when, /resourceExtname == \.md/);
  assert.match(editorTranslate.when, /resourceExtname == \.markdown/);
  assert.match(editorTranslate.group, /^marklingo@/);

  const explorerFileTranslate = explorerMenus.find((item) => item.command === 'marklingo.translateCurrentMarkdown');
  assert.ok(explorerFileTranslate, 'expected explorer file context menu translation command');
  assert.match(explorerFileTranslate.when, /!explorerResourceIsFolder/);
  assert.match(explorerFileTranslate.when, /isFileSystemResource/);
  assert.match(explorerFileTranslate.when, /resourceExtname == \.md/);
  assert.match(explorerFileTranslate.when, /resourceExtname == \.markdown/);
  assert.match(explorerFileTranslate.group, /^marklingo@/);

  const explorerFolderTranslate = explorerMenus.find((item) => item.command === 'marklingo.translateFolderMarkdown');
  assert.ok(explorerFolderTranslate, 'expected explorer folder context menu translation command');
  assert.match(explorerFolderTranslate.when, /explorerResourceIsFolder/);
  assert.match(explorerFolderTranslate.when, /isFileSystemResource/);
  assert.match(explorerFolderTranslate.group, /^marklingo@/);
});

test('folder translation command is hidden from the command palette', () => {
  const pkg = readPackageJson();
  const commandPaletteMenus = pkg.contributes.menus.commandPalette;
  const folderTranslate = commandPaletteMenus.find((item) => item.command === 'marklingo.translateFolderMarkdown');

  assert.ok(folderTranslate, 'expected folder translation command palette override');
  assert.equal(folderTranslate.when, 'false');
});

test('cleanup configuration keys match package configuration contributions', () => {
  const pkg = readPackageJson();
  const packageKeys = Object.keys(pkg.contributes.configuration.properties)
    .map((key) => key.replace(/^marklingo\./, ''))
    .sort();

  assert.deepEqual([...MARKLINGO_CONFIGURATION_KEYS].sort(), packageKeys);
});
