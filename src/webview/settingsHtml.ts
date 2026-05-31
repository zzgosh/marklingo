export const CUSTOM_TARGET_LANGUAGE_LABEL = 'Custom...';

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

export type SettingsOutputLocation = 'sourceFolder' | 'privateStorage';

export type SettingsState = {
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
  baseUrl: string;
  hasApiKey: boolean;
  modelId: string;
  targetLanguage: string;
  targetLanguageCustom: string;
  systemPrompt: string;
  customPrompt: string;
  outputLocation: SettingsOutputLocation;
  storageRoot: string;
};

export type RenderSettingsHtmlOptions = {
  cspSource: string;
  nonce: string;
  state: SettingsState;
  extraHead?: string;
  beforeMainScript?: string;
};

export function createSettingsHtmlNonce(): string {
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

function renderOptions(selected: string): string {
  return TARGET_LANGUAGE_OPTIONS.map((option) => {
    const selectedAttr = option === selected ? ' selected' : '';
    return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
  }).join('');
}

function getShortcutWarningText(warning: string): string {
  if (!warning) return '';
  if (warning.includes('another command')) {
    return 'Shortcut may be unavailable because another command uses it.';
  }
  if (warning.includes('assign')) {
    return 'No active shortcut. Edit keyboard shortcuts to assign one.';
  }
  return warning;
}

const API_KEY_MASK_VALUE = '•'.repeat(32);

export function renderSettingsHtml(options: RenderSettingsHtmlOptions): string {
  const { beforeMainScript = '', cspSource, extraHead = '', nonce, state } = options;
  const outputPrivateSelected = state.outputLocation === 'privateStorage' ? ' selected' : '';
  const outputSourceSelected = state.outputLocation === 'sourceFolder' ? ' selected' : '';
  const apiKeyInitialAttrs = state.hasApiKey
    ? ` value="${escapeHtml(API_KEY_MASK_VALUE)}" data-masked="true"`
    : '';
  const customLanguageHidden = state.targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL ? '' : ' style="display:none"';
  const shortcutWarningText = getShortcutWarningText(state.shortcutWarning);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarkLingo Settings</title>
  ${extraHead}
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
      padding: 12px 18px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }
    .row:last-child { border-bottom: 0; }
    .row.top-align { align-items: start; }
    .label {
      font-weight: 400;
      margin-bottom: 0;
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
      appearance: none;
      color: var(--muted);
      padding-right: 42px;
    }
    textarea {
      height: 104px;
      min-height: 104px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }
    .readonly-field {
      height: 200px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: color-mix(in srgb, var(--input) 72%, transparent);
      color: var(--muted);
      padding: 7px 42px 7px 10px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .readonly-wrap {
      position: relative;
      min-width: 0;
    }
    .copy-icon {
      position: absolute;
      right: 28px;
      top: 8px;
      display: inline-grid;
      width: 26px;
      min-height: 26px;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0;
      background: color-mix(in srgb, var(--input) 90%, transparent);
      color: var(--muted);
      opacity: 0;
      transition: opacity 120ms ease, color 120ms ease;
    }
    .readonly-wrap:hover .copy-icon,
    .copy-icon:focus-visible,
    .copy-icon.copied {
      opacity: 1;
    }
    .copy-icon:hover,
    .copy-icon.copied {
      color: var(--fg);
    }
    .copy-icon svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
    }
    .copy-icon .success-glyph {
      display: none;
    }
    .copy-icon.copied .copy-glyph {
      display: none;
    }
    .copy-icon.copied .success-glyph {
      display: block;
    }
    .inline {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }
    .control-full {
      min-width: 0;
    }
    .select-wrap {
      display: block;
      position: relative;
      width: 100%;
      min-width: 0;
    }
    .select-wrap select {
      display: block;
    }
    .select-wrap::after {
      content: "";
      position: absolute;
      right: 16px;
      top: 50%;
      width: 7px;
      height: 7px;
      border-right: 1.5px solid var(--muted);
      border-bottom: 1.5px solid var(--muted);
      pointer-events: none;
      transform: translateY(-62%) rotate(45deg);
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
      padding: 0 10px;
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
      border: 1px solid var(--danger);
      background: transparent;
      color: var(--danger);
    }
    button:disabled { cursor: default; }
    button.save-btn { min-width: 56px; }
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
    .status-text { color: var(--muted); }
    .shortcut-row {
      align-items: center;
    }
    .shortcut-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 56px;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .shortcut-pill {
      display: flex;
      min-height: 34px;
      width: 100%;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 7px 10px;
      background: var(--input);
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #open-keyboard-shortcuts {
      width: 56px;
    }
    .section-warning {
      margin-top: 8px;
      color: var(--danger);
    }
    .section-warning:empty {
      display: none;
    }
    .path-field {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      color: var(--muted);
    }
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
    .danger-action {
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
    }
    .danger-list {
      margin-top: 4px;
      color: var(--muted);
      overflow-wrap: anywhere;
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
      .shortcut-controls { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <main>
      <h1>Settings</h1>
      <div id="settings">
        <h2>Keyboard Shortcuts</h2>
        <section class="card">
          <div class="row shortcut-row">
            <div>
              <div class="label">Translate Current Markdown</div>
            </div>
            <div class="shortcut-controls">
              <span class="shortcut-pill" id="shortcut-label">${escapeHtml(state.shortcutLabel)}</span>
              <button class="secondary" id="open-keyboard-shortcuts" type="button">Edit</button>
            </div>
          </div>
        </section>
        <div class="section-warning" id="shortcut-warning">${escapeHtml(shortcutWarningText)}</div>

        <h2>Provider</h2>
        <section class="card">
          <div class="row">
            <div>
              <div class="label">Base URL</div>
            </div>
            <div class="inline">
              <input id="baseUrl" value="${escapeHtml(state.baseUrl)}">
              <button class="save-btn" type="button" data-field="baseUrl" data-key="openrouter.baseUrl" disabled>Save</button>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">API Key</div>
            </div>
            <div class="inline">
              <input id="apiKey" type="password" autocomplete="off"${apiKeyInitialAttrs}>
              <button class="save-btn" type="button" id="save-key" disabled>Save</button>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Model ID</div>
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
            </div>
            <div class="control-full">
              <span class="select-wrap"><select id="targetLanguage">${renderOptions(state.targetLanguage)}</select></span>
            </div>
          </div>
          <div class="row" id="customLanguageRow"${customLanguageHidden}>
            <div>
              <div class="label">Custom Language</div>
            </div>
            <div class="inline">
              <input id="targetLanguageCustom" value="${escapeHtml(state.targetLanguageCustom)}">
              <button class="save-btn" type="button" data-field="targetLanguageCustom" data-key="translation.targetLanguageCustom" disabled>Save</button>
            </div>
          </div>
          <div class="row top-align">
            <div>
              <div class="label">System Instructions</div>
            </div>
            <div class="readonly-wrap">
              <div class="readonly-field" aria-label="System prompt">${escapeHtml(state.systemPrompt)}</div>
              <button class="copy-icon" id="copy-system-prompt" type="button" aria-label="Copy system instructions" title="Copy system instructions">
                <svg class="copy-glyph" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="success-glyph" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="row top-align">
            <div>
              <div class="label">Custom Instructions</div>
            </div>
            <div class="stack">
              <textarea id="customPrompt">${escapeHtml(state.customPrompt)}</textarea>
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
            </div>
            <div class="control-full">
              <span class="select-wrap">
                <select id="outputLocation">
                  <option value="sourceFolder"${outputSourceSelected}>Source folder</option>
                  <option value="privateStorage"${outputPrivateSelected}>Private extension storage</option>
                </select>
              </span>
            </div>
          </div>
          <div class="row">
            <div>
              <div class="label">Private Storage Folder</div>
              <div class="help">Stores cache, metadata, and private translated files.</div>
            </div>
            <div class="inline">
              <input class="path-field" id="storageRoot" value="${escapeHtml(state.storageRoot)}" readonly>
              <button class="secondary" id="reveal-storage" type="button">Reveal</button>
            </div>
          </div>
        </section>

        <h2 class="danger-title">Danger Zone</h2>
        <section class="card danger">
          <div class="row top-align">
            <div>
              <div class="label">Clear Data</div>
              <div class="danger-list">Delete saved API key, MarkLingo settings, private cache and metadata, and tracked translated files.</div>
            </div>
            <div class="danger-action">
              <button class="danger" type="button" id="clear-data">Clear data</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
  ${beforeMainScript}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const CUSTOM_LANGUAGE_LABEL = ${JSON.stringify(CUSTOM_TARGET_LANGUAGE_LABEL)};
    const SYSTEM_PROMPT = ${JSON.stringify(state.systemPrompt)};

    function getShortcutWarningText(warning) {
      if (!warning) return '';
      if (warning.includes('another command')) {
        return 'Shortcut may be unavailable because another command uses it.';
      }
      if (warning.includes('assign')) {
        return 'No active shortcut. Edit keyboard shortcuts to assign one.';
      }
      return warning;
    }

    const textByKey = new Map();
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

    function registerInstant(id, key) {
      const control = document.getElementById(id);
      if (!control) return;
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
    // When a key is on file the input shows fixed-length dots (type="password" masks each char).
    const API_KEY_MASK_VALUE = ${JSON.stringify(API_KEY_MASK_VALUE)};
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('save-key');
    let apiKeySavedTimer;
    let apiKeyPending; // { saveId, raw } — raw is the input.value at click time
    let nextApiKeySaveId = 1;

    function clearApiKeySavedTimer() {
      if (apiKeySavedTimer) {
        clearTimeout(apiKeySavedTimer);
        apiKeySavedTimer = undefined;
      }
    }

    function isApiKeyMasked() {
      return apiKeyInput.dataset.masked === 'true';
    }

    function showApiKeyMask() {
      apiKeyInput.value = API_KEY_MASK_VALUE;
      apiKeyInput.dataset.masked = 'true';
      apiKeyInput.scrollLeft = 0;
      saveKeyBtn.disabled = true;
    }

    function clearApiKeyMaskForEntry() {
      if (!isApiKeyMasked()) return;
      clearApiKeySavedTimer();
      apiKeyInput.dataset.masked = 'false';
      apiKeyInput.value = '';
      saveKeyBtn.textContent = 'Save';
      saveKeyBtn.classList.remove('saved');
      saveKeyBtn.disabled = true;
    }

    function resetApiKeySaveButton() {
      saveKeyBtn.textContent = 'Save';
      saveKeyBtn.classList.remove('saved');
      saveKeyBtn.disabled = isApiKeyMasked() || apiKeyInput.value.trim().length === 0;
    }

    function applyApiKeyStatus(hasKey, saveId) {
      // Stale-ack guard: ignore replies for a save the user has since superseded.
      if (saveId !== undefined && (!apiKeyPending || apiKeyPending.saveId !== saveId)) return;
      const pending = apiKeyPending;
      apiKeyPending = undefined;
      clearApiKeySavedTimer();
      // If the user kept typing after clicking Save, do not wipe their in-progress entry.
      const userKeptTyping = pending && apiKeyInput.value !== '' && apiKeyInput.value !== pending.raw;
      if (userKeptTyping) {
        resetApiKeySaveButton();
        return;
      }
      saveKeyBtn.disabled = true;
      if (hasKey) {
        showApiKeyMask();
        saveKeyBtn.textContent = 'Saved';
        saveKeyBtn.classList.add('saved');
        apiKeySavedTimer = setTimeout(() => {
          saveKeyBtn.textContent = 'Save';
          saveKeyBtn.classList.remove('saved');
          apiKeySavedTimer = undefined;
        }, 2500);
      } else {
        clearApiKeyMaskForEntry();
        saveKeyBtn.textContent = 'Save';
        saveKeyBtn.classList.remove('saved');
      }
    }

    function handleApiKeySaveFailed(saveId) {
      if (saveId !== undefined && (!apiKeyPending || apiKeyPending.saveId !== saveId)) return;
      apiKeyPending = undefined;
      clearApiKeySavedTimer();
      resetApiKeySaveButton();
    }

    apiKeyInput.addEventListener('beforeinput', clearApiKeyMaskForEntry);
    apiKeyInput.addEventListener('paste', clearApiKeyMaskForEntry);
    apiKeyInput.addEventListener('keydown', (event) => {
      if (!isApiKeyMasked()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        clearApiKeyMaskForEntry();
      }
    });
    apiKeyInput.addEventListener('input', () => {
      clearApiKeySavedTimer();
      saveKeyBtn.classList.remove('saved');
      saveKeyBtn.textContent = 'Save';
      saveKeyBtn.disabled = isApiKeyMasked() || apiKeyInput.value.trim().length === 0;
    });
    saveKeyBtn.addEventListener('click', () => {
      if (isApiKeyMasked()) return;
      const trimmed = apiKeyInput.value.trim();
      if (!trimmed) return;
      const saveId = nextApiKeySaveId++;
      apiKeyPending = { saveId, raw: apiKeyInput.value };
      saveKeyBtn.textContent = 'Saving...';
      saveKeyBtn.disabled = true;
      vscode.postMessage({ type: 'setApiKey', value: trimmed, saveId });
    });

    const clearDataBtn = document.getElementById('clear-data');
    clearDataBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearData' });
    });

    const copySystemPromptBtn = document.getElementById('copy-system-prompt');
    let copySystemPromptTimer;
    copySystemPromptBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copySystemPrompt', value: SYSTEM_PROMPT });
      copySystemPromptBtn.classList.add('copied');
      copySystemPromptBtn.setAttribute('aria-label', 'System instructions copied');
      copySystemPromptBtn.setAttribute('title', 'Copied');
      if (copySystemPromptTimer) clearTimeout(copySystemPromptTimer);
      copySystemPromptTimer = setTimeout(() => {
        copySystemPromptBtn.classList.remove('copied');
        copySystemPromptBtn.setAttribute('aria-label', 'Copy system instructions');
        copySystemPromptBtn.setAttribute('title', 'Copy system instructions');
        copySystemPromptTimer = undefined;
      }, 1600);
    });

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
        applyApiKeyStatus(Boolean(msg.hasKey), msg.saveId);
        return;
      }
      if (msg.type === 'apiKeySaveFailed') {
        handleApiKeySaveFailed(msg.saveId);
        return;
      }
      if (msg.type === 'shortcutState') {
        const label = document.getElementById('shortcut-label');
        const statusEl = document.getElementById('shortcut-status');
        const warn = document.getElementById('shortcut-warning');
        if (label) label.textContent = msg.shortcutLabel || '';
        if (statusEl) statusEl.textContent = msg.shortcutStatus || '';
        if (warn) {
          warn.textContent = getShortcutWarningText(msg.shortcutWarning || '');
        }
        return;
      }
    });
  </script>
</body>
</html>`;
}
