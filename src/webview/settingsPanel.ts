import * as vscode from 'vscode';
import {
  deleteOpenRouterApiKeyForCurrentEndpoint,
  getCurrentOpenRouterEndpoint,
  hasOpenRouterApiKeyForCurrentEndpoint,
  resetOpenRouterSecretsAndState,
  storeOpenRouterApiKeyForCurrentEndpoint,
} from '../services/openRouterClient.js';
import { getOutputLocation, getProjectsStorageRoot, type OutputLocation } from '../storage/paths.js';
import { DEFAULT_SYSTEM_PROMPT } from '../translation/prompts.js';
import { clampContextUsageRatio } from '../translation/requestPlanner.js';

const TARGET_LANGUAGE_OPTIONS = [
  '简体中文',
  '繁体中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
  'Deutsch',
  'Custom...',
];
const TARGET_LANGUAGE_SELECTED_KEY = 'markdownTranslator.translation.targetLanguageSelected';
const TRANSLATE_COMMAND = 'markdownTranslator.translateCurrentMarkdown';
const DEFAULT_TRANSLATE_KEY = 'alt+cmd+v';
const DEFAULT_MAX_BLOCKS_PER_REQUEST = 24;
const DEFAULT_MAX_CONTEXT_USAGE_RATIO = 0.5;

type SettingsState = {
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
  baseUrl: string;
  endpointOrigin: string;
  hasApiKey: boolean;
  modelId: string;
  targetLanguage: string;
  targetLanguageCustom: string;
  maxBlocksPerRequest: number;
  maxContextUsageRatio: number;
  deletionFallback: boolean;
  similarityThreshold: number;
  systemPrompt: string;
  customPrompt: string;
  outputLocation: OutputLocation;
  storageRoot: string;
};

type UserKeybinding = {
  key?: string;
  command?: string;
  when?: string;
};

const CONFIGURATION_KEYS = [
  'openrouter.baseUrl',
  'openrouter.modelId',
  'translation.targetLanguage',
  'translation.targetLanguageCustom',
  'translation.maxBlocksPerRequest',
  'translation.maxContextUsageRatio',
  'translation.deletionFallback',
  'translation.similarityThreshold',
  'translation.systemPrompt',
  'translation.customPrompt',
  'storage.outputLocation',
];

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

function readNumber(cfg: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = cfg.get<number>(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
      shortcutWarning: 'If VS Code routes this key to another command, Markdown Translator cannot show a prompt because its command is not invoked.',
    };
  }

  return {
    shortcutLabel: formatKeybinding(displayedKey),
    shortcutStatus: assignedBinding ? 'Assigned in user keybindings.' : 'Default shortcut for Markdown editors.',
    shortcutWarning: '',
  };
}

async function readSettingsState(context: vscode.ExtensionContext): Promise<SettingsState> {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  const endpoint = await getCurrentOpenRouterEndpoint(context);
  const shortcutState = await getShortcutState(context);
  return {
    ...shortcutState,
    baseUrl: cfg.get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1'),
    endpointOrigin: endpoint.origin,
    hasApiKey: await hasOpenRouterApiKeyForCurrentEndpoint(context),
    modelId: cfg.get<string>('openrouter.modelId', ''),
    targetLanguage: cfg.get<string>('translation.targetLanguage', '简体中文'),
    targetLanguageCustom: cfg.get<string>('translation.targetLanguageCustom', ''),
    maxBlocksPerRequest: readNumber(cfg, 'translation.maxBlocksPerRequest', DEFAULT_MAX_BLOCKS_PER_REQUEST),
    maxContextUsageRatio: clampContextUsageRatio(readNumber(cfg, 'translation.maxContextUsageRatio', DEFAULT_MAX_CONTEXT_USAGE_RATIO)),
    deletionFallback: cfg.get<boolean>('translation.deletionFallback', false),
    similarityThreshold: readNumber(cfg, 'translation.similarityThreshold', 0.6),
    systemPrompt: cfg.get<string>('translation.systemPrompt', '').trim() || DEFAULT_SYSTEM_PROMPT,
    customPrompt: cfg.get<string>('translation.customPrompt', ''),
    outputLocation: getOutputLocation(),
    storageRoot: getProjectsStorageRoot(context).fsPath,
  };
}

