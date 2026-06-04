import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  hasOpenRouterApiKey,
  storeOpenRouterApiKey,
  DEFAULT_OPENROUTER_MODEL_ID,
} from '../services/openRouterClient.js';
import { clearExtensionDataScopes, type CleanupScopes } from '../commands/clearExtensionData.js';
import {
  compactPrivateStorage,
  PRIVATE_STORAGE_COMPACT_TARGET_BYTES,
  readPrivateStorageStats,
} from '../storage/privateStorage.js';
import { getProjectRootUri, getProjectsStorageRoot } from '../storage/paths.js';
import { deleteProjectTranslationData, type ProjectTranslationDataScopes } from '../commands/deleteTranslatedFiles.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import { coerceTranslationRequestMode, DEFAULT_TRANSLATION_REQUEST_MODE } from '../translation/translationAdapters.js';
import {
  acceptVisibleOnboardingDefaults,
  markOpenRouterModelAccepted,
  markTargetLanguageSelected,
} from '../onboardingState.js';
import {
  getDefaultTranslateKeybindingSearchQuery,
  getDefaultTranslateKeys,
  getShortcutStateFromKeybindings,
  type ShortcutState,
  type UserKeybinding,
} from './shortcutState.js';
import { CUSTOM_TARGET_LANGUAGE_LABEL, createSettingsHtmlNonce, formatBytes, renderSettingsHtml, type SettingsState } from './settingsHtml.js';

// Settings the webview is allowed to write directly. Free-text fields use an inline Save button;
// dropdowns save on change. The full system prompt, context-usage ratio and fallback-block count
// remain configurable via settings.json but are intentionally not surfaced here.
const UPDATABLE_SETTING_KEYS = new Set<string>([
  'openrouter.baseUrl',
  'openrouter.modelId',
  'translation.requestMode',
  'translation.targetLanguage',
  'translation.targetLanguageCustom',
  'translation.customPrompt',
]);

let currentPanel: vscode.WebviewPanel | undefined;
let currentPanelProjectUri: vscode.Uri | undefined;

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

function getCurrentProjectUri(): vscode.Uri | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === 'file') return activeUri;

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) return folders[0].uri;
  return undefined;
}

function getCurrentProjectDirectoryPath(projectUri: vscode.Uri | undefined): string | undefined {
  return projectUri ? getProjectRootUri(projectUri).fsPath : undefined;
}

function getKeyboardShortcutsSearchQuery(): string {
  return getDefaultTranslateKeybindingSearchQuery({
    extensionHostPlatform: process.platform,
    remoteName: vscode.env.remoteName,
  });
}

async function readSettingsState(context: vscode.ExtensionContext, projectUri?: vscode.Uri): Promise<SettingsState> {
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
    requestMode: coerceTranslationRequestMode(cfg.get<string>('translation.requestMode', DEFAULT_TRANSLATION_REQUEST_MODE)),
    targetLanguage,
    targetLanguageCustom,
    systemPrompt: resolveSystemPrompt(systemPrompt, resolvedTargetLanguage),
    customPrompt: cfg.get<string>('translation.customPrompt', ''),
    storageRoot: getProjectsStorageRoot(context).fsPath,
    currentProjectPath: getCurrentProjectDirectoryPath(projectUri),
    storageStats: await readPrivateStorageStats(context),
  };
}

async function pickClearAllDataScopes(): Promise<CleanupScopes | undefined> {
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
      label: 'Translation metadata and cache',
      description: 'All projects in extension global storage',
      picked: true,
      scope: 'globalStorage',
    },
    {
      label: 'Tracked translated files',
      description: 'Optional unmodified *_<language>_mdt.md generated outputs',
      picked: false,
      scope: 'workspaceOutputs',
    },
  ];
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    placeHolder: 'Select data to delete, then press Enter.',
    title: 'MarkLingo: Clear All Data',
  });
  if (!selected || selected.length === 0) return undefined;
  return {
    apiKeys: selected.some((item) => item.scope === 'apiKeys'),
    settings: selected.some((item) => item.scope === 'settings'),
    globalStorage: selected.some((item) => item.scope === 'globalStorage'),
    workspaceOutputs: selected.some((item) => item.scope === 'workspaceOutputs'),
  };
}

