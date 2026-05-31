import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultTranslateKeys,
  getShortcutStateFromKeybindings,
  MAC_TRANSLATE_KEY,
  NON_MAC_TRANSLATE_KEY,
} from '../out/webview/shortcutState.js';

test('uses macOS default shortcut on local darwin extension hosts', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'darwin' }),
    [MAC_TRANSLATE_KEY],
  );
});

test('uses Windows/Linux default shortcut on local non-darwin extension hosts', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'linux' }),
    [NON_MAC_TRANSLATE_KEY],
  );
});

test('keeps all platform defaults when the UI platform may differ from the remote extension host', () => {
  assert.deepEqual(
    getDefaultTranslateKeys({ extensionHostPlatform: 'linux', remoteName: 'ssh-remote' }),
    [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY],
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
});
