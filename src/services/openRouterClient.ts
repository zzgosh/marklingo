import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { hasOpenRouterModelAccepted, markOpenRouterModelAccepted } from '../onboardingState.js';
import {
  getMissingProviderApiKeyMessage,
  getProviderApiKeyInputPrompt,
  getProviderApiKeyInputTitle,
} from './providerDisplay.js';
import {
  coerceProviderType,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL_ID,
  DEFAULT_PROVIDER_TYPE,
  getProviderBaseUrlSetting,
  getProviderDefaultBaseUrl,
  getProviderDefaultModelId,
  getProviderModelIdSetting,
  getProviderReasoningControl,
  OPENAI_COMPATIBLE_BASE_URL_SETTING,
  OPENAI_COMPATIBLE_MODEL_ID_SETTING,
  OPENROUTER_PROVIDER_MODEL_ID_SETTING,
  coerceProviderModelId,
  providerRequiresApiKey,
  providerSupportsApiKey,
  providerSupportsOpenRouterHeaders,
  providerSupportsOpenRouterReasoningControl,
  providerSupportsTemperatureControl,
  PROVIDER_PRESETS,
  type ProviderType,
} from './providerPresets.js';

export type OpenRouterSettings = {
  providerType: ProviderType;
  baseUrl: string;
  modelId: string;
  apiKey: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionOptions = {
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  responseFormat?: ResponseFormat;
  reasoning?: ReasoningOptions | null;
};

export type ResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: object;
      };
    };

export type ReasoningOptions = {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  max_tokens?: number;
  enabled?: boolean;
  exclude?: boolean;
};

type ThinkingOptions = {
  type: 'disabled';
};

export {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL_ID,
  DEFAULT_PROVIDER_TYPE,
  OPENAI_COMPATIBLE_BASE_URL_SETTING,
  OPENAI_COMPATIBLE_MODEL_ID_SETTING,
  OPENROUTER_PROVIDER_MODEL_ID_SETTING,
  coerceProviderType,
  getProviderDefaultBaseUrl,
  providerRequiresApiKey,
  type ProviderType,
};

const LEGACY_OPENROUTER_API_KEY_SECRET = 'marklingo.openrouter.apiKey';
const OPENROUTER_API_KEY_SECRET_PREFIX = 'marklingo.openrouter.apiKey.v2.';
const OPENROUTER_API_KEY_ORIGINS_STATE = 'marklingo.openrouter.apiKeyOrigins';
const OPENROUTER_MODEL_ID_LAST_USED = 'marklingo.openrouter.lastModelId';
const MODEL_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const OPEN_MARKLINGO_SETTINGS_LABEL = 'Open MarkLingo Settings';

const modelContextCache = new Map<string, { expiresAt: number; contextLength: number | undefined }>();

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function parseOpenRouterBaseUrl(baseUrl: string): URL {
  const normalized = normalizeBaseUrl(baseUrl || DEFAULT_OPENROUTER_BASE_URL);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`Provider base URL is not a valid URL: ${baseUrl}`);
  }

  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!isHttps && !isLocalHttp) {
    throw new Error('Provider base URL must use HTTPS, except for localhost debugging.');
  }

  return url;
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('marklingo');
}

function hasExplicitProviderConfiguration(cfg: vscode.WorkspaceConfiguration): boolean {
  const inspected = cfg.inspect<string>('openrouter.provider');
  return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
}

export function hasExplicitOpenRouterProviderConfiguration(): boolean {
  return hasExplicitProviderConfiguration(getConfiguration());
}

function getConfiguredProviderType(cfg: vscode.WorkspaceConfiguration): ProviderType {
  if (hasImplicitOpenAiCompatibleConfiguration(cfg)) return 'openaiCompatible';
  return coerceProviderType(cfg.get<string>('openrouter.provider') ?? DEFAULT_PROVIDER_TYPE);
}

