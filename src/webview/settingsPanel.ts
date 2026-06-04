import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  coerceProviderType,
  DEFAULT_OPENROUTER_BASE_URL,
  hasExplicitOpenRouterProviderConfiguration,
  hasOpenRouterApiKey,
  getStoredOpenRouterApiKey,
  resolveConfiguredProvider,
  resolveProviderBaseUrl,
  storeOpenRouterApiKey,
  DEFAULT_OPENROUTER_MODEL_ID,
  type OpenRouterSettings,
} from '../services/openRouterClient.js';
import {
  readVerifiedTranslationAdapterMode,
  verifyProviderConnectionAndCapability,
} from '../services/modelCapabilities.js';
import { clearExtensionDataScopes, type CleanupScopes } from '../commands/clearExtensionData.js';
import {
  compactPrivateStorage,
  PRIVATE_STORAGE_COMPACT_TARGET_BYTES,
  readPrivateStorageStats,
} from '../storage/privateStorage.js';
import { getProjectRootUri, getProjectsStorageRoot } from '../storage/paths.js';
import { deleteProjectTranslationData, type ProjectTranslationDataScopes } from '../commands/deleteTranslatedFiles.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import {
  coerceTranslationModelConcurrency,
  coerceTranslationModelMaxBlocksPerRequest,
  coerceTranslationModelMaxOutputTokens,
  coerceTranslationRequestMode,
  DEFAULT_TRANSLATION_MODEL_CONCURRENCY,
  DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST,
  DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS,
  DEFAULT_TRANSLATION_REQUEST_MODE,
} from '../translation/translationAdapters.js';
import { getTranslationModelPromptPreview } from '../translation/translationModelPrompts.js';
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

function hasExplicitStringSetting(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = cfg.inspect<string>(key);
  return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue]
    .some((value) => typeof value === 'string');
}

