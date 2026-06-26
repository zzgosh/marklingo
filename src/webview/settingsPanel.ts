import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  coerceProviderType,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_PROVIDER_TYPE,
  hasExplicitOpenRouterProviderConfiguration,
  hasOpenRouterApiKey,
  getStoredOpenRouterApiKey,
  providerRequiresApiKey,
  resolveConfiguredProvider,
  resolveProviderBaseUrl,
  storeOpenRouterApiKey,
  type OpenRouterSettings,
} from '../services/openRouterClient.js';
import {
  coerceProviderModelId,
  getProviderBaseUrlCandidates,
  getProviderBaseUrlSetting,
  getProviderDefaultBaseUrl,
  getProviderDefaultModelId,
  getProviderModelIdSetting,
  PROVIDER_PRESETS,
  providerSupportsApiKey,
  type ProviderType,
} from '../services/providerPresets.js';
import {
  readVerifiedTranslationAdapterMode,
  verifyProviderConnectionOnly,
  verifyProviderConnectionAndCapability,
} from '../services/modelCapabilities.js';
import { clearExtensionDataScopes, type CleanupScopes } from '../commands/clearExtensionData.js';
import {
  compactPrivateStorage,
  PRIVATE_STORAGE_COMPACT_TARGET_BYTES,
  readPrivateStorageStats,
} from '../storage/privateStorage.js';
import { getProjectId, getProjectRootUri, getProjectsStorageRoot } from '../storage/paths.js';
import { readUsageEvents } from '../usage/usageLedger.js';
import { aggregateUsageView, coerceUsageQuery, DEFAULT_USAGE_QUERY } from '../usage/usageAggregate.js';
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
  markTargetLanguageSelected,
} from '../onboardingState.js';
import {
  ConfigurationRegistryRefreshRequired,
  isConfigurationRegistryRefreshRequired,
} from '../vscodeConfigurationErrors.js';
import {
  SHORTCUT_DEFINITIONS,
  getDefaultShortcutKeybindingSearchQuery,
  getShortcutStatesFromKeybindings,
  type ShortcutState,
  type ShortcutId,
  type UserKeybinding,
} from './shortcutState.js';
import { CUSTOM_TARGET_LANGUAGE_LABEL, createSettingsHtmlNonce, formatBytes, renderSettingsHtml, renderUsageSection, type SettingsState } from './settingsHtml.js';

// Settings the webview is allowed to write directly. Free-text fields use an inline Save button;
// dropdowns save on change. The full system prompt, context-usage ratio and Chat JSON block cap
// remain configurable via settings.json but are intentionally not surfaced here.
const UPDATABLE_SETTING_KEYS = new Set<string>([
  'translation.targetLanguage',
  'translation.targetLanguageCustom',
  'translation.customPrompt',
]);
const RELOAD_WINDOW_ACTION = 'Reload Window';

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