function hasImplicitOpenAiCompatibleConfiguration(cfg: vscode.WorkspaceConfiguration): boolean {
  if (hasExplicitProviderConfiguration(cfg)) return false;
  const rawBaseUrl = cfg.get<string>('openrouter.baseUrl') ?? DEFAULT_OPENROUTER_BASE_URL;
  return normalizeBaseUrl(rawBaseUrl) !== DEFAULT_OPENROUTER_BASE_URL;
}

async function shouldPromptInitialProviderChoice(
  context: vscode.ExtensionContext,
  cfg: vscode.WorkspaceConfiguration,
): Promise<boolean> {
  if (hasExplicitProviderConfiguration(cfg) || hasImplicitOpenAiCompatibleConfiguration(cfg)) return false;
  if (hasOpenRouterModelAccepted(context)) return false;
  return !await hasOpenRouterApiKey(context, DEFAULT_OPENROUTER_BASE_URL, { includeLegacy: true });
}

type ProviderChoiceItem = vscode.QuickPickItem & {
  providerType?: ProviderType;
  openSettings?: boolean;
};

async function resolveProviderTypeForTranslation(
  context: vscode.ExtensionContext,
  cfg: vscode.WorkspaceConfiguration,
): Promise<ProviderType> {
  if (!await shouldPromptInitialProviderChoice(context, cfg)) {
    return getConfiguredProviderType(cfg);
  }

  const picked = await vscode.window.showQuickPick<ProviderChoiceItem>([
    ...PROVIDER_PRESETS.slice(0, 1).map((preset) => ({
      label: preset.label,
      description: 'Recommended',
      detail: preset.description,
      providerType: preset.id,
    })),
    {
      label: 'Custom OpenAI Compatible',
      description: 'Custom endpoint',
      detail: 'Set Base URL, model, and key in Settings.',
      providerType: 'openaiCompatible' as ProviderType,
      openSettings: true,
    },
    {
      label: OPEN_MARKLINGO_SETTINGS_LABEL,
      description: 'Full setup',
      detail: 'Open Settings to configure any provider.',
      openSettings: true,
    },
  ], {
    title: 'MarkLingo: Choose Provider',
    placeHolder: 'Choose a provider. You can change this later in Settings.',
    ignoreFocusOut: true,
  });

  if (!picked) throw new vscode.CancellationError();

  if (picked.providerType === 'openrouter') {
    await cfg.update('openrouter.provider', 'openrouter', vscode.ConfigurationTarget.Global);
    return 'openrouter';
  }

  if (picked.providerType) {
    await cfg.update('openrouter.provider', picked.providerType, vscode.ConfigurationTarget.Global);
  }

  if (picked.openSettings) {
    await vscode.commands.executeCommand('marklingo.openSettings');
    throw new vscode.CancellationError();
  }

  throw new vscode.CancellationError();
}

function readStringSetting(cfg: vscode.WorkspaceConfiguration, key: string): string {
  return (cfg.get<string>(key) ?? '').trim();
}

function hasExplicitStringConfiguration(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = cfg.inspect<string>(key);
  return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
}

function readLegacyProviderBaseUrl(cfg: vscode.WorkspaceConfiguration): string {
  if (!hasExplicitStringConfiguration(cfg, 'openrouter.baseUrl')) return '';
  const value = readStringSetting(cfg, 'openrouter.baseUrl');
  return normalizeBaseUrl(value) === DEFAULT_OPENROUTER_BASE_URL ? '' : value;
}

export function resolveProviderBaseUrl(providerType: ProviderType, rawBaseUrl?: string): { baseUrl: string; origin: string } {
  const fallbackBaseUrl = getProviderDefaultBaseUrl(providerType);
  const candidate = providerType === 'openrouter'
    ? DEFAULT_OPENROUTER_BASE_URL
    : (rawBaseUrl?.trim() ? rawBaseUrl : fallbackBaseUrl);
  const url = parseOpenRouterBaseUrl(candidate);
  return { baseUrl: normalizeBaseUrl(url.toString()), origin: url.origin };
}

