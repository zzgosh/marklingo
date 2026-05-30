import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  deleteOpenRouterApiKey,
  hasOpenRouterApiKey,
  storeOpenRouterApiKey,
  DEFAULT_OPENROUTER_MODEL_ID,
} from '../services/openRouterClient.js';
import { clearExtensionDataScopes } from '../commands/clearExtensionData.js';
import { getOutputLocation, getProjectsStorageRoot, type OutputLocation } from '../storage/paths.js';

const CUSTOM_TARGET_LANGUAGE_LABEL = 'Custom...';
const TARGET_LANGUAGE_OPTIONS = [
  '简体中文',
  '繁体中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
  'Deutsch',
  CUSTOM_TARGET_LANGUAGE_LABEL,
];
const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';
const TRANSLATE_COMMAND = 'marklingo.translateCurrentMarkdown';
const DEFAULT_TRANSLATE_KEY = 'ctrl+alt+cmd+t';
const API_KEY_MASK = '•'.repeat(16);

// Settings the webview is allowed to write directly. Free-text fields use an inline Save button;
// dropdowns save on change. The full system prompt, context-usage ratio and fallback-block count
// remain configurable via settings.json but are intentionally not surfaced here.
const UPDATABLE_SETTING_KEYS = new Set<string>([
  'openrouter.baseUrl',
  'openrouter.modelId',
  'translation.targetLanguage',
  'translation.targetLanguageCustom',
  'translation.customPrompt',
  'storage.outputLocation',
]);

type SettingsState = {
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
  baseUrl: string;
  hasApiKey: boolean;
  modelId: string;
  targetLanguage: string;
  targetLanguageCustom: string;
  customPrompt: string;
  outputLocation: OutputLocation;
  storageRoot: string;
};

type UserKeybinding = {
  key?: string;
  command?: string;
  when?: string;
};

let currentPanel: vscode.WebviewPanel | undefined;

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripJsonComments(text: string): string {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }

    output += char;
  }
  return output.replace(/,\s*([}\]])/g, '$1');
}

function normalizeKeybinding(key: string): string {
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

function formatKeybinding(key: string): string {
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((chord) => chord
      .split('+')
      .map((part) => {
        if (part === 'alt') return 'Option';
        if (part === 'cmd') return 'Command';
        if (part === 'ctrl') return 'Control';
        if (part === 'shift') return 'Shift';
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .join(' + '))
    .join(' ');
}

function isUserKeybinding(item: unknown): item is UserKeybinding {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  return (
    (value.key === undefined || typeof value.key === 'string') &&
    (value.command === undefined || typeof value.command === 'string') &&
    (value.when === undefined || typeof value.when === 'string')
  );
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

function getUserKeybindingsUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'keybindings.json');
}

async function readUserKeybindings(context: vscode.ExtensionContext): Promise<UserKeybinding[]> {
  try {
    const raw = await vscode.workspace.fs.readFile(getUserKeybindingsUri(context));
    const parsed = JSON.parse(stripJsonComments(Buffer.from(raw).toString('utf8'))) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isUserKeybinding) : [];
  } catch {
    return [];
  }
}

async function getShortcutState(context: vscode.ExtensionContext): Promise<Pick<SettingsState, 'shortcutLabel' | 'shortcutStatus' | 'shortcutWarning'>> {
  const keybindings = await readUserKeybindings(context);
  const commandBindings = keybindings.filter(
    (binding) => getKeybindingCommand(binding) === TRANSLATE_COMMAND && getKeybindingKey(binding),
  );
  const assignedBinding = commandBindings.at(-1);
  const disabledDefault = keybindings.some(
    (binding) => getKeybindingCommand(binding) === `-${TRANSLATE_COMMAND}` && normalizeKeybinding(getKeybindingKey(binding)) === DEFAULT_TRANSLATE_KEY,
  );
  const displayedKey = assignedBinding ? getKeybindingKey(assignedBinding) : DEFAULT_TRANSLATE_KEY;
  const normalizedDisplayedKey = normalizeKeybinding(displayedKey);
  const conflictingBindings = keybindings.filter((binding) => {
    const key = getKeybindingKey(binding);
    const command = getKeybindingCommand(binding);
    if (!key || !command || command.startsWith('-') || command === TRANSLATE_COMMAND) return false;
    return normalizeKeybinding(key) === normalizedDisplayedKey;
  });

  if (disabledDefault && !assignedBinding) {
    return {
      shortcutLabel: 'Not assigned',
      shortcutStatus: 'Default shortcut has been removed in user keybindings.',
      shortcutWarning: 'Open Keyboard Shortcuts to assign a new shortcut.',
    };
  }

  if (conflictingBindings.length > 0) {
    const commands = describeConflicts(conflictingBindings);
    return {
      shortcutLabel: formatKeybinding(displayedKey),
      shortcutStatus: `Potential user keybinding conflict: ${commands}`,
      shortcutWarning: 'If VS Code routes this key to another command, MarkLingo cannot show a prompt because its command is not invoked.',
    };
  }

  return {
    shortcutLabel: formatKeybinding(displayedKey),
    shortcutStatus: assignedBinding ? 'Assigned in user keybindings.' : 'Default shortcut for Markdown editors.',
    shortcutWarning: '',
  };
}

async function readSettingsState(context: vscode.ExtensionContext): Promise<SettingsState> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const shortcutState = await getShortcutState(context);
  return {
    ...shortcutState,
    baseUrl: cfg.get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1'),
    hasApiKey: await hasOpenRouterApiKey(context),
    modelId: (cfg.get<string>('openrouter.modelId', DEFAULT_OPENROUTER_MODEL_ID) ?? '').trim() || DEFAULT_OPENROUTER_MODEL_ID,
    targetLanguage: cfg.get<string>('translation.targetLanguage', '简体中文'),
    targetLanguageCustom: cfg.get<string>('translation.targetLanguageCustom', ''),
    customPrompt: cfg.get<string>('translation.customPrompt', ''),
    outputLocation: getOutputLocation(),
    storageRoot: getProjectsStorageRoot(context).fsPath,
  };
}