async function updateSettings(context: vscode.ExtensionContext, payload: Record<string, unknown>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  const updates: Array<[string, unknown]> = [
    ['openrouter.baseUrl', String(payload.baseUrl ?? '').trim()],
    ['openrouter.modelId', String(payload.modelId ?? '').trim()],
    ['translation.targetLanguage', String(payload.targetLanguage ?? '简体中文').trim() || '简体中文'],
    ['translation.targetLanguageCustom', String(payload.targetLanguageCustom ?? '').trim()],
    ['translation.maxBlocksPerRequest', Math.max(1, Number(payload.maxBlocksPerRequest) || DEFAULT_MAX_BLOCKS_PER_REQUEST)],
    ['translation.maxContextUsageRatio', clampContextUsageRatio(Number(payload.maxContextUsageRatio) || DEFAULT_MAX_CONTEXT_USAGE_RATIO)],
    ['translation.deletionFallback', Boolean(payload.deletionFallback)],
    ['translation.similarityThreshold', Math.max(0, Math.min(1, Number(payload.similarityThreshold) || 0))],
    ['translation.systemPrompt', String(payload.systemPrompt ?? '').trim()],
    ['translation.customPrompt', String(payload.customPrompt ?? '').trim()],
    ['storage.outputLocation', payload.outputLocation === 'privateStorage' ? 'privateStorage' : 'sourceFolder'],
  ];

  for (const [key, value] of updates) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
}