async function getShortcutState(context: vscode.ExtensionContext): Promise<ShortcutState[]> {
  const keybindings = await readUserKeybindings(context);
  return getShortcutStatesFromKeybindings(keybindings, {
    extensionHostPlatform: process.platform,
    remoteName: vscode.env.remoteName,
  });
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

function getKeyboardShortcutsSearchQuery(shortcutId: ShortcutId | undefined): string {
  const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === shortcutId) ?? SHORTCUT_DEFINITIONS[0];
  return getDefaultShortcutKeybindingSearchQuery(definition, {
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

function readProviderConfiguredBaseUrl(
  cfg: vscode.WorkspaceConfiguration,
  providerType: ProviderType,
  options: {
    activeProviderType: ProviderType;
    activeProviderBaseUrl: string;
    hasExplicitLegacyBaseUrl: boolean;
    configuredBaseUrl: string;
  },
): string {
  if (providerType === 'openrouter') return DEFAULT_OPENROUTER_BASE_URL;

  const setting = getProviderBaseUrlSetting(providerType);
  const configured = setting ? (cfg.get<string>(setting) ?? '').trim() : '';
  if (configured) return configured;

  if (
    providerType === options.activeProviderType &&
    options.hasExplicitLegacyBaseUrl &&
    options.configuredBaseUrl.replace(/\/+$/, '') !== DEFAULT_OPENROUTER_BASE_URL
  ) {
    return options.activeProviderBaseUrl;
  }

  if (providerType === 'openaiCompatible') return '';
  return getProviderDefaultBaseUrl(providerType);
}

function readProviderConfiguredModelId(
  cfg: vscode.WorkspaceConfiguration,
  providerType: ProviderType,
  options: {
    activeProviderType: ProviderType;
    hasExplicitLegacyModelId: boolean;
    configuredLegacyModelId: string;
  },
): string {
  const setting = getProviderModelIdSetting(providerType);
  const configured = setting ? (cfg.get<string>(setting) ?? '').trim() : '';
  if (configured) return coerceProviderModelId(providerType, configured);

  if (providerType === options.activeProviderType && options.hasExplicitLegacyModelId) {
    return coerceProviderModelId(providerType, options.configuredLegacyModelId);
  }

  return coerceProviderModelId(providerType, configured || getProviderDefaultModelId(providerType));
}

async function hasStoredProviderApiKey(
  context: vscode.ExtensionContext,
  providerType: ProviderType,
  baseUrl: string,
  options: { includeLegacy: boolean },
): Promise<boolean> {
  if (!providerSupportsApiKey(providerType)) return false;
  const candidates = getProviderBaseUrlCandidates(providerType, baseUrl);
  for (const candidate of candidates) {
    if (await hasOpenRouterApiKey(context, candidate, { includeLegacy: options.includeLegacy })) return true;
  }
  return false;
}

async function readUsageView(
  context: vscode.ExtensionContext,
  projectUri?: vscode.Uri,
  query = DEFAULT_USAGE_QUERY,
) {
  const currentProjectId = projectUri ? getProjectId(projectUri) : undefined;
  try {
    const events = await readUsageEvents(context, { scope: 'allProjects' });
    return aggregateUsageView(events, query, { now: new Date(), currentProjectId });
  } catch (error) {
    console.warn('[marklingo] failed to read usage events:', error instanceof Error ? error.message : String(error));
    return aggregateUsageView([], query, { now: new Date(), currentProjectId });
  }
}

type ReadSettingsStateOptions = {
  includeUsage?: boolean;
};

async function readSettingsState(
  context: vscode.ExtensionContext,
  projectUri?: vscode.Uri,
  options: ReadSettingsStateOptions = {},
): Promise<SettingsState> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const shortcutStatePromise = getShortcutState(context);
  const storageStatsPromise = readPrivateStorageStats(context);
  const targetLanguage = cfg.get<string>('translation.targetLanguage', '简体中文');
  const targetLanguageCustom = cfg.get<string>('translation.targetLanguageCustom', '');
  const resolvedTargetLanguage =
    targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL && targetLanguageCustom.trim()
      ? targetLanguageCustom.trim()
      : targetLanguage;
  const systemPrompt = cfg.get<string>('translation.systemPrompt', '');
  const provider = resolveConfiguredProvider();
  const hasExplicitLegacyModelId = hasExplicitStringSetting(cfg, 'openrouter.modelId');
  const hasExplicitLegacyBaseUrl = hasExplicitStringSetting(cfg, 'openrouter.baseUrl');
  const configuredLegacyModelId = (cfg.get<string>('openrouter.modelId') ?? '').trim();
  const configuredBaseUrl = (cfg.get<string>('openrouter.baseUrl') ?? '').trim();
  const chatPromptInstructions = resolveSystemPrompt(systemPrompt, resolvedTargetLanguage);
  const includeLegacyKey = !hasExplicitOpenRouterProviderConfiguration();

  const providerStates: SettingsState['providerStates'] = {};
  for (const preset of PROVIDER_PRESETS) {
    const baseUrl = readProviderConfiguredBaseUrl(cfg, preset.id, {
      activeProviderType: provider.providerType,
      activeProviderBaseUrl: provider.baseUrl,
      hasExplicitLegacyBaseUrl,
      configuredBaseUrl,
    });
    const modelId = readProviderConfiguredModelId(cfg, preset.id, {
      activeProviderType: provider.providerType,
      hasExplicitLegacyModelId,
      configuredLegacyModelId,
    });
    const hasApiKey = providerSupportsApiKey(preset.id)
      ? Boolean(baseUrl) && await hasStoredProviderApiKey(context, preset.id, baseUrl, {
        includeLegacy: preset.id === 'openrouter' ? includeLegacyKey : false,
      })
      : false;
    const canUseProvider = (!providerRequiresApiKey(preset.id) || hasApiKey) && baseUrl && modelId;
    const verifiedAdapterMode = canUseProvider
      ? await readVerifiedTranslationAdapterMode(context, {
        providerType: preset.id,
        baseUrl,
        modelId,
      })
      : undefined;
    const promptState = getTranslationPromptState({
      adapterMode: verifiedAdapterMode,
      modelId,
      systemPrompt,
      targetLanguage: resolvedTargetLanguage,
    });
    providerStates[preset.id] = {
      baseUrl,
      modelId,
      hasApiKey,
      verifiedAdapterMode,
      promptInstructions: promptState.promptInstructions,
      promptInstructionsEnhanced: promptState.promptInstructionsEnhanced,
      promptInstructionsEnhancementNote: promptState.promptInstructionsEnhancementNote,
    };
  }

  const currentProviderState = providerStates[provider.providerType] ?? providerStates.openrouter;
  const openRouterState = providerStates.openrouter;
  const openAiCompatibleState = providerStates.openaiCompatible;
  const modelId = currentProviderState.modelId;
  const currentProviderBaseUrl = currentProviderState.baseUrl;
  const verifiedAdapterMode = currentProviderState.verifiedAdapterMode;
  const shortcuts = await shortcutStatePromise;
  const storageStats = await storageStatsPromise;
  return {
    shortcuts,
    providerType: provider.providerType,
    baseUrl: currentProviderBaseUrl,
    openRouterBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    openRouterModelId: openRouterState.modelId,
    openRouterHasApiKey: openRouterState.hasApiKey,
    openRouterVerifiedAdapterMode: openRouterState.verifiedAdapterMode,
    openRouterPromptInstructions: openRouterState.promptInstructions,
    openRouterPromptInstructionsEnhanced: openRouterState.promptInstructionsEnhanced,
    openRouterPromptInstructionsEnhancementNote: openRouterState.promptInstructionsEnhancementNote,
    openAiCompatibleBaseUrl: openAiCompatibleState.baseUrl,
    openAiCompatibleModelId: openAiCompatibleState.modelId,
    openAiCompatibleHasApiKey: openAiCompatibleState.hasApiKey,
    openAiCompatibleVerifiedAdapterMode: openAiCompatibleState.verifiedAdapterMode,
    openAiCompatiblePromptInstructions: openAiCompatibleState.promptInstructions,
    openAiCompatiblePromptInstructionsEnhanced: openAiCompatibleState.promptInstructionsEnhanced,
    openAiCompatiblePromptInstructionsEnhancementNote: openAiCompatibleState.promptInstructionsEnhancementNote,
    providerStates,
    hasApiKey: currentProviderState.hasApiKey,
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
    promptInstructions: currentProviderState.promptInstructions,
    promptInstructionsEnhanced: currentProviderState.promptInstructionsEnhanced,
    promptInstructionsEnhancementNote: currentProviderState.promptInstructionsEnhancementNote,
    chatPromptInstructions,
    customPrompt: cfg.get<string>('translation.customPrompt', ''),
    storageRoot: getProjectsStorageRoot(context).fsPath,
    currentProjectPath: getCurrentProjectDirectoryPath(projectUri),
    storageStats,
    usage: options.includeUsage ? await readUsageView(context, projectUri) : undefined,
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

function getUserFacingSettingsErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function offerReloadWindowForConfigurationRegistryError(error: unknown): Promise<void> {
  if (!isConfigurationRegistryRefreshRequired(error)) return;

  const selected = await vscode.window.showErrorMessage(
    `MarkLingo: ${error.message}`,
    RELOAD_WINDOW_ACTION,
  );
  if (selected === RELOAD_WINDOW_ACTION) {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function showSettingsWriteError(error: unknown): Promise<string> {
  const messageText = getUserFacingSettingsErrorMessage(error);
  await offerReloadWindowForConfigurationRegistryError(error);
  if (!isConfigurationRegistryRefreshRequired(error)) {
    await vscode.window.showErrorMessage(`MarkLingo: ${messageText}`);
  }
  return messageText;
}

function isConfigurationSettingRegistered(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
  return cfg.inspect(key)?.defaultValue !== undefined;
}

function requireConfigurationSettingRegistered(cfg: vscode.WorkspaceConfiguration, key: string): void {
  if (!isConfigurationSettingRegistered(cfg, key)) {
    throw new ConfigurationRegistryRefreshRequired(`marklingo.${key}`);
  }
}

async function updateRequiredSetting(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown,
): Promise<void> {
  requireConfigurationSettingRegistered(cfg, key);
  await cfg.update(key, value, vscode.ConfigurationTarget.Global);
}

async function updateOptionalSettingIfRegistered(
  cfg: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!isConfigurationSettingRegistered(cfg, key)) {
    console.warn(`[marklingo] skipped optional setting "marklingo.${key}" because VS Code has not refreshed the extension settings schema.`);
    return false;
  }
  await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  return true;
}

async function updateSingleSetting(context: vscode.ExtensionContext, key: string, raw: unknown): Promise<unknown> {
  if (!UPDATABLE_SETTING_KEYS.has(key)) {
    throw new Error(`MarkLingo: Unsupported setting "${key}".`);
  }
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const value = coerceSettingValue(key, raw);
  await updateRequiredSetting(cfg, key, value);
  if (key === 'translation.targetLanguage' || key === 'translation.targetLanguageCustom') {
    await markTargetLanguageSelected(context);
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
  const baseUrl = rawBaseUrl || getProviderDefaultBaseUrl(providerType);
  const apiKeyInput = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  const rawModelId = typeof value.modelId === 'string' ? value.modelId.trim() : '';
  const modelId = coerceProviderModelId(providerType, rawModelId || getProviderDefaultModelId(providerType));
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
  if (settings.providerType === DEFAULT_PROVIDER_TYPE) {
    await updateOptionalSettingIfRegistered(cfg, 'openrouter.provider', settings.providerType);
  } else {
    await updateRequiredSetting(cfg, 'openrouter.provider', settings.providerType);
  }
  await updateRequiredSetting(cfg, 'openrouter.baseUrl', settings.baseUrl);
  await updateRequiredSetting(cfg, 'openrouter.modelId', settings.modelId);
  const providerBaseUrlSetting = getProviderBaseUrlSetting(settings.providerType);
  const providerModelIdSetting = getProviderModelIdSetting(settings.providerType);
  if (providerBaseUrlSetting) {
    await updateOptionalSettingIfRegistered(cfg, providerBaseUrlSetting, settings.baseUrl);
  }
  if (providerModelIdSetting) {
    await updateOptionalSettingIfRegistered(cfg, providerModelIdSetting, settings.modelId);
  }
  await updateOptionalSettingIfRegistered(cfg, 'translation.requestMode', DEFAULT_TRANSLATION_REQUEST_MODE);
  if (providerSupportsApiKey(settings.providerType) && settings.apiKey.trim()) {
    await storeOpenRouterApiKey(context, settings.apiKey, settings.baseUrl);
  }
  await acceptVisibleOnboardingDefaults(context);
}

function getNormalizedProviderVerificationCandidates(settings: OpenRouterSettings): OpenRouterSettings[] {
  const candidates: OpenRouterSettings[] = [];
  const seen = new Set<string>();
  for (const candidateBaseUrl of getProviderBaseUrlCandidates(settings.providerType, settings.baseUrl)) {
    const { baseUrl } = resolveProviderBaseUrl(settings.providerType, candidateBaseUrl);
    if (seen.has(baseUrl)) continue;
    seen.add(baseUrl);
    candidates.push({ ...settings, baseUrl, apiKey: '' });
  }
  return candidates;
}

async function getProviderVerificationApiKey(
  context: vscode.ExtensionContext,
  settings: OpenRouterSettings,
  apiKeyInput: string,
): Promise<string> {
  if (!providerSupportsApiKey(settings.providerType)) return '';
  if (apiKeyInput) return apiKeyInput;

  const currentProvider = resolveConfiguredProvider();
  const targetIsCurrentProvider =
    currentProvider.providerType === settings.providerType && currentProvider.baseUrl === settings.baseUrl;
  const includeLegacyKey = targetIsCurrentProvider && !hasExplicitOpenRouterProviderConfiguration();
  return await getStoredOpenRouterApiKey(
    context,
    settings.baseUrl,
    { includeLegacy: includeLegacyKey },
  ) || '';
}

async function verifyProviderCandidates(
  context: vscode.ExtensionContext,
  settings: OpenRouterSettings,
  apiKeyInput: string,
): Promise<{ settings: OpenRouterSettings; result: Awaited<ReturnType<typeof verifyProviderConnectionAndCapability>> }> {
  let candidates: OpenRouterSettings[];
  try {
    candidates = getNormalizedProviderVerificationCandidates(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }

  if (candidates.length === 0) throw new Error('Base URL is required.');

  const errors: string[] = [];
  let hadUsableKey = false;
  for (const candidate of candidates) {
    const existingApiKey = await getProviderVerificationApiKey(context, candidate, apiKeyInput);
    if (providerRequiresApiKey(candidate.providerType) && !existingApiKey) {
      errors.push(`${candidate.baseUrl}: API key is required.`);
      continue;
    }
    if (existingApiKey || !providerRequiresApiKey(candidate.providerType)) hadUsableKey = true;

    const verificationSettings = { ...candidate, apiKey: existingApiKey };
    try {
      const cachedAdapterMode = await readVerifiedTranslationAdapterMode(context, verificationSettings);
      const result = cachedAdapterMode && !apiKeyInput
        ? await verifyProviderConnectionOnly(verificationSettings, cachedAdapterMode)
        : await verifyProviderConnectionAndCapability(context, verificationSettings);
      return { settings: verificationSettings, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.baseUrl}: ${message}`);
    }
  }

  if (providerRequiresApiKey(settings.providerType) && !hadUsableKey) {
    throw new Error('API key is required.');
  }

  const suffix = errors.length > 0 ? ` ${errors.at(-1)}` : '';
  throw new Error(`Verification failed for all provider endpoints.${suffix}`);
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

function sameProjectContext(a: vscode.Uri | undefined, b: vscode.Uri | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return getProjectId(a) === getProjectId(b);
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
  const shortcuts = await getShortcutState(context);
  await panel.webview.postMessage({ type: 'shortcutState', shortcuts });
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
    const previousProjectUri = currentPanelProjectUri;
    if (projectUri) currentPanelProjectUri = projectUri;
    currentPanel.reveal(vscode.ViewColumn.Active);
    if (!sameProjectContext(previousProjectUri, currentPanelProjectUri)) {
      await refreshPanel(context, currentPanel);
    }
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
      if (message?.type === 'usageQuery') {
        const query = coerceUsageQuery(message);
        const requestId = Number.isSafeInteger(message.requestId) && message.requestId > 0
          ? message.requestId
          : undefined;
        const view = await readUsageView(context, currentPanelProjectUri, query);
        await panel.webview.postMessage({ type: 'usageSection', html: renderUsageSection(view), query, requestId });
        return;
      }
      if (message?.type === 'verifyProvider') {
        const { apiKeyInput, saveId, settings } = readProviderVerificationInput(message);
        if (!settings.baseUrl.trim()) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: 'Base URL is required.',
            saveId,
          });
          return;
        }
        if (!settings.modelId.trim()) {
          await panel.webview.postMessage({
            type: 'providerVerification',
            ok: false,
            message: 'Model ID is required.',
            saveId,
          });
          return;
        }

        try {
          const { result, settings: verificationSettings } = await verifyProviderCandidates(context, settings, apiKeyInput);
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
            hasKey: providerSupportsApiKey(verificationSettings.providerType) &&
              await hasOpenRouterApiKey(context, verificationSettings.baseUrl, { includeLegacy: false }),
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
          const messageText = getUserFacingSettingsErrorMessage(error);
          await offerReloadWindowForConfigurationRegistryError(error);
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
        const shortcutId = typeof message.shortcutId === 'string' ? message.shortcutId as ShortcutId : undefined;
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', getKeyboardShortcutsSearchQuery(shortcutId));
        return;
      }
      if (message?.type === 'revealStorage') {
        await vscode.workspace.fs.createDirectory(getProjectsStorageRoot(context));
        await vscode.commands.executeCommand('revealFileInOS', getProjectsStorageRoot(context));
      }
    } catch (error) {
      await showSettingsWriteError(error);
    }
  });

  await refreshPanel(context, panel);
}
