import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
  MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY,
  getDefaultTranslateKeys,
  getShortcutKeybindingSearchQuery,
  getDefaultShortcutKeys,
  getShortcutStateFromKeybindings,
  MAC_TRANSLATE_KEY,
  NON_MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY,
  NON_MAC_TRANSLATE_KEY,
  TRANSLATE_SHORTCUT,
} from '../out/webview/shortcutState.js';

test('uses macOS default shortcut on local darwin extension hosts', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'darwin' }),
    [MAC_TRANSLATE_KEY],
  );
  assert.equal(
    getShortcutKeybindingSearchQuery(TRANSLATE_SHORTCUT),
    '@command:marklingo.translateCurrentMarkdown',
  );
});

test('uses Windows/Linux default shortcut on local non-darwin extension hosts', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'linux' }),
    [NON_MAC_TRANSLATE_KEY],
  );
  assert.equal(
    getShortcutKeybindingSearchQuery(TRANSLATE_SHORTCUT),
    '@command:marklingo.translateCurrentMarkdown',
  );
});

test('uses current project cleanup default shortcuts per platform', () => {
  assert.deepEqual(
    getDefaultShortcutKeys(DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT, { extensionHostPlatform: 'darwin' }),
    [MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY],
  );
  assert.equal(
    getShortcutKeybindingSearchQuery(
      DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
    ),
    '@command:marklingo.deleteCurrentProjectTranslatedFiles',
  );
  assert.deepEqual(
    getDefaultShortcutKeys(DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT, { extensionHostPlatform: 'linux' }),
    [NON_MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY],
  );
  assert.equal(
    getShortcutKeybindingSearchQuery(
      DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
    ),
    '@command:marklingo.deleteCurrentProjectTranslatedFiles',
  );
});

test('keeps all platform defaults when the UI platform may differ from the remote extension host', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'linux', remoteName: 'ssh-remote' }),
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );
  assert.equal(
    getShortcutKeybindingSearchQuery(TRANSLATE_SHORTCUT),
    '@command:marklingo.translateCurrentMarkdown',
  );

  const state = getShortcutStateFromKeybindings([], [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY]);

  assert.equal(state.shortcutLabel, 'Option + Command + T (macOS) / Control + Alt + T (Windows/Linux)');
  assert.equal(state.shortcutStatus, 'Platform-specific default shortcuts for Markdown editors.');
  assert.equal(state.shortcutWarning, '');
});

test('keeps remaining platform defaults when only one remote default is removed', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'alt+cmd+t',
        command: '-marklingo.translateCurrentMarkdown',
      },
    ],
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );

  assert.equal(state.shortcutLabel, 'Control + Alt + T (Windows/Linux)');
  assert.equal(state.shortcutStatus, 'A platform default shortcut has been removed in user keybindings.');
  assert.equal(state.shortcutWarning, 'Open Keyboard Shortcuts to review platform-specific shortcuts.');
});

test('reports not assigned only when all remote platform defaults are removed', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'alt+cmd+t',
        command: '-marklingo.translateCurrentMarkdown',
      },
      {
        key: 'ctrl+alt+t',
        command: '-marklingo.translateCurrentMarkdown',
      },
    ],
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );

  assert.equal(state.shortcutLabel, 'Not assigned');
  assert.equal(state.shortcutStatus, 'All platform default shortcuts have been removed in user keybindings.');
  assert.equal(state.shortcutWarning, 'Open Keyboard Shortcuts to assign a new shortcut.');
});

test('detects conflicts against either platform default when running remotely', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'alt+cmd+t',
        command: 'workbench.action.tasks.runTask',
      },
    ],
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );

  assert.equal(state.shortcutLabel, 'Option + Command + T (macOS) / Control + Alt + T (Windows/Linux)');
  assert.equal(state.shortcutStatus, 'Potential user keybinding conflict: workbench.action.tasks.runTask');
  assert.equal(state.shortcutWarning, 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.');
});

test('does not report conflicts for a remote platform default that was removed', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'alt+cmd+t',
        command: '-marklingo.translateCurrentMarkdown',
      },
      {
        key: 'alt+cmd+t',
        command: 'workbench.action.tasks.runTask',
      },
    ],
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );

  assert.equal(state.shortcutLabel, 'Control + Alt + T (Windows/Linux)');
  assert.equal(state.shortcutStatus, 'A platform default shortcut has been removed in user keybindings.');
  assert.equal(state.shortcutWarning, 'Open Keyboard Shortcuts to review platform-specific shortcuts.');
});

test('user-assigned translate shortcut takes precedence over removed defaults', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'alt+cmd+t',
        command: '-marklingo.translateCurrentMarkdown',
      },
      {
        key: 'ctrl+shift+t',
        command: 'marklingo.translateCurrentMarkdown',
      },
    ],
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
  );

  assert.equal(state.shortcutLabel, 'Control + Shift + T');
  assert.equal(state.shortcutStatus, 'Assigned in user keybindings.');
  assert.equal(state.shortcutWarning, '');
  assert.equal(
    getShortcutKeybindingSearchQuery(TRANSLATE_SHORTCUT),
    '@command:marklingo.translateCurrentMarkdown',
    'Edit should find the command instead of the manifest default key',
  );
});

test('warns about the known macOS Dock shortcut for the cleanup default', () => {
  const state = getShortcutStateFromKeybindings(
    [],
    [MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY],
    DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
  );

  assert.equal(state.shortcutLabel, 'Option + Command + D');
  assert.equal(state.shortcutStatus, 'Default shortcut for current project cleanup.');
  assert.equal(
    state.shortcutWarning,
    'If MarkLingo cannot use this shortcut, macOS may already use it for Dock. Change it in System Settings > Keyboard > Keyboard Shortcuts... > Dock > Turn Dock hiding on/off.',
  );
});

test('does not show the macOS Dock warning after assigning a custom cleanup shortcut', () => {
  const state = getShortcutStateFromKeybindings(
    [
      {
        key: 'ctrl+shift+d',
        command: 'marklingo.deleteCurrentProjectTranslatedFiles',
      },
    ],
    [MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY],
    DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
  );

  assert.equal(state.shortcutLabel, 'Control + Shift + D');
  assert.equal(state.shortcutStatus, 'Assigned in user keybindings.');
  assert.equal(state.shortcutWarning, '');
});