export function resolveConfiguredProvider(): { providerType: ProviderType; baseUrl: string; origin: string } {
  const cfg = getConfiguration();
  const providerType = getConfiguredProviderType(cfg);
  const providerBaseUrlSetting = getProviderBaseUrlSetting(providerType);
  const rawBaseUrl = providerType === 'openrouter'
    ? DEFAULT_OPENROUTER_BASE_URL
    : (providerBaseUrlSetting ? readStringSetting(cfg, providerBaseUrlSetting) : '') ||
      readLegacyProviderBaseUrl(cfg) ||
      getProviderDefaultBaseUrl(providerType);
  const { baseUrl, origin } = resolveProviderBaseUrl(providerType, rawBaseUrl);
  return { providerType, baseUrl, origin };
}

function getApiKeySecretName(origin: string): string {
  const digest = createHash('sha256').update(origin).digest('hex').slice(0, 24);
  return `${OPENROUTER_API_KEY_SECRET_PREFIX}${digest}`;
}

function resolveApiKeyOrigin(baseUrl?: string): string {
  return baseUrl ? parseOpenRouterBaseUrl(baseUrl).origin : resolveConfiguredProvider().origin;
}

function getApiKeyOrigins(context: vscode.ExtensionContext): string[] {
  const value = context.globalState.get<unknown>(OPENROUTER_API_KEY_ORIGINS_STATE);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

async function rememberApiKeyOrigin(context: vscode.ExtensionContext, origin: string): Promise<void> {
  const origins = new Set(getApiKeyOrigins(context));
  origins.add(origin);
  await context.globalState.update(OPENROUTER_API_KEY_ORIGINS_STATE, [...origins].sort());
}

export async function getStoredOpenRouterApiKey(
  context: vscode.ExtensionContext,
  baseUrl?: string,
  options: { includeLegacy?: boolean } = {},
): Promise<string | undefined> {
  const origin = resolveApiKeyOrigin(baseUrl);
  const fromOriginSecret = await context.secrets.get(getApiKeySecretName(origin));
  if (fromOriginSecret?.trim()) return fromOriginSecret.trim();
  if (options.includeLegacy) {
    const legacySecret = await context.secrets.get(LEGACY_OPENROUTER_API_KEY_SECRET);
    if (legacySecret?.trim()) return legacySecret.trim();
  }
  return undefined;
}

async function resolveApiKey(
  context: vscode.ExtensionContext,
  options: { providerType: ProviderType; baseUrl: string; origin: string; allowLegacyMigration: boolean },
): Promise<string> {
  if (!providerSupportsApiKey(options.providerType)) return '';

  const fromSecret = await context.secrets.get(getApiKeySecretName(options.origin));
  if (fromSecret?.trim()) return fromSecret.trim();

  const legacySecret = await context.secrets.get(LEGACY_OPENROUTER_API_KEY_SECRET);
  if (options.allowLegacyMigration && legacySecret?.trim()) {
    const apiKey = legacySecret.trim();
    await context.secrets.store(getApiKeySecretName(options.origin), apiKey);
    await rememberApiKeyOrigin(context, options.origin);
    await context.secrets.delete(LEGACY_OPENROUTER_API_KEY_SECRET);
    return apiKey;
  }

  if (!providerRequiresApiKey(options.providerType)) return '';

  const input = await vscode.window.showInputBox({
    title: getProviderApiKeyInputTitle(options.providerType),
    prompt: getProviderApiKeyInputPrompt(options.providerType, options.baseUrl),
    password: true,
    ignoreFocusOut: true,
  });
  if (!input?.trim()) {
    throw new Error(getMissingProviderApiKeyMessage(options.providerType));
  }
  const apiKey = input.trim();
  await context.secrets.store(getApiKeySecretName(options.origin), apiKey);
  await rememberApiKeyOrigin(context, options.origin);
  return apiKey;
}

function hasExplicitModelConfiguration(cfg: vscode.WorkspaceConfiguration): boolean {
  const legacy = cfg.inspect<string>('openrouter.modelId');
  const openRouterProvider = cfg.inspect<string>(OPENROUTER_PROVIDER_MODEL_ID_SETTING);
  return [
    legacy?.globalValue,
    legacy?.workspaceValue,
    legacy?.workspaceFolderValue,
    openRouterProvider?.globalValue,
    openRouterProvider?.workspaceValue,
    openRouterProvider?.workspaceFolderValue,
  ]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
}

async function resolveModelId(context: vscode.ExtensionContext, providerType: ProviderType): Promise<string> {
  const cfg = getConfiguration();
  const legacyModelId = hasExplicitStringConfiguration(cfg, 'openrouter.modelId')
    ? readStringSetting(cfg, 'openrouter.modelId')
    : '';

  if (providerType !== 'openrouter') {
    const modelIdSetting = getProviderModelIdSetting(providerType);
    const providerModelId = modelIdSetting ? readStringSetting(cfg, modelIdSetting) : '';
    const modelId = coerceProviderModelId(
      providerType,
      providerModelId || legacyModelId || getProviderDefaultModelId(providerType),
    );
    if (!modelId) {
      throw new Error('Missing Provider modelId. Open MarkLingo settings, select a model, then save and verify the provider.');
    }
    return modelId;
  }

  const providerModelId = hasExplicitStringConfiguration(cfg, OPENROUTER_PROVIDER_MODEL_ID_SETTING)
    ? readStringSetting(cfg, OPENROUTER_PROVIDER_MODEL_ID_SETTING)
    : '';
  const modelId = providerModelId || legacyModelId || DEFAULT_OPENROUTER_MODEL_ID;
  if (hasExplicitModelConfiguration(cfg) || hasOpenRouterModelAccepted(context)) {
    await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, modelId);
    await markOpenRouterModelAccepted(context);
    return modelId;
  }

  const lastUsed = (context.globalState.get<string>(OPENROUTER_MODEL_ID_LAST_USED) ?? '').trim();
  const defaultModelId = lastUsed || modelId || DEFAULT_OPENROUTER_MODEL_ID;

  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: OpenRouter Model ID',
    prompt: `Model ID. Press Enter for ${defaultModelId}.`,
    password: false,
    value: defaultModelId,
    placeHolder: `Default: ${defaultModelId}`,
    ignoreFocusOut: true,
  });

  // Pressing ESC or closing the prompt returns undefined.
  if (input === undefined) {
    throw new Error('Missing OpenRouter modelId. Configure marklingo.openrouter.modelId in settings or enter it in the prompt.');
  }

  const finalModelId = input.trim() || defaultModelId;

  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, finalModelId);
  await cfg.update('openrouter.modelId', finalModelId, vscode.ConfigurationTarget.Global);
  await markOpenRouterModelAccepted(context);
  return finalModelId;
}