async function resetAllSettings(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  for (const key of CONFIGURATION_KEYS) {
    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, undefined);
  await resetOpenRouterSecretsAndState(context);
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
  const fallbackChecked = state.deletionFallback ? ' checked' : '';
  const apiKeyStatus = state.hasApiKey ? 'Saved' : 'Not saved';
  const defaultSystemPromptJson = JSON.stringify(DEFAULT_SYSTEM_PROMPT);
  const shortcutWarningHtml = state.shortcutWarning
    ? `<div class="notice warning">${escapeHtml(state.shortcutWarning)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Translator Settings</title>
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
      width: min(100%, 1180px);
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
    .row {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(260px, 1.35fr);
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
    }
    input, select, textarea {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input);
      color: var(--fg);
      padding: 7px 9px;
      font: inherit;
    }
    textarea {
      min-height: 150px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }
    input[type="range"] {
      padding: 0;
      border: 0;
      background: transparent;
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
      gap: 10px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
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
    .switch {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .switch input {
      width: 42px;
      height: 22px;
      accent-color: var(--accent);
    }
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--fg) 10%, transparent);
      color: var(--muted);
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
    .toast {
      min-height: 22px;
      color: var(--muted);
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
      <form id="settings-form">
        <h2>General</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Translate Shortcut</div>
              <div class="help">${escapeHtml(state.shortcutStatus)}</div>
            </div>
            <div class="stack">
              <span class="status">${escapeHtml(state.shortcutLabel)}</span>
              ${shortcutWarningHtml}
              <div class="field-actions">
                <button class="secondary" id="open-keyboard-shortcuts" type="button">Open Keyboard Shortcuts</button>
              </div>
            </div>
          </div>
        </section>

        <h2>Provider</h2>
        <p>OpenRouter-compatible endpoints are confirmed before use. API keys are stored separately per endpoint.</p>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Base URL</div>
              <div class="help">Official endpoint is used by default.</div>
            </div>
            <input id="baseUrl" name="baseUrl" value="${escapeHtml(state.baseUrl)}">
          </div>
          <div class="row">
            <div>
              <div class="label">API Key</div>
              <div class="help">${escapeHtml(state.endpointOrigin)}</div>
            </div>
            <div class="inline">
              <span class="status">${apiKeyStatus}</span>
              <div>
                <button class="secondary" id="set-key" type="button">Set</button>
                <button class="danger" id="reset-key" type="button">Reset</button>
              </div>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Model ID</div>
              <div class="help">Example: openai/gpt-4o-mini</div>
            </div>
            <input id="modelId" name="modelId" value="${escapeHtml(state.modelId)}">
          </div>
        </section>

        <h2>Translation</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Target Language</div>
              <div class="help">Used for new translation requests.</div>
            </div>
            <select id="targetLanguage" name="targetLanguage">${renderOptions(state.targetLanguage)}</select>
          </div>
          <div class="row">
            <div>
              <div class="label">Custom Language</div>
              <div class="help">Used when target language is custom.</div>
            </div>
            <input id="targetLanguageCustom" name="targetLanguageCustom" value="${escapeHtml(state.targetLanguageCustom)}">
          </div>
          <div class="row">
            <div>
              <div class="label">Context Usage Ratio</div>
              <div class="help">When the model context window is available, each request prompt targets this share of it.</div>
            </div>
            <div class="inline">
              <input id="maxContextUsageRatio" name="maxContextUsageRatio" type="range" min="0.1" max="0.9" step="0.05" value="${state.maxContextUsageRatio}">
              <span id="context-ratio-value">${Math.round(state.maxContextUsageRatio * 100)}%</span>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Fallback Blocks Per Request</div>
              <div class="help">Used only when the model context window cannot be read.</div>
            </div>
            <input id="maxBlocksPerRequest" name="maxBlocksPerRequest" type="number" min="1" value="${state.maxBlocksPerRequest}">
          </div>
          <div class="row">
            <div>
              <div class="label">Deletion Fallback</div>
              <div class="help">Run full translation when block deletion is detected.</div>
            </div>
            <label class="switch"><input id="deletionFallback" name="deletionFallback" type="checkbox"${fallbackChecked}></label>
          </div>
          <div class="row">
            <div>
              <div class="label">Similarity Threshold</div>
              <div class="help">Used by deletion detection.</div>
            </div>
            <div class="inline">
              <input id="similarityThreshold" name="similarityThreshold" type="range" min="0" max="1" step="0.05" value="${state.similarityThreshold}">
              <span id="threshold-value">${state.similarityThreshold.toFixed(2)}</span>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">System Prompt</div>
              <div class="help">Base translation instructions. Use {targetLanguage} for the selected target language.</div>
            </div>
            <div class="stack">
              <textarea id="systemPrompt" name="systemPrompt">${escapeHtml(state.systemPrompt)}</textarea>
              <div class="field-actions">
                <button class="secondary" id="restore-system-prompt" type="button">Restore Default</button>
              </div>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Custom Prompt</div>
              <div class="help">Optional terminology or style rules appended after the system prompt.</div>
            </div>
            <textarea id="customPrompt" name="customPrompt">${escapeHtml(state.customPrompt)}</textarea>
          </div>
        </section>

        <h2>Storage</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Output Location</div>
              <div class="help">Private output keeps generated Markdown out of the workspace; source-folder output preserves relative links.</div>
            </div>
            <select id="outputLocation" name="outputLocation">
              <option value="sourceFolder"${outputSourceSelected}>Source folder</option>
              <option value="privateStorage"${outputPrivateSelected}>Private storage</option>
            </select>
          </div>
          <div class="row">
            <div>
              <div class="label">Private Storage</div>
              <div class="help">${escapeHtml(state.storageRoot)}</div>
            </div>
            <button class="secondary" id="reveal-storage" type="button">Reveal</button>
          </div>
        </section>

        <div class="actions">
          <span id="toast" class="toast" role="status"></span>
          <button class="danger" id="reset-all" type="button">Reset All</button>
          <button class="secondary" id="reload" type="button">Reload</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('settings-form');
    const threshold = document.getElementById('similarityThreshold');
    const thresholdValue = document.getElementById('threshold-value');
    const contextRatio = document.getElementById('maxContextUsageRatio');
    const contextRatioValue = document.getElementById('context-ratio-value');
    const toast = document.getElementById('toast');
    const defaultSystemPrompt = ${defaultSystemPromptJson};

    threshold.addEventListener('input', () => {
      thresholdValue.textContent = Number(threshold.value).toFixed(2);
    });

    contextRatio.addEventListener('input', () => {
      contextRatioValue.textContent = Math.round(Number(contextRatio.value) * 100) + '%';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      vscode.postMessage({
        type: 'save',
        payload: {
          baseUrl: data.get('baseUrl'),
          modelId: data.get('modelId'),
          targetLanguage: data.get('targetLanguage'),
          targetLanguageCustom: data.get('targetLanguageCustom'),
          maxBlocksPerRequest: data.get('maxBlocksPerRequest'),
          maxContextUsageRatio: data.get('maxContextUsageRatio'),
          deletionFallback: data.has('deletionFallback'),
          similarityThreshold: data.get('similarityThreshold'),
          systemPrompt: data.get('systemPrompt'),
          customPrompt: data.get('customPrompt'),
          outputLocation: data.get('outputLocation')
        }
      });
    });

    document.getElementById('set-key').addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));
    document.getElementById('reset-key').addEventListener('click', () => vscode.postMessage({ type: 'resetApiKey' }));
    document.getElementById('open-keyboard-shortcuts').addEventListener('click', () => vscode.postMessage({ type: 'openKeyboardShortcuts' }));
    document.getElementById('restore-system-prompt').addEventListener('click', () => {
      document.getElementById('systemPrompt').value = defaultSystemPrompt;
      toast.textContent = 'System prompt restored locally. Save to apply.';
    });
    document.getElementById('reset-all').addEventListener('click', () => vscode.postMessage({ type: 'resetAll' }));
    document.getElementById('reload').addEventListener('click', () => vscode.postMessage({ type: 'reload' }));
    document.getElementById('reveal-storage').addEventListener('click', () => vscode.postMessage({ type: 'revealStorage' }));

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'toast') {
        toast.textContent = event.data.message;
        window.setTimeout(() => { toast.textContent = ''; }, 2400);
      }
    });
  </script>
</body>
</html>`;
}

