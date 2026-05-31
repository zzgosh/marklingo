export const TRANSLATE_COMMAND = 'marklingo.translateCurrentMarkdown';
export const MAC_TRANSLATE_KEY = 'alt+cmd+t';
export const NON_MAC_TRANSLATE_KEY = 'ctrl+alt+t';

export type UserKeybinding = {
  key?: string;
  command?: string;
  when?: string;
};

export type ShortcutState = {
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
};

export function getDefaultTranslateKeys(options: { extensionHostPlatform: NodeJS.Platform; remoteName?: string }): string[] {
  // Remote extension hosts do not reveal the local UI OS that resolves keybindings.
  if (options.remoteName) return [MAC_TRANSLATE_KEY, NON_MAC_TRANSLATE_KEY];
  return options.extensionHostPlatform === 'darwin' ? [MAC_TRANSLATE_KEY] : [NON_MAC_TRANSLATE_KEY];
}

export function normalizeKeybinding(key: string): string {
  const modifierOrder = ['ctrl', 'shift', 'alt', 'cmd'];
  return key
    .toLowerCase()
    .replace(/\boption\b/g, 'alt')
    .replace(/\bcommand\b/g, 'cmd')
    .replace(/\bmeta\b/g, 'cmd')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split('+').filter(Boolean);
      const modifiers = pieces
        .filter((piece) => modifierOrder.includes(piece))
        .sort((a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b));
      const keys = pieces.filter((piece) => !modifierOrder.includes(piece));
      return [...modifiers, ...keys].join('+');
    })
    .join(' ');
}

function getKeybindingLabelStyle(key: string): 'mac' | 'nonMac' {
  return normalizeKeybinding(key).split('+').includes('cmd') ? 'mac' : 'nonMac';
}

export function formatKeybinding(key: string): string {
  const labelStyle = getKeybindingLabelStyle(key);
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((chord) => chord
      .split('+')
      .map((part) => {
        if (part === 'alt') return labelStyle === 'mac' ? 'Option' : 'Alt';
        if (part === 'cmd') return labelStyle === 'mac' ? 'Command' : 'Meta';
        if (part === 'ctrl') return 'Control';
        if (part === 'shift') return 'Shift';
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .join(' + '))
    .join(' ');
}

function formatDefaultKeyLabel(defaultKeys: string[], options: { includePlatformLabels?: boolean } = {}): string {
  if (defaultKeys.length === 1 && !options.includePlatformLabels) return formatKeybinding(defaultKeys[0]);
  return defaultKeys
    .map((key) => {
      const platform = normalizeKeybinding(key) === MAC_TRANSLATE_KEY ? 'macOS' : 'Windows/Linux';
      return `${formatKeybinding(key)} (${platform})`;
    })
    .join(' / ');
}

function getKeybindingCommand(binding: UserKeybinding): string {
  return typeof binding.command === 'string' ? binding.command : '';
}

function getKeybindingKey(binding: UserKeybinding): string {
  return typeof binding.key === 'string' ? binding.key : '';
}

function describeConflicts(bindings: UserKeybinding[]): string {
  return bindings
    .map((binding) => {
      const command = getKeybindingCommand(binding);
      return binding.when ? `${command} (${binding.when})` : command;
    })
    .slice(0, 3)
    .join(', ');
}

export function getShortcutStateFromKeybindings(keybindings: UserKeybinding[], defaultKeys: string[]): ShortcutState {
  const normalizedDefaultKeys = new Set(defaultKeys.map(normalizeKeybinding));
  const removedDefaultKeys = new Set(
    keybindings
      .filter((binding) => getKeybindingCommand(binding) === `-${TRANSLATE_COMMAND}`)
      .map((binding) => normalizeKeybinding(getKeybindingKey(binding)))
      .filter((key) => normalizedDefaultKeys.has(key)),
  );
  const activeDefaultKeys = defaultKeys.filter((key) => !removedDefaultKeys.has(normalizeKeybinding(key)));
  const commandBindings = keybindings.filter(
    (binding) => getKeybindingCommand(binding) === TRANSLATE_COMMAND && getKeybindingKey(binding),
  );
  const assignedBinding = commandBindings.at(-1);
  const allDefaultsRemoved = defaultKeys.length > 0 && activeDefaultKeys.length === 0;
  const someDefaultsRemoved = removedDefaultKeys.size > 0;
  const displayedKey = assignedBinding
    ? getKeybindingKey(assignedBinding)
    : formatDefaultKeyLabel(activeDefaultKeys, { includePlatformLabels: defaultKeys.length > 1 });
  const normalizedDisplayedKeys = assignedBinding
    ? new Set([normalizeKeybinding(displayedKey)])
    : new Set(activeDefaultKeys.map(normalizeKeybinding));
  const conflictingBindings = keybindings.filter((binding) => {
    const key = getKeybindingKey(binding);
    const command = getKeybindingCommand(binding);
    if (!key || !command || command.startsWith('-') || command === TRANSLATE_COMMAND) return false;
    return normalizedDisplayedKeys.has(normalizeKeybinding(key));
  });

  if (allDefaultsRemoved && !assignedBinding) {
    return {
      shortcutLabel: 'Not assigned',
      shortcutStatus: defaultKeys.length > 1
        ? 'All platform default shortcuts have been removed in user keybindings.'
        : 'Default shortcut has been removed in user keybindings.',
      shortcutWarning: 'Open Keyboard Shortcuts to assign a new shortcut.',
    };
  }

  if (conflictingBindings.length > 0) {
    const commands = describeConflicts(conflictingBindings);
    return {
      shortcutLabel: assignedBinding ? formatKeybinding(displayedKey) : displayedKey,
      shortcutStatus: `Potential user keybinding conflict: ${commands}`,
      shortcutWarning: 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.',
    };
  }

  if (someDefaultsRemoved && !assignedBinding) {
    return {
      shortcutLabel: displayedKey,
      shortcutStatus: 'A platform default shortcut has been removed in user keybindings.',
      shortcutWarning: 'Open Keyboard Shortcuts to review platform-specific shortcuts.',
    };
  }

  return {
    shortcutLabel: assignedBinding ? formatKeybinding(displayedKey) : displayedKey,
    shortcutStatus: assignedBinding
      ? 'Assigned in user keybindings.'
      : defaultKeys.length > 1
        ? 'Platform-specific default shortcuts for Markdown editors.'
        : 'Default shortcut for Markdown editors.',
    shortcutWarning: '',
  };
}