async function pickCurrentProjectDataScopes(projectPath: string): Promise<ProjectTranslationDataScopes | undefined> {
  type CurrentProjectDataItem = vscode.QuickPickItem & { scope: keyof ProjectTranslationDataScopes };
  const items: CurrentProjectDataItem[] = [
    {
      label: 'Tracked translated files',
      description: '*_<language>_mdt.md in the current project',
      picked: true,
      scope: 'workspaceOutputs',
    },
    {
      label: 'Translation metadata and cache',
      description: 'Current project private storage',
      detail: projectPath,
      picked: true,
      scope: 'metadataCache',
    },
  ];
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    ignoreFocusOut: true,
    placeHolder: 'Select current project data to delete, then press Enter.',
    title: 'MarkLingo: Clear Current Project Data',
  });
  if (!selected || selected.length === 0) return undefined;
  return {
    workspaceOutputs: selected.some((item) => item.scope === 'workspaceOutputs'),
    metadataCache: selected.some((item) => item.scope === 'metadataCache'),
  };
}

function coerceSettingValue(key: string, raw: unknown): unknown {
  const value = String(raw ?? '').trim();
  if (key === 'translation.targetLanguage') return value || '简体中文';
  if (key === 'translation.requestMode') return coerceTranslationRequestMode(value);
  if (key === 'openrouter.modelId') return value || DEFAULT_OPENROUTER_MODEL_ID;
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
    await markTargetLanguageSelected(context);
  }
  if (key === 'openrouter.modelId') {
    await markOpenRouterModelAccepted(context);
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
  panel.webview.html = getHtml(panel.webview, await readSettingsState(context, currentPanelProjectUri));
}

async function optimizePrivateStorage(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): Promise<void> {
  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Optimizing translation metadata...',
      cancellable: false,
    },
    () => compactPrivateStorage(context, { targetBytes: PRIVATE_STORAGE_COMPACT_TARGET_BYTES }),
  );

  await refreshPanel(context, panel);

  if (summary.errors.length > 0) {
    console.warn('[marklingo] translation metadata optimization errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `MarkLingo: Removed ${formatBytes(summary.reclaimedBytes)} from ${summary.evictedEntries} old cache record(s), with ${summary.errors.length} issue(s).`,
    );
    return;
  }

  if (summary.evictedEntries === 0) {
    await vscode.window.showInformationMessage('MarkLingo: Translation metadata storage is already optimized.');
    return;
  }

  await vscode.window.showInformationMessage(
    `MarkLingo: Removed ${formatBytes(summary.reclaimedBytes)} from ${summary.evictedEntries} old cache record(s).`,
  );
}

async function clearCurrentProjectData(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): Promise<void> {
  const projectUri = currentPanelProjectUri ?? getCurrentProjectUri();
  if (!projectUri) {
    await vscode.window.showWarningMessage('MarkLingo: Open a file or single workspace folder before clearing current project data.');
    return;
  }

  const projectPath = getProjectRootUri(projectUri).fsPath;
  const scopes = await pickCurrentProjectDataScopes(projectPath);
  if (!scopes) return;

  const summary = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Clearing current project data...',
      cancellable: false,
    },
    (progress) => deleteProjectTranslationData(context, projectUri, progress, scopes),
  );

  await refreshPanel(context, panel);

  if (summary.errors.length > 0) {
    console.warn('[marklingo] current project data cleanup errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `MarkLingo: Cleared current project data with ${summary.errors.length} operation(s) failed.`,
    );
    return;
  }

  const parts: string[] = [];
  if (scopes.workspaceOutputs) {
    parts.push(`${summary.deleted} translated file(s)`);
    if (summary.missing > 0) parts.push(`${summary.missing} file(s) already missing`);
  }
  if (summary.metadataCacheCleared) parts.push('translation metadata/cache');

  await vscode.window.showInformationMessage(`MarkLingo: Cleared current project data: ${parts.join(', ')}.`);
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
  const projectUri = getCurrentProjectUri();
  if (currentPanel) {
    if (projectUri) currentPanelProjectUri = projectUri;
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
  currentPanelProjectUri = projectUri;
  const keybindingsWatcher = watchUserKeybindings(context, panel);
  panel.onDidDispose(() => {
    keybindingsWatcher.dispose();
    currentPanel = undefined;
    currentPanelProjectUri = undefined;
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
          await acceptVisibleOnboardingDefaults(context);
          await panel.webview.postMessage({
            type: 'apiKeyStatus',
            hasKey: await hasOpenRouterApiKey(context),
            saveId,
          });
        } catch (error) {
          await panel.webview.postMessage({ type: 'apiKeySaveFailed', saveId });
          throw error;
        }
        return;
      }
      if (message?.type === 'clearAllData') {
        const scopes = await pickClearAllDataScopes();
        if (!scopes) return;
        const didClear = await clearExtensionDataScopes(context, scopes);
        if (didClear) await refreshPanel(context, panel);
        return;
      }
      if (message?.type === 'clearCurrentProjectData') {
        await clearCurrentProjectData(context, panel);
        return;
      }
      if (message?.type === 'optimizeStorage') {
        await optimizePrivateStorage(context, panel);
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