async function refreshPanel(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): Promise<void> {
  panel.webview.html = getHtml(panel.webview, await readSettingsState(context));
}

export async function openSettingsPanel(context: vscode.ExtensionContext): Promise<void> {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Active);
    await refreshPanel(context, currentPanel);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'markdownTranslatorSettings',
    'Markdown Translator Settings',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    },
  );
  currentPanel = panel;
  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message) => {
    try {
      if (message?.type === 'save') {
        await updateSettings(context, message.payload ?? {});
        await refreshPanel(context, panel);
        panel.webview.postMessage({ type: 'toast', message: 'Saved' });
        return;
      }
      if (message?.type === 'setApiKey') {
        const input = await vscode.window.showInputBox({
          title: 'Markdown Translator: OpenRouter API Key',
          prompt: 'API Key is stored in VS Code SecretStorage for the currently configured endpoint.',
          password: true,
          ignoreFocusOut: true,
        });
        if (!input?.trim()) return;
        const origin = await storeOpenRouterApiKeyForCurrentEndpoint(context, input.trim());
        await refreshPanel(context, panel);
        panel.webview.postMessage({ type: 'toast', message: `Saved API key for ${origin}` });
        return;
      }
      if (message?.type === 'resetApiKey') {
        const confirm = await vscode.window.showWarningMessage(
          'Markdown Translator: Reset the API key for the currently configured endpoint?',
          { modal: true },
          'Reset',
        );
        if (confirm !== 'Reset') return;
        const origin = await deleteOpenRouterApiKeyForCurrentEndpoint(context);
        await refreshPanel(context, panel);
        panel.webview.postMessage({ type: 'toast', message: `Reset API key for ${origin}` });
        return;
      }
      if (message?.type === 'resetAll') {
        const confirm = await vscode.window.showWarningMessage(
          'Markdown Translator: Reset all settings and delete all saved API keys?',
          { modal: true },
          'Reset All',
        );
        if (confirm !== 'Reset All') return;
        await resetAllSettings(context);
        await refreshPanel(context, panel);
        panel.webview.postMessage({ type: 'toast', message: 'Reset all settings' });
        return;
      }
      if (message?.type === 'openKeyboardShortcuts') {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', TRANSLATE_COMMAND);
        return;
      }
      if (message?.type === 'revealStorage') {
        await vscode.workspace.fs.createDirectory(getProjectsStorageRoot(context));
        await vscode.commands.executeCommand('revealFileInOS', getProjectsStorageRoot(context));
        return;
      }
      if (message?.type === 'reload') {
        await refreshPanel(context, panel);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Markdown Translator: ${messageText}`);
    }
  });

  await refreshPanel(context, panel);
}