export async function getOpenRouterSettings(context: vscode.ExtensionContext): Promise<OpenRouterSettings> {
  let cfg = getConfiguration();
  const providerType = await resolveProviderTypeForTranslation(context, cfg);
  cfg = getConfiguration();
  const providerBaseUrlSetting = getProviderBaseUrlSetting(providerType);
  const rawBaseUrl = providerType === 'openrouter'
    ? DEFAULT_OPENROUTER_BASE_URL
    : (providerBaseUrlSetting ? readStringSetting(cfg, providerBaseUrlSetting) : '') ||
      readLegacyProviderBaseUrl(cfg) ||
      getProviderDefaultBaseUrl(providerType);
  const { baseUrl, origin } = resolveProviderBaseUrl(providerType, rawBaseUrl);
  const apiKey = await resolveApiKey(context, {
    providerType,
    baseUrl,
    origin,
    allowLegacyMigration: !hasExplicitProviderConfiguration(cfg),
  });
  const modelId = await resolveModelId(context, providerType);

  return { providerType, baseUrl, modelId, apiKey };
}

export async function storeOpenRouterApiKey(
  context: vscode.ExtensionContext,
  apiKey: string,
  baseUrl?: string,
): Promise<void> {
  const origin = resolveApiKeyOrigin(baseUrl);
  const legacySecret = await context.secrets.get(LEGACY_OPENROUTER_API_KEY_SECRET);
  const defaultOpenRouterOrigin = parseOpenRouterBaseUrl(DEFAULT_OPENROUTER_BASE_URL).origin;
  if (legacySecret?.trim() && origin !== defaultOpenRouterOrigin) {
    const defaultSecretName = getApiKeySecretName(defaultOpenRouterOrigin);
    const existingDefaultSecret = await context.secrets.get(defaultSecretName);
    if (!existingDefaultSecret?.trim()) {
      await context.secrets.store(defaultSecretName, legacySecret.trim());
      await rememberApiKeyOrigin(context, defaultOpenRouterOrigin);
    }
  }
  await context.secrets.store(getApiKeySecretName(origin), apiKey.trim());
  await rememberApiKeyOrigin(context, origin);
  await context.secrets.delete(LEGACY_OPENROUTER_API_KEY_SECRET);
}