function coerceSettingValue(key: string, raw: unknown): unknown {
  if (key === 'storage.outputLocation') {
    return raw === 'privateStorage' ? 'privateStorage' : 'sourceFolder';
  }
  const value = String(raw ?? '').trim();
  if (key === 'translation.targetLanguage') return value || '简体中文';
  return value;
}

async function updateSingleSetting(context: vscode.ExtensionContext, key: string, raw: unknown): Promise<unknown> {
  if (!UPDATABLE_SETTING_KEYS.has(key)) {
    throw new Error(`MarkLingo: Unsupported setting "${key}".`);
  }
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const value = coerceSettingValue(key, raw);
  await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  if (key === 'translation.targetLanguage' || key === 'translation.targetLanguageCustom') {
    await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
  }
  return value;
}

function renderOptions(selected: string): string {
  return TARGET_LANGUAGE_OPTIONS.map((option) => {
    const selectedAttr = option === selected ? ' selected' : '';
    return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
  }).join('');
}

function getHtml(webview: vscode.Webview, state: SettingsState): string {
  const nonce = getNonce();
  const outputPrivateSelected = state.outputLocation === 'privateStorage' ? ' selected' : '';
  const outputSourceSelected = state.outputLocation === 'sourceFolder' ? ' selected' : '';
  const apiKeyStatus = state.hasApiKey ? 'Saved' : 'Not saved';
  const apiKeyPlaceholder = state.hasApiKey ? API_KEY_MASK : 'Enter API key';
  const clearDisabled = state.hasApiKey ? '' : ' disabled';
  const customLanguageHidden = state.targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL ? '' : ' style="display:none"';
  const shortcutWarningHtml = state.shortcutWarning
    ? `<div class="notice warning">${escapeHtml(state.shortcutWarning)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarkLingo Settings</title>
  <style>
    :root {
      color-scheme: dark light;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --panel: var(--vscode-sideBar-background);
      --border: var(--vscode-widget-border);
      --input: var(--vscode-input-background);
      --button: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --accent: var(--vscode-focusBorder);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 13px/1.45 var(--vscode-font-family);
    }
    .shell {
      min-height: 100vh;
    }
    main {
      width: min(100%, 800px);
      padding: 56px 28px 72px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 28px;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
    }
    h2 {
      margin: 34px 0 8px;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: 0;
    }
    h2.danger-title { color: var(--danger); }
    p {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: color-mix(in srgb, var(--panel) 80%, transparent);
    }
    .card.danger { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 1.15fr);
      gap: 22px;
      align-items: center;
      padding: 16px 18px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }
    .row:last-child { border-bottom: 0; }
    .label {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .help {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .help.path {
      margin-top: 6px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    input, select, textarea {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input);
      color: var(--fg);
      padding: 7px 10px;
      font: inherit;
    }
    select {
      padding-right: 32px;
    }
    textarea {
      min-height: 150px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }
    .inline {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }
    .stack {
      display: grid;
      gap: 10px;
    }
    .field-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 10px;
    }
    button {
      min-height: 34px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      background: var(--button);
      color: var(--button-fg);
      font: inherit;
      cursor: pointer;
    }
    button.secondary {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
    }
    button.danger {
      background: color-mix(in srgb, var(--danger) 16%, transparent);
      color: var(--danger);
    }
    button:disabled { cursor: default; }
    button.save-btn { min-width: 68px; }
    button.save-btn:disabled {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--muted);
    }
    button.save-btn.saved {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--fg);
    }
    button.danger:disabled {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--muted);
    }
    .saved-hint {
      color: var(--muted);
      font-size: 12px;
      opacity: 0;
      transition: opacity 120ms ease;
      white-space: nowrap;
    }
    .saved-hint.visible { opacity: 1; }
    .status-text { color: var(--muted); }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .check-input {
      width: 16px;
      height: 16px;
      min-height: 16px;
      accent-color: var(--accent);
    }
    .switch {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      color: var(--muted);
      background: color-mix(in srgb, var(--fg) 7%, transparent);
    }
    .notice.warning {
      border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
      color: var(--fg);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
    }
    @media (max-width: 760px) {
      main { padding: 28px 18px 54px; }
      .row { grid-template-columns: 1fr; gap: 10px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <main>
      <h1>Settings</h1>
      <div id="settings">
        <h2>General</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Translate Shortcut</div>
              <div class="help" id="shortcut-status">${escapeHtml(state.shortcutStatus)}</div>
            </div>
            <div class="stack">
              <span class="status-text" id="shortcut-label">${escapeHtml(state.shortcutLabel)}</span>
              <div id="shortcut-warning">${shortcutWarningHtml}</div>
              <div class="field-actions">
                <button class="secondary" id="open-keyboard-shortcuts" type="button">Open Keyboard Shortcuts</button>
              </div>
            </div>
          </div>
        </section>

        <h2>Provider</h2>
        <p>The API key is stored once in VS Code SecretStorage and sent to whatever Base URL is configured.</p>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Base URL</div>
              <div class="help">Official endpoint is used by default.</div>
            </div>
            <div class="inline">
              <input id="baseUrl" value="${escapeHtml(state.baseUrl)}">
              <button class="save-btn" type="button" data-field="baseUrl" data-key="openrouter.baseUrl" disabled>Save</button>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">API Key</div>
              <div class="help">Stored securely in VS Code SecretStorage.</div>
            </div>
            <div class="stack">
              <div class="inline">
                <input id="apiKey" type="password" autocomplete="off" placeholder="${escapeHtml(apiKeyPlaceholder)}">
                <button class="save-btn" type="button" id="save-key" disabled>Save</button>
              </div>
              <div class="field-actions">
                <span class="status-text" id="apiKeyStatus">${escapeHtml(apiKeyStatus)}</span>
                <button class="secondary" type="button" id="clear-key"${clearDisabled}>Clear</button>
              </div>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Model ID</div>
              <div class="help">Default: ${escapeHtml(DEFAULT_OPENROUTER_MODEL_ID)}</div>
            </div>
            <div class="inline">
              <input id="modelId" value="${escapeHtml(state.modelId)}">
              <button class="save-btn" type="button" data-field="modelId" data-key="openrouter.modelId" disabled>Save</button>
            </div>
          </div>
        </section>

        <h2>Translation</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Target Language</div>
              <div class="help">Used for new translation requests.</div>
            </div>
            <div class="inline">
              <select id="targetLanguage">${renderOptions(state.targetLanguage)}</select>
              <span class="saved-hint" id="targetLanguage-hint"></span>
            </div>
          </div>
          <div class="row" id="customLanguageRow"${customLanguageHidden}>
            <div>
              <div class="label">Custom Language</div>
              <div class="help">Shown when target language is Custom.</div>
            </div>
            <div class="inline">
              <input id="targetLanguageCustom" value="${escapeHtml(state.targetLanguageCustom)}">
              <button class="save-btn" type="button" data-field="targetLanguageCustom" data-key="translation.targetLanguageCustom" disabled>Save</button>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Custom Instructions</div>
              <div class="help">Extra terminology or style rules, appended after the built-in translation prompt. The base Markdown and placeholder protection always applies.</div>
            </div>
            <div class="stack">
              <textarea id="customPrompt" placeholder="e.g. Keep product names in English. Use a formal tone.">${escapeHtml(state.customPrompt)}</textarea>
              <div class="field-actions">
                <button class="save-btn" type="button" data-field="customPrompt" data-key="translation.customPrompt" disabled>Save</button>
              </div>
            </div>
          </div>
        </section>

        <h2>Output</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Translated File Location</div>
              <div class="help">Where translated Markdown files are written.</div>
            </div>
            <div class="inline">
              <select id="outputLocation">
                <option value="sourceFolder"${outputSourceSelected}>Next to the source file (*_mdt.md)</option>
                <option value="privateStorage"${outputPrivateSelected}>Extension storage (outside the workspace)</option>
              </select>
              <span class="saved-hint" id="outputLocation-hint"></span>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Private storage folder</div>
              <div class="help">Always stores MarkLingo's cache and metadata. When the location above is Extension storage, translated files are saved here too.</div>
              <div class="help path">${escapeHtml(state.storageRoot)}</div>
            </div>
            <div class="switch">
              <button class="secondary" id="reveal-storage" type="button">Reveal</button>
            </div>
          </div>
        </section>

        <h2 class="danger-title">Danger Zone</h2>
        <section class="card danger">
          <div class="row">
            <div>
              <div class="label">Clear Data</div>
              <div class="help">Select what to delete, then type CLEAR to confirm. This cannot be undone.</div>
            </div>
            <div class="stack">
              <label class="check"><input class="check-input" type="checkbox" id="clr-apiKeys" checked> Saved API key</label>
              <label class="check"><input class="check-input" type="checkbox" id="clr-settings" checked> MarkLingo settings</label>
              <label class="check"><input class="check-input" type="checkbox" id="clr-globalStorage" checked> Private cache &amp; metadata</label>
              <label class="check"><input class="check-input" type="checkbox" id="clr-workspaceOutputs"> Tracked translated files (*_mdt.md)</label>
              <div class="inline">
                <input id="clr-confirm" autocomplete="off" placeholder="Type CLEAR to confirm">
                <button class="danger" type="button" id="clear-data" disabled>Clear data</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const CUSTOM_LANGUAGE_LABEL = ${JSON.stringify(CUSTOM_TARGET_LANGUAGE_LABEL)};
    const API_KEY_MASK = ${JSON.stringify(API_KEY_MASK)};

    const textByKey = new Map();
    const instantByKey = new Map();
    const hintTimers = new Map();
    let nextSaveId = 1;

    document.querySelectorAll('.save-btn').forEach((button) => {
      const fieldId = button.getAttribute('data-field');
      const key = button.getAttribute('data-key');
      const input = fieldId ? document.getElementById(fieldId) : null;
      if (!input || !key) return;
      const state = { input, button, baseline: input.value, timer: undefined, pendingSaveId: undefined, pendingValue: undefined };
      textByKey.set(key, state);
      input.addEventListener('input', () => {
        if (state.timer) { clearTimeout(state.timer); state.timer = undefined; }
        button.classList.remove('saved');
        button.textContent = 'Save';
        button.disabled = input.value === state.baseline;
      });
      button.addEventListener('click', () => {
        if (input.value === state.baseline) return;
        const saveId = nextSaveId++;
        state.pendingSaveId = saveId;
        state.pendingValue = input.value;
        button.textContent = 'Saving...';
        button.disabled = true;
        vscode.postMessage({ type: 'updateSetting', key: key, value: input.value, saveId: saveId });
      });
    });

    function flashHint(hintId) {
      const hint = document.getElementById(hintId);
      if (!hint) return;
      hint.textContent = 'Saved';
      hint.classList.add('visible');
      if (hintTimers.has(hintId)) clearTimeout(hintTimers.get(hintId));
      hintTimers.set(hintId, setTimeout(() => {
        hint.classList.remove('visible');
        hintTimers.delete(hintId);
      }, 1800));
    }

    function registerInstant(id, key) {
      const control = document.getElementById(id);
      if (!control) return;
      instantByKey.set(key, id + '-hint');
      control.addEventListener('change', () => {
        vscode.postMessage({ type: 'updateSetting', key: key, value: control.value });
        if (id === 'targetLanguage') syncCustomLanguageVisibility(true);
      });
    }

    const targetLanguageSelect = document.getElementById('targetLanguage');
    const customLanguageRow = document.getElementById('customLanguageRow');
    const customLanguageInput = document.getElementById('targetLanguageCustom');
    function syncCustomLanguageVisibility(focus) {
      const isCustom = targetLanguageSelect && targetLanguageSelect.value === CUSTOM_LANGUAGE_LABEL;
      if (customLanguageRow) customLanguageRow.style.display = isCustom ? '' : 'none';
      if (isCustom && focus && customLanguageInput) customLanguageInput.focus();
    }

    registerInstant('targetLanguage', 'translation.targetLanguage');
    registerInstant('outputLocation', 'storage.outputLocation');
    syncCustomLanguageVisibility(false);

    function handleSaved(key, saveId, value) {
      const text = textByKey.get(key);
      if (text) {
        if (saveId !== undefined && text.pendingSaveId !== saveId) return;
        const pendingValue = text.pendingValue;
        const savedValue = typeof value === 'string' ? value : pendingValue;
        text.pendingSaveId = undefined;
        text.pendingValue = undefined;
        text.baseline = savedValue;
        if (text.timer) clearTimeout(text.timer);
        if (text.input.value === pendingValue) {
          text.input.value = savedValue;
          text.button.disabled = true;
          text.button.textContent = 'Saved';
          text.button.classList.add('saved');
          text.timer = setTimeout(() => {
            text.button.textContent = 'Save';
            text.button.classList.remove('saved');
            text.timer = undefined;
          }, 2500);
        } else {
          text.button.textContent = 'Save';
          text.button.classList.remove('saved');
          text.button.disabled = text.input.value === text.baseline;
          text.timer = undefined;
        }
        return;
      }
      const hintId = instantByKey.get(key);
      if (hintId) flashHint(hintId);
    }

    function handleSaveFailed(key, saveId) {
      const text = textByKey.get(key);
      if (!text || (saveId !== undefined && text.pendingSaveId !== saveId)) return;
      text.pendingSaveId = undefined;
      text.pendingValue = undefined;
      text.button.textContent = 'Save';
      text.button.classList.remove('saved');
      text.button.disabled = text.input.value === text.baseline;
    }

    // API key: inline password entry. The value is posted once and never stored in webview state.
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('save-key');
    const clearKeyBtn = document.getElementById('clear-key');
    const apiKeyStatusEl = document.getElementById('apiKeyStatus');

    function applyApiKeyStatus(hasKey) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = hasKey ? API_KEY_MASK : 'Enter API key';
      apiKeyStatusEl.textContent = hasKey ? 'Saved' : 'Not saved';
      clearKeyBtn.disabled = !hasKey;
      saveKeyBtn.disabled = true;
      saveKeyBtn.textContent = 'Save';
      saveKeyBtn.classList.remove('saved');
    }

    apiKeyInput.addEventListener('input', () => {
      saveKeyBtn.classList.remove('saved');
      saveKeyBtn.textContent = 'Save';
      saveKeyBtn.disabled = apiKeyInput.value.length === 0;
    });
    saveKeyBtn.addEventListener('click', () => {
      if (!apiKeyInput.value) return;
      vscode.postMessage({ type: 'setApiKey', value: apiKeyInput.value });
    });
    clearKeyBtn.addEventListener('click', () => vscode.postMessage({ type: 'resetApiKey' }));

    // Clear Data: scope selection + typed confirmation, fully in-panel.
    const clearCheckIds = ['clr-apiKeys', 'clr-settings', 'clr-globalStorage', 'clr-workspaceOutputs'];
    const clearConfirm = document.getElementById('clr-confirm');
    const clearDataBtn = document.getElementById('clear-data');
    function refreshClearButton() {
      const anyChecked = clearCheckIds.some((id) => document.getElementById(id).checked);
      const confirmed = clearConfirm.value.trim().toUpperCase() === 'CLEAR';
      clearDataBtn.disabled = !(anyChecked && confirmed);
    }
    clearCheckIds.forEach((id) => document.getElementById(id).addEventListener('change', refreshClearButton));
    clearConfirm.addEventListener('input', refreshClearButton);
    clearDataBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'clearData',
        scopes: {
          apiKeys: document.getElementById('clr-apiKeys').checked,
          settings: document.getElementById('clr-settings').checked,
          globalStorage: document.getElementById('clr-globalStorage').checked,
          workspaceOutputs: document.getElementById('clr-workspaceOutputs').checked,
        },
      });
    });
    refreshClearButton();

    document.getElementById('open-keyboard-shortcuts').addEventListener('click', () => vscode.postMessage({ type: 'openKeyboardShortcuts' }));
    document.getElementById('reveal-storage').addEventListener('click', () => vscode.postMessage({ type: 'revealStorage' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'saved') {
        handleSaved(msg.key, msg.saveId, msg.value);
        return;
      }
      if (msg.type === 'saveFailed') {
        handleSaveFailed(msg.key, msg.saveId);
        return;
      }
      if (msg.type === 'apiKeyStatus') {
        applyApiKeyStatus(Boolean(msg.hasKey));
        return;
      }
      if (msg.type === 'shortcutState') {
        const label = document.getElementById('shortcut-label');
        const statusEl = document.getElementById('shortcut-status');
        const warn = document.getElementById('shortcut-warning');
        if (label) label.textContent = msg.shortcutLabel || '';
        if (statusEl) statusEl.textContent = msg.shortcutStatus || '';
        if (warn) {
          warn.textContent = '';
          if (msg.shortcutWarning) {
            const div = document.createElement('div');
            div.className = 'notice warning';
            div.textContent = msg.shortcutWarning;
            warn.appendChild(div);
          }
        }
        return;
      }
    });
  </script>
</body>
</html>`;
}

