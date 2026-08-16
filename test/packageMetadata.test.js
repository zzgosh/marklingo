import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKLINGO_CONFIGURATION_KEYS } from '../out/configurationKeys.js';

function readPackageJson() {
  return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function placeholderKey(value) {
  const match = /^%([^%]+)%$/.exec(value);
  return match?.[1];
}

function indexedPlaceholders(value) {
  return [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
}

function assertExcludesTranslatedOutput(whenClause) {
  assert.ok(
    whenClause.includes('!(resourceFilename =~ /_mdt[.](md|markdown)$/i)'),
    'expected translated Markdown outputs to be hidden from this menu',
  );
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
  assert.equal(
    pkg.contributes.keybindings.some((item) => item.command === 'marklingo.translateExplorerMarkdownFile'),
    false,
  );
  assert.equal(
    pkg.contributes.keybindings.some((item) => item.command === 'marklingo.translateSelectedMarkdownResources'),
    false,
  );
});

test('current project translated file cleanup keybinding is available for file editors', () => {
  const pkg = readPackageJson();
  const binding = pkg.contributes.keybindings.find((item) => item.command === 'marklingo.deleteCurrentProjectTranslatedFiles');

  assert.ok(binding, 'expected current project cleanup command keybinding');
  assert.equal(binding.key, 'ctrl+alt+d');
  assert.equal(binding.mac, 'alt+cmd+d');
  assert.equal(binding.win, 'ctrl+alt+d');
  assert.equal(binding.linux, 'ctrl+alt+d');
  assert.match(binding.when, /editorTextFocus/);
  assert.match(binding.when, /resourceScheme == file/);
});

test('registered command contributions include user-facing actions', () => {
  const pkg = readPackageJson();
  const commandIds = new Set(pkg.contributes.commands.map((item) => item.command));

  assert.deepEqual([...commandIds].sort(), [
    'marklingo.deleteCurrentProjectTranslatedFiles',
    'marklingo.ignoreTranslatedFilesInGit',
    'marklingo.openSettings',
    'marklingo.translateCurrentMarkdown',
    'marklingo.translateCurrentMarkdownFull',
    'marklingo.translateExplorerMarkdownFile',
    'marklingo.translateFolderMarkdown',
    'marklingo.translateSelectedMarkdownResources',
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
  assertExcludesTranslatedOutput(editorTranslate.when);
  assert.match(editorTranslate.group, /^marklingo@/);

  const explorerFileTranslate = explorerMenus.find((item) => item.command === 'marklingo.translateExplorerMarkdownFile');
  assert.ok(explorerFileTranslate, 'expected explorer file context menu translation command');
  assert.match(explorerFileTranslate.when, /!listMultiSelection/);
  assert.match(explorerFileTranslate.when, /!explorerResourceIsFolder/);
  assert.match(explorerFileTranslate.when, /isFileSystemResource/);
  assert.match(explorerFileTranslate.when, /resourceExtname == \.md/);
  assert.match(explorerFileTranslate.when, /resourceExtname == \.markdown/);
  assertExcludesTranslatedOutput(explorerFileTranslate.when);
  assert.match(explorerFileTranslate.group, /^marklingo@/);

  const explorerSelectionTranslate = explorerMenus.find((item) => item.command === 'marklingo.translateSelectedMarkdownResources');
  assert.ok(explorerSelectionTranslate, 'expected explorer multi-selection translation command');
  assert.ok(explorerSelectionTranslate.when.includes('listMultiSelection'));
  assert.ok(!explorerSelectionTranslate.when.includes('!listMultiSelection'));
  assert.match(explorerSelectionTranslate.when, /isFileSystemResource/);
  assert.match(explorerSelectionTranslate.when, /resourceExtname == \.md/);
  assert.match(explorerSelectionTranslate.when, /resourceExtname == \.markdown/);
  assertExcludesTranslatedOutput(explorerSelectionTranslate.when);
  assert.match(explorerSelectionTranslate.group, /^marklingo@/);

  const explorerFolderTranslate = explorerMenus.find((item) => item.command === 'marklingo.translateFolderMarkdown');
  assert.ok(explorerFolderTranslate, 'expected explorer folder context menu translation command');
  assert.match(explorerFolderTranslate.when, /!listMultiSelection/);
  assert.match(explorerFolderTranslate.when, /explorerResourceIsFolder/);
  assert.match(explorerFolderTranslate.when, /isFileSystemResource/);
  assert.match(explorerFolderTranslate.group, /^marklingo@/);
});

test('explorer-only translation commands are hidden from the command palette', () => {
  const pkg = readPackageJson();
  const commandPaletteMenus = pkg.contributes.menus.commandPalette;
  const explorerFileTranslate = commandPaletteMenus.find((item) => item.command === 'marklingo.translateExplorerMarkdownFile');
  const selectedResourcesTranslate = commandPaletteMenus.find((item) => item.command === 'marklingo.translateSelectedMarkdownResources');
  const folderTranslate = commandPaletteMenus.find((item) => item.command === 'marklingo.translateFolderMarkdown');

  assert.ok(explorerFileTranslate, 'expected explorer file translation command palette override');
  assert.equal(explorerFileTranslate.when, 'false');
  assert.ok(selectedResourcesTranslate, 'expected selected resources translation command palette override');
  assert.equal(selectedResourcesTranslate.when, 'false');
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

test('provider enum exposes only the supported provider presets', () => {
  const pkg = readPackageJson();
  const providerEnum = pkg.contributes.configuration.properties['marklingo.openrouter.provider'].enum;

  assert.deepEqual(providerEnum, [
    'openrouter',
    'openai',
    'deepseek',
    'moonshot',
    'glm',
    'xiaomiMimo',
    'openaiCompatible',
  ]);
});

test('manifest user-facing strings resolve through matching English and Simplified Chinese catalogs', () => {
  const pkg = readPackageJson();
  const english = readJson('../package.nls.json');
  const simplifiedChinese = readJson('../package.nls.zh-cn.json');
  const properties = Object.values(pkg.contributes.configuration.properties);
  const localizedValues = [
    pkg.displayName,
    pkg.description,
    pkg.capabilities.untrustedWorkspaces.description,
    pkg.capabilities.virtualWorkspaces.description,
    ...pkg.contributes.commands.map((command) => command.title),
    pkg.contributes.configuration.title,
    ...properties.map((property) => property.description),
    ...properties.flatMap((property) => property.enumDescriptions ?? []),
  ];

  assert.equal(pkg.l10n, './l10n');
  assert.deepEqual(Object.keys(simplifiedChinese).sort(), Object.keys(english).sort());
  for (const value of localizedValues) {
    const key = placeholderKey(value);
    assert.ok(key, `expected manifest localization placeholder, got ${JSON.stringify(value)}`);
    assert.equal(typeof english[key], 'string', `missing English manifest string for ${key}`);
    assert.equal(typeof simplifiedChinese[key], 'string', `missing Simplified Chinese manifest string for ${key}`);
  }
});

test('runtime localization bundles have matching keys and preserve indexed placeholders', () => {
  const english = readJson('../l10n/bundle.l10n.json');
  const simplifiedChinese = readJson('../l10n/bundle.l10n.zh-cn.json');

  assert.deepEqual(Object.keys(simplifiedChinese).sort(), Object.keys(english).sort());
  assert.ok(Object.keys(english).length > 100, 'expected broad runtime UI localization coverage');
  assert.ok(
    Object.keys(english).filter((key) => english[key] !== simplifiedChinese[key]).length > 100,
    'expected Simplified Chinese runtime translations',
  );
  for (const key of Object.keys(english)) {
    assert.equal(english[key], key, `default runtime string must preserve its English message key: ${key}`);
    assert.deepEqual(
      indexedPlaceholders(simplifiedChinese[key]),
      indexedPlaceholders(english[key]),
      `placeholder mismatch for ${key}`,
    );
  }
});