export async function seedOpenRouterApiKeyForTest(context: vscode.ExtensionContext, apiKey: string): Promise<string> {
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    throw new Error('OpenRouter test credential seeding is only available in VS Code test mode.');
  }
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error('OpenRouter test credential seeding requires a non-empty API key.');
  }
  const { origin } = resolveConfiguredProvider();
  await context.secrets.store(getApiKeySecretName(origin), trimmedApiKey);
  await rememberApiKeyOrigin(context, origin);
  return origin;
}

export async function deleteOpenRouterApiKey(context: vscode.ExtensionContext): Promise<void> {
  const { origin } = resolveConfiguredProvider();
  await context.secrets.delete(getApiKeySecretName(origin));
  await context.secrets.delete(LEGACY_OPENROUTER_API_KEY_SECRET);
}

export async function hasOpenRouterApiKey(
  context: vscode.ExtensionContext,
  baseUrl?: string,
  options: { includeLegacy?: boolean } = {},
): Promise<boolean> {
  const origin = resolveApiKeyOrigin(baseUrl);
  const fromSecret = await context.secrets.get(getApiKeySecretName(origin));
  if (fromSecret?.trim()) return true;
  if (!options.includeLegacy) return false;
  const legacySecret = await context.secrets.get(LEGACY_OPENROUTER_API_KEY_SECRET);
  return Boolean(legacySecret?.trim());
}

export async function resetOpenRouterSecretsAndState(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(LEGACY_OPENROUTER_API_KEY_SECRET);
  for (const origin of getApiKeyOrigins(context)) {
    await context.secrets.delete(getApiKeySecretName(origin));
  }
  await context.globalState.update(OPENROUTER_API_KEY_ORIGINS_STATE, undefined);
  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, undefined);
}

