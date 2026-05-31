import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  hasOpenRouterApiKey,
  storeOpenRouterApiKey,
  DEFAULT_OPENROUTER_MODEL_ID,
} from '../services/openRouterClient.js';
import { clearExtensionDataScopes, type CleanupScopes } from '../commands/clearExtensionData.js';
import { getOutputLocation, getProjectsStorageRoot } from '../storage/paths.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import {
  getDefaultTranslateKeybindingSearchQuery,
  getDefaultTranslateKeys,
  getShortcutStateFromKeybindings,
  type ShortcutState,
  type UserKeybinding,
} from './shortcutState.js';
import { CUSTOM_TARGET_LANGUAGE_LABEL, createSettingsHtmlNonce, renderSettingsHtml, type SettingsState } from './settingsHtml.js';

const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';

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

let currentPanel: vscode.WebviewPanel | undefined;

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

function isUserKeybinding(item: unknown): item is UserKeybinding {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  return (
    (value.key === undefined || typeof value.key === 'string') &&
    (value.command === undefined || typeof value.command === 'string') &&
    (value.when === undefined || typeof value.when === 'string')
  );
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

async function getShortcutState(context: vscode.ExtensionContext): Promise<ShortcutState> {
  const keybindings = await readUserKeybindings(context);
  const defaultKeys = getDefaultTranslateKeys({
    extensionHostPlatform: process.platform,
    remoteName: vscode.env.remoteName,
  });
  return getShortcutStateFromKeybindings(keybindings, defaultKeys);
}

function getKeyboardShortcutsSearchQuery(): string {
  return getDefaultTranslateKeybindingSearchQuery({
    extensionHostPlatform: process.platform,
    remoteName: vscode.env.remoteName,
  });
}

async function readSettingsState(context: vscode.ExtensionContext): Promise<SettingsState> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const shortcutState = await getShortcutState(context);
  const targetLanguage = cfg.get<string>('translation.targetLanguage', '简体中文');
  const targetLanguageCustom = cfg.get<string>('translation.targetLanguageCustom', '');
  const resolvedTargetLanguage =
    targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL && targetLanguageCustom.trim()
      ? targetLanguageCustom.trim()
      : targetLanguage;
  const systemPrompt = cfg.get<string>('translation.systemPrompt', '');
  return {
    ...shortcutState,
    baseUrl: cfg.get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1'),
    hasApiKey: await hasOpenRouterApiKey(context),
    modelId: (cfg.get<string>('openrouter.modelId', DEFAULT_OPENROUTER_MODEL_ID) ?? '').trim() || DEFAULT_OPENROUTER_MODEL_ID,
    targetLanguage,
    targetLanguageCustom,
    systemPrompt: resolveSystemPrompt(systemPrompt, resolvedTargetLanguage),
    customPrompt: cfg.get<string>('translation.customPrompt', ''),
    outputLocation: getOutputLocation(),
    storageRoot: getProjectsStorageRoot(context).fsPath,
  };
}

async function pickClearDataScopes(): Promise<CleanupScopes | undefined> {
  type ClearDataItem = vscode.QuickPickItem & { scope: keyof CleanupScopes };
  const items: ClearDataItem[] = [
    {
      label: 'Saved API key',
      description: 'SecretStorage',
      picked: true,
      scope: 'apiKeys',
    },
    {
      label: 'MarkLingo settings',
      description: 'User settings',
      picked: true,
      scope: 'settings',
    },
    {
      label: 'Private cache and metadata',
      description: 'Extension global storage',
      picked: true,
      scope: 'globalStorage',
    },
    {
      label: 'Tracked translated files',
      description: '*_mdt.md generated outputs',
      picked: false,
      scope: 'workspaceOutputs',
    },
  ];
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    placeHolder: 'Select data to delete, then press Enter.',
    title: 'MarkLingo: Clear Data',
  });
  if (!selected || selected.length === 0) return undefined;
  return {
    apiKeys: selected.some((item) => item.scope === 'apiKeys'),
    settings: selected.some((item) => item.scope === 'settings'),
    globalStorage: selected.some((item) => item.scope === 'globalStorage'),
    workspaceOutputs: selected.some((item) => item.scope === 'workspaceOutputs'),
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

function getHtml(webview: vscode.Webview, state: SettingsState): string {
  return renderSettingsHtml({
    cspSource: webview.cspSource,
    nonce: createSettingsHtmlNonce(),
    state,
  });
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
        const saveId = message.saveId;
        if (!value) {
          await panel.webview.postMessage({ type: 'apiKeySaveFailed', saveId });
          return;
        }
        try {
          await storeOpenRouterApiKey(context, value);
          await panel.webview.postMessage({
            type: 'apiKeyStatus',
            hasKey: await hasOpenRouterApiKey(context),
            keyLength: value.length,
            saveId,
          });
        } catch (error) {
          await panel.webview.postMessage({ type: 'apiKeySaveFailed', saveId });
          throw error;
        }
        return;
      }
      if (message?.type === 'clearData') {
        const scopes = await pickClearDataScopes();
        if (!scopes) return;
        const didClear = await clearExtensionDataScopes(context, scopes);
        if (didClear) await refreshPanel(context, panel);
        return;
      }
      if (message?.type === 'copySystemPrompt' && typeof message.value === 'string') {
        await vscode.env.clipboard.writeText(message.value);
        return;
      }
      if (message?.type === 'openKeyboardShortcuts') {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', getKeyboardShortcutsSearchQuery());
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