function getTranslationPromptState(options: {
  adapterMode?: string;
  modelId: string;
  systemPrompt: string;
  targetLanguage: string;
}): {
  promptInstructions: string;
  promptInstructionsEnhanced: boolean;
  promptInstructionsEnhancementNote?: string;
} {
  if (options.adapterMode === 'translationModel') {
    const preview = getTranslationModelPromptPreview({
      modelId: options.modelId,
      targetLanguage: options.targetLanguage,
    });
    return {
      promptInstructions: preview.prompt,
      promptInstructionsEnhanced: preview.enhanced,
      promptInstructionsEnhancementNote: preview.enhancementNote,
    };
  }

  return {
    promptInstructions: resolveSystemPrompt(options.systemPrompt, options.targetLanguage),
    promptInstructionsEnhanced: false,
  };
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
  const provider = resolveConfiguredProvider();
  const hasExplicitModelId = hasExplicitStringSetting(cfg, 'openrouter.modelId');
  const hasExplicitBaseUrl = hasExplicitStringSetting(cfg, 'openrouter.baseUrl');
  const configuredModelId = (cfg.get<string>('openrouter.modelId') ?? '').trim();
  const configuredBaseUrl = (cfg.get<string>('openrouter.baseUrl') ?? '').trim();
  const modelId = configuredModelId || (provider.providerType === 'openrouter' ? DEFAULT_OPENROUTER_MODEL_ID : '');
  const chatPromptInstructions = resolveSystemPrompt(systemPrompt, resolvedTargetLanguage);
  const openAiCompatibleBaseUrl = provider.providerType === 'openaiCompatible' && hasExplicitBaseUrl && configuredBaseUrl !== DEFAULT_OPENROUTER_BASE_URL
    ? provider.baseUrl
    : '';
  const openAiCompatibleModelId = provider.providerType === 'openaiCompatible'
    ? (hasExplicitModelId ? modelId : '')
    : '';
  const openRouterModelId = provider.providerType === 'openrouter'
    ? modelId
    : DEFAULT_OPENROUTER_MODEL_ID;
  const currentProviderBaseUrl = provider.providerType === 'openaiCompatible'
    ? openAiCompatibleBaseUrl
    : provider.baseUrl;
  const includeLegacyKey = !hasExplicitOpenRouterProviderConfiguration();
  const openRouterHasApiKey = await hasOpenRouterApiKey(context, DEFAULT_OPENROUTER_BASE_URL, {
    includeLegacy: includeLegacyKey,
  });
  const openAiCompatibleHasApiKey = openAiCompatibleBaseUrl
    ? await hasOpenRouterApiKey(context, openAiCompatibleBaseUrl, { includeLegacy: false })
    : false;
  const hasApiKey = provider.providerType === 'openrouter'
    ? openRouterHasApiKey
    : Boolean(currentProviderBaseUrl) && await hasOpenRouterApiKey(context, currentProviderBaseUrl, { includeLegacy: false });
  const openRouterVerifiedAdapterMode = openRouterHasApiKey && openRouterModelId
    ? await readVerifiedTranslationAdapterMode(context, {
      providerType: 'openrouter',
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
      modelId: openRouterModelId,
    })
    : undefined;
  const openAiCompatibleVerifiedAdapterMode = openAiCompatibleHasApiKey && openAiCompatibleBaseUrl && openAiCompatibleModelId
    ? await readVerifiedTranslationAdapterMode(context, {
      providerType: 'openaiCompatible',
      baseUrl: openAiCompatibleBaseUrl,
      modelId: openAiCompatibleModelId,
    })
    : undefined;
  const verifiedAdapterMode = provider.providerType === 'openrouter'
    ? openRouterVerifiedAdapterMode
    : openAiCompatibleVerifiedAdapterMode;
  const currentPromptState = getTranslationPromptState({
    adapterMode: verifiedAdapterMode,
    modelId,
    systemPrompt,
    targetLanguage: resolvedTargetLanguage,
  });
  const openRouterPromptState = getTranslationPromptState({
    adapterMode: openRouterVerifiedAdapterMode,
    modelId: openRouterModelId,
    systemPrompt,
    targetLanguage: resolvedTargetLanguage,
  });
  const openAiCompatiblePromptState = getTranslationPromptState({
    adapterMode: openAiCompatibleVerifiedAdapterMode,
    modelId: openAiCompatibleModelId,
    systemPrompt,
    targetLanguage: resolvedTargetLanguage,
  });
  return {
    ...shortcutState,
    providerType: provider.providerType,
    baseUrl: currentProviderBaseUrl,
    openRouterBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    openRouterModelId,
    openRouterHasApiKey,
    openRouterVerifiedAdapterMode,
    openRouterPromptInstructions: openRouterPromptState.promptInstructions,
    openRouterPromptInstructionsEnhanced: openRouterPromptState.promptInstructionsEnhanced,
    openRouterPromptInstructionsEnhancementNote: openRouterPromptState.promptInstructionsEnhancementNote,
    openAiCompatibleBaseUrl,
    openAiCompatibleModelId,
    openAiCompatibleHasApiKey,
    openAiCompatibleVerifiedAdapterMode,
    openAiCompatiblePromptInstructions: openAiCompatiblePromptState.promptInstructions,
    openAiCompatiblePromptInstructionsEnhanced: openAiCompatiblePromptState.promptInstructionsEnhanced,
    openAiCompatiblePromptInstructionsEnhancementNote: openAiCompatiblePromptState.promptInstructionsEnhancementNote,
    hasApiKey,
    modelId,
    verifiedAdapterMode,
    requestMode: coerceTranslationRequestMode(cfg.get<string>('translation.requestMode', DEFAULT_TRANSLATION_REQUEST_MODE)),
    translationModelMaxBlocksPerRequest: coerceTranslationModelMaxBlocksPerRequest(
      cfg.get<number>('translation.translationModelMaxBlocksPerRequest', DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST),
    ),
    translationModelConcurrency: coerceTranslationModelConcurrency(
      cfg.get<number>('translation.translationModelConcurrency', DEFAULT_TRANSLATION_MODEL_CONCURRENCY),
    ),
    translationModelMaxOutputTokens: coerceTranslationModelMaxOutputTokens(
      cfg.get<number>('translation.translationModelMaxOutputTokens', DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS),
    ),
    targetLanguage,
    targetLanguageCustom,
    promptInstructions: currentPromptState.promptInstructions,
    promptInstructionsEnhanced: currentPromptState.promptInstructionsEnhanced,
    promptInstructionsEnhancementNote: currentPromptState.promptInstructionsEnhancementNote,
    chatPromptInstructions,
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

function readProviderVerificationInput(message: unknown): {
  saveId: unknown;
  settings: OpenRouterSettings;
  apiKeyInput: string;
} {
  const value = message && typeof message === 'object' ? message as Record<string, unknown> : {};
  const providerType = coerceProviderType(value.providerType);
  const rawBaseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const baseUrl = providerType === 'openrouter'
    ? resolveProviderBaseUrl(providerType, rawBaseUrl).baseUrl
    : rawBaseUrl;
  const apiKeyInput = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  const rawModelId = typeof value.modelId === 'string' ? value.modelId.trim() : '';
  const modelId = rawModelId || (providerType === 'openrouter' ? DEFAULT_OPENROUTER_MODEL_ID : '');
  return {
    saveId: value.saveId,
    apiKeyInput,
    settings: {
      providerType,
      baseUrl,
      apiKey: apiKeyInput,
      modelId,
    },
  };
}

async function saveVerifiedProviderSettings(
  context: vscode.ExtensionContext,
  settings: OpenRouterSettings,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  await cfg.update('openrouter.provider', settings.providerType, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.baseUrl', settings.baseUrl, vscode.ConfigurationTarget.Global);
  await cfg.update('openrouter.modelId', settings.modelId, vscode.ConfigurationTarget.Global);
  await cfg.update('translation.requestMode', DEFAULT_TRANSLATION_REQUEST_MODE, vscode.ConfigurationTarget.Global);
  await storeOpenRouterApiKey(context, settings.apiKey, settings.baseUrl);
  await markOpenRouterModelAccepted(context);
  await acceptVisibleOnboardingDefaults(context);
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

async function disposePanel(panel: vscode.WebviewPanel): Promise<void> {
  let disposable: vscode.Disposable | undefined;
  const disposed = new Promise<void>((resolve) => {
    disposable = panel.onDidDispose(() => {
      disposable?.dispose();
      resolve();
    });
  });
  panel.dispose();
  await disposed;
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
      retainContextWhenHidden: true,
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
      if (message?.type === 'verifyProvider') {
        const { apiKeyInput, saveId, settings } = readProviderVerificationInput(message);
        if (settings.providerType === 'openaiCompatible' && !settings.baseUrl.trim()) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: 'Verification failed. Base URL is required.',
            saveId,
          });
          return;
        }
        if (!settings.modelId.trim()) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: 'Verification failed. Model ID is required.',
            saveId,
          });
          return;
        }

        let normalizedSettings: OpenRouterSettings;
        try {
          const { baseUrl } = resolveProviderBaseUrl(settings.providerType, settings.baseUrl);
          normalizedSettings = { ...settings, baseUrl };
        } catch (error) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: error instanceof Error ? error.message : String(error),
            saveId,
          });
          return;
        }

        const currentProvider = resolveConfiguredProvider();
        const targetIsCurrentProvider =
          currentProvider.providerType === normalizedSettings.providerType && currentProvider.baseUrl === normalizedSettings.baseUrl;
        const includeLegacyKey = targetIsCurrentProvider && !hasExplicitOpenRouterProviderConfiguration();
        const existingApiKey = apiKeyInput || await getStoredOpenRouterApiKey(
          context,
          normalizedSettings.baseUrl,
          { includeLegacy: includeLegacyKey },
        );
        if (!existingApiKey) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: 'Verification failed. API key is required.',
            saveId,
          });
          return;
        }

        const verificationSettings = { ...normalizedSettings, apiKey: existingApiKey };
        try {
          const result = await verifyProviderConnectionAndCapability(context, verificationSettings);
          await saveVerifiedProviderSettings(context, verificationSettings);
          const cfg = vscode.workspace.getConfiguration('marklingo');
          const targetLanguage = cfg.get<string>('translation.targetLanguage', '简体中文');
          const targetLanguageCustom = cfg.get<string>('translation.targetLanguageCustom', '');
          const resolvedTargetLanguage =
            targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL && targetLanguageCustom.trim()
              ? targetLanguageCustom.trim()
              : targetLanguage;
          const promptState = getTranslationPromptState({
            adapterMode: result.adapterMode,
            modelId: verificationSettings.modelId,
            systemPrompt: cfg.get<string>('translation.systemPrompt', ''),
            targetLanguage: resolvedTargetLanguage,
          });
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: true,
            hasKey: await hasOpenRouterApiKey(context, verificationSettings.baseUrl, { includeLegacy: false }),
            providerType: verificationSettings.providerType,
            baseUrl: verificationSettings.baseUrl,
            modelId: verificationSettings.modelId,
            adapterMode: result.adapterMode,
            promptInstructions: promptState.promptInstructions,
            promptInstructionsEnhanced: promptState.promptInstructionsEnhanced,
            promptInstructionsEnhancementNote: promptState.promptInstructionsEnhancementNote,
            message: result.message,
            saveId,
          });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          console.warn('[marklingo] provider verification failed:', messageText);
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: messageText,
            saveId,
          });
        }
        return;
      }
      if (message?.type === 'clearAllData') {
        const scopes = await pickClearAllDataScopes();
        if (!scopes) return;
        const didClear = await clearExtensionDataScopes(context, scopes);
        if (didClear) {
          if (currentPanel === panel) {
            currentPanel = undefined;
            currentPanelProjectUri = undefined;
          }
          await disposePanel(panel);
          await openSettingsPanel(context);
        }
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