async function refreshPanel(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): Promise<void> {
  panel.webview.html = getHtml(panel.webview, await readSettingsState(context));
}

async function postShortcutState(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): Promise<void> {
  const shortcut = await getShortcutState(context);
  await panel.webview.postMessage({ type: 'shortcutState', ...shortcut });
}

function watchUserKeybindings(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): vscode.Disposable {
  const keybindingsUri = getUserKeybindingsUri(context);
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(path.dirname(keybindingsUri.fsPath), path.basename(keybindingsUri.fsPath)),
  );
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      // Update only the shortcut row so in-progress, unsaved text edits are preserved.
      if (currentPanel === panel) void postShortcutState(context, panel);
    }, 250);
  };

  const subscriptions = [
    watcher,
    watcher.onDidCreate(scheduleRefresh),
    watcher.onDidChange(scheduleRefresh),
    watcher.onDidDelete(scheduleRefresh),
    {
      dispose: () => {
        if (refreshTimer) clearTimeout(refreshTimer);
      },
    },
  ];

  return vscode.Disposable.from(...subscriptions);
}

export async function openSettingsPanel(context: vscode.ExtensionContext): Promise<void> {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active);
    await refreshPanel(context, currentPanel);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'marklingoSettings',
    'MarkLingo Settings',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );
  currentPanel = panel;
  const keybindingsWatcher = watchUserKeybindings(context, panel);
  panel.onDidDispose(() => {
    keybindingsWatcher.dispose();
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (message?.type === 'updateSetting' && typeof message.key === 'string') {
        try {
          const value = await updateSingleSetting(context, message.key, message.value);
          await panel.webview.postMessage({ type: 'saved', key: message.key, value, saveId: message.saveId });
        } catch (error) {
          await panel.webview.postMessage({ type: 'saveFailed', key: message.key, saveId: message.saveId });
          throw error;
        }
        return;
      }
      if (message?.type === 'setApiKey') {
        const value = typeof message.value === 'string' ? message.value.trim() : '';
        if (!value) return;
        await storeOpenRouterApiKey(context, value);
        await panel.webview.postMessage({ type: 'apiKeyStatus', hasKey: await hasOpenRouterApiKey(context) });
        return;
      }
      if (message?.type === 'resetApiKey') {
        await deleteOpenRouterApiKey(context);
        await panel.webview.postMessage({ type: 'apiKeyStatus', hasKey: await hasOpenRouterApiKey(context) });
        return;
      }
      if (message?.type === 'clearData') {
        const scopes = (message.scopes ?? {}) as Record<string, unknown>;
        const didClear = await clearExtensionDataScopes(context, {
          apiKeys: Boolean(scopes.apiKeys),
          settings: Boolean(scopes.settings),
          globalStorage: Boolean(scopes.globalStorage),
          workspaceOutputs: Boolean(scopes.workspaceOutputs),
        });
        if (didClear) await refreshPanel(context, panel);
        return;
      }
      if (message?.type === 'openKeyboardShortcuts') {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', TRANSLATE_COMMAND);
        return;
      }
      if (message?.type === 'revealStorage') {
        await vscode.workspace.fs.createDirectory(getProjectsStorageRoot(context));
        await vscode.commands.executeCommand('revealFileInOS', getProjectsStorageRoot(context));
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`MarkLingo: ${messageText}`);
    }
  });

  await refreshPanel(context, panel);
}
