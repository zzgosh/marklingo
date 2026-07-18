export const TRANSLATE_COMMAND = 'marklingo.translateCurrentMarkdown';
export const DELETE_CURRENT_PROJECT_TRANSLATED_FILES_COMMAND = 'marklingo.deleteCurrentProjectTranslatedFiles';
export const MAC_TRANSLATE_KEY = 'alt+cmd+t';
export const NON_MAC_TRANSLATE_KEY = 'ctrl+alt+t';
export const MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY = 'alt+cmd+d';
export const NON_MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY = 'ctrl+alt+d';

export type ShortcutId = 'translateCurrentMarkdown' | 'deleteCurrentProjectTranslatedFiles';

export type ShortcutDefinition = {
  id: ShortcutId;
  command: string;
  title: string;
  macKey: string;
  nonMacKey: string;
  defaultStatus: string;
  platformDefaultStatus: string;
  macSystemWarning?: string;
};

export const TRANSLATE_SHORTCUT: ShortcutDefinition = {
  id: 'translateCurrentMarkdown',
  command: TRANSLATE_COMMAND,
  title: 'Translate Current Markdown',
  macKey: MAC_TRANSLATE_KEY,
  nonMacKey: NON_MAC_TRANSLATE_KEY,
  defaultStatus: 'Default shortcut for Markdown editors.',
  platformDefaultStatus: 'Platform-specific default shortcuts for Markdown editors.',
};

export const DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT: ShortcutDefinition = {
  id: 'deleteCurrentProjectTranslatedFiles',
  command: DELETE_CURRENT_PROJECT_TRANSLATED_FILES_COMMAND,
  title: 'Delete Current Project Translated Files',
  macKey: MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY,
  nonMacKey: NON_MAC_DELETE_CURRENT_PROJECT_TRANSLATED_FILES_KEY,
  defaultStatus: 'Default shortcut for current project cleanup.',
  platformDefaultStatus: 'Platform-specific default shortcuts for current project cleanup.',
  macSystemWarning: 'If MarkLingo cannot use this shortcut, macOS may already use it for Dock. Change it in System Settings > Keyboard > Keyboard Shortcuts... > Dock > Turn Dock hiding on/off.',
};

export const SHORTCUT_DEFINITIONS = [
  TRANSLATE_SHORTCUT,
  DELETE_CURRENT_PROJECT_TRANSLATED_FILES_SHORTCUT,
] as const;

export type UserKeybinding = {
  key?: string;
  command?: string;
  when?: string;
};

export type ShortcutState = {
  id: ShortcutId;
  title: string;
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
};

export function getDefaultTranslateKeys(options: { extensionHostPlatform: NodeJS.Platform; remoteName?: string }): string[] {
  return getDefaultShortcutKeys(TRANSLATE_SHORTCUT, options);
}

export function getDefaultShortcutKeys(
  definition: ShortcutDefinition,
  options: { extensionHostPlatform: NodeJS.Platform; remoteName?: string },
): string[] {
  // Remote extension hosts do not reveal the local UI OS that resolves keybindings.
  if (options.remoteName) return [definition.macKey, definition.nonMacKey];
  return options.extensionHostPlatform === 'darwin' ? [definition.macKey] : [definition.nonMacKey];
}

export function getShortcutKeybindingSearchQuery(
  definition: ShortcutDefinition,
): string {
  return `@command:${definition.command}`;
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
      const platform = normalizeKeybinding(key).includes('cmd') ? 'macOS' : 'Windows/Linux';
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

function getDefaultSystemWarning(
  definition: ShortcutDefinition,
  activeDefaultKeys: string[],
  assignedBinding: UserKeybinding | undefined,
): string {
  if (!definition.macSystemWarning || assignedBinding) return '';
  return activeDefaultKeys.some((key) => normalizeKeybinding(key) === normalizeKeybinding(definition.macKey))
    ? definition.macSystemWarning
    : '';
}

export function getShortcutStateFromKeybindings(
  keybindings: UserKeybinding[],
  defaultKeys: string[],
  definition: ShortcutDefinition = TRANSLATE_SHORTCUT,
): ShortcutState {
  const normalizedDefaultKeys = new Set(defaultKeys.map(normalizeKeybinding));
  const removedDefaultKeys = new Set(
    keybindings
      .filter((binding) => getKeybindingCommand(binding) === `-${definition.command}`)
      .map((binding) => normalizeKeybinding(getKeybindingKey(binding)))
      .filter((key) => normalizedDefaultKeys.has(key)),
  );
  const activeDefaultKeys = defaultKeys.filter((key) => !removedDefaultKeys.has(normalizeKeybinding(key)));
  const commandBindings = keybindings.filter(
    (binding) => getKeybindingCommand(binding) === definition.command && getKeybindingKey(binding),
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
    if (!key || !command || command.startsWith('-') || command === definition.command) return false;
    return normalizedDisplayedKeys.has(normalizeKeybinding(key));
  });

  if (allDefaultsRemoved && !assignedBinding) {
    return {
      id: definition.id,
      title: definition.title,
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
      id: definition.id,
      title: definition.title,
      shortcutLabel: assignedBinding ? formatKeybinding(displayedKey) : displayedKey,
      shortcutStatus: `Potential user keybinding conflict: ${commands}`,
      shortcutWarning: 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.',
    };
  }

  if (someDefaultsRemoved && !assignedBinding) {
    return {
      id: definition.id,
      title: definition.title,
      shortcutLabel: displayedKey,
      shortcutStatus: 'A platform default shortcut has been removed in user keybindings.',
      shortcutWarning: 'Open Keyboard Shortcuts to review platform-specific shortcuts.',
    };
  }

  return {
    id: definition.id,
    title: definition.title,
    shortcutLabel: assignedBinding ? formatKeybinding(displayedKey) : displayedKey,
    shortcutStatus: assignedBinding
      ? 'Assigned in user keybindings.'
      : defaultKeys.length > 1
        ? definition.platformDefaultStatus
        : definition.defaultStatus,
    shortcutWarning: getDefaultSystemWarning(definition, activeDefaultKeys, assignedBinding),
  };
}

export function getShortcutStatesFromKeybindings(
  keybindings: UserKeybinding[],
  options: { extensionHostPlatform: NodeJS.Platform; remoteName?: string },
): ShortcutState[] {
  return SHORTCUT_DEFINITIONS.map((definition) => getShortcutStateFromKeybindings(
    keybindings,
    getDefaultShortcutKeys(definition, options),
    definition,
  ));
}