function buildProviderHeaders(settings: Pick<OpenRouterSettings, 'providerType' | 'apiKey'>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (providerSupportsApiKey(settings.providerType) && settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  if (providerSupportsOpenRouterHeaders(settings.providerType)) {
    headers['HTTP-Referer'] = 'https://github.com/zzgosh/marklingo';
    headers['X-Title'] = 'MarkLingo';
  }

  return headers;
}

function resolveReasoningOptions(
  providerType: ProviderType,
  reasoning: ReasoningOptions | null | undefined,
): ReasoningOptions | undefined {
  if (!providerSupportsOpenRouterReasoningControl(providerType)) return undefined;
  if (reasoning === null) return undefined;
  return reasoning ?? { effort: 'none', exclude: true };
}

function resolveReasoningEffort(
  providerType: ProviderType,
  reasoning: ReasoningOptions | null | undefined,
): 'none' | undefined {
  if (getProviderReasoningControl(providerType) !== 'reasoningEffortNone') return undefined;
  if (reasoning === null) return undefined;
  return 'none';
}

function resolveThinkingOptions(
  providerType: ProviderType,
  reasoning: ReasoningOptions | null | undefined,
): ThinkingOptions | undefined {
  if (getProviderReasoningControl(providerType) !== 'thinkingDisabled') return undefined;
  if (reasoning === null) return undefined;
  return { type: 'disabled' };
}

function resolveTemperature(providerType: ProviderType, temperature: number | undefined): number | undefined {
  if (temperature === undefined) return undefined;
  // Kimi K2.x rejects non-default temperature values on the Chat Completions endpoint.
  if (!providerSupportsTemperatureControl(providerType)) return undefined;
  return temperature;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readModelContextLength(model: unknown): number | undefined {
  if (!model || typeof model !== 'object') return undefined;
  const value = model as Record<string, unknown>;
  const openRouterContextLength = readPositiveInteger(value.context_length);
  if (openRouterContextLength) return openRouterContextLength;

  const meta = value.meta;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return readPositiveInteger((meta as Record<string, unknown>).n_ctx);
  }

  return undefined;
}

function normalizeModelIdForLookup(modelId: string): string {
  return modelId.trim().split(':')[0] ?? modelId.trim();
}

function isMatchingModelId(model: unknown, requestedModelId: string): boolean {
  if (!model || typeof model !== 'object') return false;
  const value = model as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : '';
  const canonicalSlug = typeof value.canonical_slug === 'string' ? value.canonical_slug : '';
  const requestedBase = normalizeModelIdForLookup(requestedModelId);
  const idBase = normalizeModelIdForLookup(id);
  return (
    id === requestedModelId ||
    canonicalSlug === requestedModelId ||
    idBase === requestedBase ||
    canonicalSlug === requestedBase ||
    canonicalSlug.startsWith(`${requestedBase}-`)
  );
}

export async function getOpenRouterModelContextLength(settings: OpenRouterSettings): Promise<number | undefined> {
  const cacheKey = `${settings.baseUrl}|${settings.modelId}`;
  const cached = modelContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.contextLength;

  try {
    const res = await fetchJsonWithTimeout(
      `${settings.baseUrl}/models`,
      {
        method: 'GET',
        headers: buildProviderHeaders(settings),
      },
      5_000,
    );
    if (!res.ok || !res.json || typeof res.json !== 'object') return undefined;

    const data = (res.json as { data?: unknown }).data;
    if (!Array.isArray(data)) return undefined;

    const model = data.find((item) => isMatchingModelId(item, settings.modelId));
    const contextLength = readModelContextLength(model);
    modelContextCache.set(cacheKey, { contextLength, expiresAt: Date.now() + MODEL_CONTEXT_CACHE_TTL_MS });
    return contextLength;
  } catch {
    modelContextCache.set(cacheKey, { contextLength: undefined, expiresAt: Date.now() + 60_000 });
    return undefined;
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; statusText: string; json: unknown; text: string }> {
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  }
  externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // Ignore invalid JSON here so callers can still inspect the response text.
    }
    return { ok: res.ok, status: res.status, statusText: res.statusText, json, text };
  } finally {
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    clearTimeout(id);
  }
}

export async function openRouterChatCompletion(
  settings: OpenRouterSettings,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 60_000;

  const url = `${settings.baseUrl}/chat/completions`;
  const body = {
    model: settings.modelId,
    messages,
    stream: false,
    temperature: resolveTemperature(settings.providerType, options.temperature),
    top_p: options.topP,
    top_k: options.topK,
    repeat_penalty: options.repeatPenalty,
    max_tokens: options.maxTokens,
    response_format: options.responseFormat,
    reasoning: resolveReasoningOptions(settings.providerType, options.reasoning),
    reasoning_effort: resolveReasoningEffort(settings.providerType, options.reasoning),
    thinking: resolveThinkingOptions(settings.providerType, options.reasoning),
  };

  const res = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: buildProviderHeaders(settings),
      body: JSON.stringify(body),
    },
    timeoutMs,
    options.signal,
  );

  if (!res.ok) {
    const errorDetail = typeof res.text === 'string' && res.text.trim() ? res.text.trim() : res.statusText;
    throw new Error(`Provider request failed: HTTP ${res.status}. ${errorDetail}`);
  }

  const data = res.json as any;
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Provider returned empty content or an unexpected response shape.');
  }
  return content;
}
