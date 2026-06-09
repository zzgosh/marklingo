import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
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
  getProviderPreset,
  providerRequiresApiKey,
  providerSupportsApiKey,
  providerSupportsOpenRouterHeaders,
  providerSupportsOpenRouterReasoningControl,
  providerSupportsTemperatureControl,
  type ProviderType,
} from './providerPresets.js';
import { getGatewayModelContextWindow } from '../usage/modelPricing.js';

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

export type ChatCompletionUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  costCurrency?: string;
};

export type ChatCompletionResult = {
  content: string;
  usage?: ChatCompletionUsage;
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
const OPEN_MARKLINGO_SETTINGS_COMMAND = 'marklingo.openSettings';

const modelContextCache = new Map<string, { expiresAt: number; contextLength: number | undefined }>();

export const PROVIDER_SETUP_REQUIRED_MESSAGE =
  'MarkLingo needs a verified provider before translating. Configure Provider, API key, Base URL, and Model ID in Settings, then Save and Verify.';

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

function hasSavedProviderSetupConfiguration(cfg: vscode.WorkspaceConfiguration): boolean {
  return hasExplicitProviderConfiguration(cfg) ||
    hasExplicitStringConfiguration(cfg, 'openrouter.baseUrl') ||
    hasExplicitStringConfiguration(cfg, 'openrouter.modelId');
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

export async function openProviderSetupSettings(message = PROVIDER_SETUP_REQUIRED_MESSAGE): Promise<never> {
  await vscode.commands.executeCommand(OPEN_MARKLINGO_SETTINGS_COMMAND);
  await vscode.window.showWarningMessage(message);
  throw new vscode.CancellationError();
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

export function resolveConfiguredModelId(cfg: vscode.WorkspaceConfiguration, providerType: ProviderType): string {
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
    return modelId;
  }

  const providerModelId = hasExplicitStringConfiguration(cfg, OPENROUTER_PROVIDER_MODEL_ID_SETTING)
    ? readStringSetting(cfg, OPENROUTER_PROVIDER_MODEL_ID_SETTING)
    : '';
  return providerModelId || legacyModelId || DEFAULT_OPENROUTER_MODEL_ID;
}

function readProviderBaseUrlForTranslation(cfg: vscode.WorkspaceConfiguration, providerType: ProviderType): string {
  if (providerType === 'openrouter') return DEFAULT_OPENROUTER_BASE_URL;

  const preset = getProviderPreset(providerType);
  const providerBaseUrlSetting = getProviderBaseUrlSetting(providerType);
  const configuredBaseUrl = providerBaseUrlSetting ? readStringSetting(cfg, providerBaseUrlSetting) : '';
  const legacyBaseUrl = readLegacyProviderBaseUrl(cfg);
  if (configuredBaseUrl || legacyBaseUrl) return configuredBaseUrl || legacyBaseUrl;
  if (preset.baseUrlEditable) return '';
  return getProviderDefaultBaseUrl(providerType);
}

export async function getOpenRouterSettings(context: vscode.ExtensionContext): Promise<OpenRouterSettings> {
  const cfg = getConfiguration();
  if (!hasSavedProviderSetupConfiguration(cfg)) {
    await openProviderSetupSettings();
  }

  const providerType = getConfiguredProviderType(cfg);
  const rawBaseUrl = readProviderBaseUrlForTranslation(cfg, providerType);
  if (!rawBaseUrl.trim()) {
    await openProviderSetupSettings();
  }

  const { baseUrl, origin } = resolveProviderBaseUrl(providerType, rawBaseUrl);
  const modelId = resolveConfiguredModelId(cfg, providerType);
  if (!modelId.trim()) {
    await openProviderSetupSettings();
  }

  const apiKey = providerSupportsApiKey(providerType)
    ? (await context.secrets.get(getApiKeySecretName(origin)) ?? '').trim()
    : '';

  if (providerRequiresApiKey(providerType) && !apiKey) {
    await openProviderSetupSettings();
  }

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

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeChatCompletionUsage(raw: unknown): ChatCompletionUsage | undefined {
  const usage = readRecord(raw);
  if (!usage) return undefined;
  const promptDetails = readRecord(usage.prompt_tokens_details);
  const completionDetails = readRecord(usage.completion_tokens_details);
  const normalized: ChatCompletionUsage = {
    promptTokens: readNonNegativeInteger(usage.prompt_tokens),
    completionTokens: readNonNegativeInteger(usage.completion_tokens),
    totalTokens: readNonNegativeInteger(usage.total_tokens),
    cachedTokens: readNonNegativeInteger(promptDetails?.cached_tokens),
    cacheWriteTokens: readNonNegativeInteger(promptDetails?.cache_write_tokens),
    reasoningTokens: readNonNegativeInteger(completionDetails?.reasoning_tokens),
    cost: readNonNegativeNumber(usage.cost),
    costCurrency: readNonNegativeNumber(usage.cost) === undefined ? undefined : 'credits',
  };
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined;
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
  const gatewayContextWindow = getGatewayModelContextWindow(settings.providerType, settings.modelId);

  try {
    const res = await fetchJsonWithTimeout(
      `${settings.baseUrl}/models`,
      {
        method: 'GET',
        headers: buildProviderHeaders(settings),
      },
      5_000,
    );
    if (!res.ok || !res.json || typeof res.json !== 'object') return gatewayContextWindow;

    const data = (res.json as { data?: unknown }).data;
    if (!Array.isArray(data)) return gatewayContextWindow;

    const model = data.find((item) => isMatchingModelId(item, settings.modelId));
    const contextLength = readModelContextLength(model) ?? gatewayContextWindow;
    modelContextCache.set(cacheKey, { contextLength, expiresAt: Date.now() + MODEL_CONTEXT_CACHE_TTL_MS });
    return contextLength;
  } catch {
    modelContextCache.set(cacheKey, { contextLength: gatewayContextWindow, expiresAt: Date.now() + 60_000 });
    return gatewayContextWindow;
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
): Promise<ChatCompletionResult> {
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
  return {
    content,
    usage: normalizeChatCompletionUsage(data?.usage),
  };
}
