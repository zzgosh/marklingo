import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { hasOpenRouterModelAccepted, markOpenRouterModelAccepted } from '../onboardingState.js';

export type ProviderType = 'openrouter' | 'openaiCompatible';

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

export const DEFAULT_OPENROUTER_MODEL_ID = 'google/gemini-3.1-flash-lite';
export const DEFAULT_PROVIDER_TYPE: ProviderType = 'openrouter';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'http://127.0.0.1:8080/v1';

const LEGACY_OPENROUTER_API_KEY_SECRET = 'marklingo.openrouter.apiKey';
const OPENROUTER_API_KEY_SECRET_PREFIX = 'marklingo.openrouter.apiKey.v2.';
const OPENROUTER_API_KEY_ORIGINS_STATE = 'marklingo.openrouter.apiKeyOrigins';
const OPENROUTER_MODEL_ID_LAST_USED = 'marklingo.openrouter.lastModelId';
const MODEL_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const PROVIDER_TYPES = new Set<ProviderType>(['openrouter', 'openaiCompatible']);

const modelContextCache = new Map<string, { expiresAt: number; contextLength: number | undefined }>();

export function coerceProviderType(value: unknown): ProviderType {
  return PROVIDER_TYPES.has(value as ProviderType) ? value as ProviderType : DEFAULT_PROVIDER_TYPE;
}

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
    throw new Error(`OpenRouter baseUrl is not a valid URL: ${baseUrl}`);
  }

  const isHttps = url.protocol === 'https:';
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!isHttps && !isLocalHttp) {
    throw new Error('OpenRouter baseUrl must use HTTPS, except for localhost debugging.');
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
  if (!hasExplicitProviderConfiguration(cfg)) {
    const rawBaseUrl = cfg.get<string>('openrouter.baseUrl') ?? DEFAULT_OPENROUTER_BASE_URL;
    if (normalizeBaseUrl(rawBaseUrl) !== DEFAULT_OPENROUTER_BASE_URL) return 'openaiCompatible';
  }
  return coerceProviderType(cfg.get<string>('openrouter.provider') ?? DEFAULT_PROVIDER_TYPE);
}

export function getProviderDefaultBaseUrl(providerType: ProviderType): string {
  return providerType === 'openrouter' ? DEFAULT_OPENROUTER_BASE_URL : DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
}

export function resolveProviderBaseUrl(providerType: ProviderType, rawBaseUrl?: string): { baseUrl: string; origin: string } {
  const fallbackBaseUrl = getProviderDefaultBaseUrl(providerType);
  const candidate = providerType === 'openrouter'
    ? DEFAULT_OPENROUTER_BASE_URL
    : (rawBaseUrl && normalizeBaseUrl(rawBaseUrl) !== DEFAULT_OPENROUTER_BASE_URL ? rawBaseUrl : fallbackBaseUrl);
  const url = parseOpenRouterBaseUrl(candidate);
  return { baseUrl: normalizeBaseUrl(url.toString()), origin: url.origin };
}

export function resolveConfiguredProvider(): { providerType: ProviderType; baseUrl: string; origin: string } {
  const cfg = getConfiguration();
  const providerType = getConfiguredProviderType(cfg);
  const rawBaseUrl = cfg.get<string>('openrouter.baseUrl') ?? getProviderDefaultBaseUrl(providerType);
  const { baseUrl, origin } = resolveProviderBaseUrl(providerType, rawBaseUrl);
  return { providerType, baseUrl, origin };
}

function getApiKeySecretName(origin: string): string {
  const digest = createHash('sha256').update(origin).digest('hex').slice(0, 24);
  return `${OPENROUTER_API_KEY_SECRET_PREFIX}${digest}`;
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
  const { origin } = baseUrl
    ? resolveProviderBaseUrl('openaiCompatible', baseUrl)
    : resolveConfiguredProvider();
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
  options: { origin: string; allowLegacyMigration: boolean },
): Promise<string> {
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

  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: Provider API Key',
    prompt: 'Enter the API key for the configured provider. It will be stored in VS Code SecretStorage.',
    password: true,
    ignoreFocusOut: true,
  });
  if (!input?.trim()) {
    throw new Error('Missing Provider API key. Save and verify it from MarkLingo settings or run translation again.');
  }
  const apiKey = input.trim();
  await context.secrets.store(getApiKeySecretName(options.origin), apiKey);
  await rememberApiKeyOrigin(context, options.origin);
  return apiKey;
}

function hasExplicitModelConfiguration(cfg: vscode.WorkspaceConfiguration): boolean {
  const inspected = cfg.inspect<string>('openrouter.modelId');
  return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
}

async function resolveModelId(context: vscode.ExtensionContext): Promise<string> {
  const cfg = getConfiguration();
  const modelId = (cfg.get<string>('openrouter.modelId') ?? '').trim() || DEFAULT_OPENROUTER_MODEL_ID;
  if (hasExplicitModelConfiguration(cfg) || hasOpenRouterModelAccepted(context)) {
    await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, modelId);
    await markOpenRouterModelAccepted(context);
    return modelId;
  }

  const lastUsed = (context.globalState.get<string>(OPENROUTER_MODEL_ID_LAST_USED) ?? '').trim();
  const defaultModelId = lastUsed || modelId || DEFAULT_OPENROUTER_MODEL_ID;

  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: OpenRouter Model ID',
    prompt: `Enter the OpenRouter model ID. Press Enter to use ${defaultModelId}.`,
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
  const cfg = getConfiguration();
  const providerType = getConfiguredProviderType(cfg);
  const rawBaseUrl = cfg.get<string>('openrouter.baseUrl') ?? getProviderDefaultBaseUrl(providerType);
  const { baseUrl, origin } = resolveProviderBaseUrl(providerType, rawBaseUrl);
  const apiKey = await resolveApiKey(context, {
    origin,
    allowLegacyMigration: !hasExplicitProviderConfiguration(cfg),
  });
  const modelId = await resolveModelId(context);

  return { providerType, baseUrl, modelId, apiKey };
}

export async function storeOpenRouterApiKey(
  context: vscode.ExtensionContext,
  apiKey: string,
  baseUrl?: string,
): Promise<void> {
  const { origin } = baseUrl
    ? resolveProviderBaseUrl('openaiCompatible', baseUrl)
    : resolveConfiguredProvider();
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
  const { origin } = baseUrl
    ? resolveProviderBaseUrl('openaiCompatible', baseUrl)
    : resolveConfiguredProvider();
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
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
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
    temperature: options.temperature,
    top_p: options.topP,
    top_k: options.topK,
    repeat_penalty: options.repeatPenalty,
    max_tokens: options.maxTokens,
    response_format: options.responseFormat,
    reasoning: options.reasoning === null ? undefined : options.reasoning ?? { effort: 'none', exclude: true },
  };

  const res = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter recommended headers.
        'HTTP-Referer': 'https://github.com/zzgosh/marklingo',
        'X-Title': 'MarkLingo',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    options.signal,
  );

  if (!res.ok) {
    const errorDetail = typeof res.text === 'string' && res.text.trim() ? res.text.trim() : res.statusText;
    throw new Error(`OpenRouter request failed: HTTP ${res.status}. ${errorDetail}`);
  }

  const data = res.json as any;
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter returned empty content or an unexpected response shape.');
  }
  return content;
}
