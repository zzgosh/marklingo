import * as vscode from 'vscode';
import { createHash } from 'node:crypto';

export type OpenRouterSettings = {
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
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: ResponseFormat;
  reasoning?: ReasoningOptions;
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

const OPENROUTER_API_KEY_SECRET_PREFIX = 'markdownTranslator.openrouter.apiKey';
const OPENROUTER_MODEL_ID_LAST_USED = 'markdownTranslator.openrouter.lastModelId';
const OPENROUTER_CONFIRMED_CUSTOM_ORIGINS = 'markdownTranslator.openrouter.confirmedCustomOrigins';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OFFICIAL_OPENROUTER_ORIGIN = 'https://openrouter.ai';
const MODEL_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;

const modelContextCache = new Map<string, { expiresAt: number; contextLength: number | undefined }>();

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseBaseUrl(baseUrl: string): URL {
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

function isOfficialOpenRouterUrl(url: URL): boolean {
  return url.origin === OFFICIAL_OPENROUTER_ORIGIN;
}

function getApiKeySecretKey(origin: string): string {
  return `${OPENROUTER_API_KEY_SECRET_PREFIX}.${sha256(origin).slice(0, 16)}`;
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('markdownTranslator');
}

async function confirmCustomOrigin(context: vscode.ExtensionContext, url: URL): Promise<void> {
  if (isOfficialOpenRouterUrl(url)) return;

  const confirmedOrigins = context.globalState.get<string[]>(OPENROUTER_CONFIRMED_CUSTOM_ORIGINS) ?? [];
  if (confirmedOrigins.includes(url.origin)) return;

  const picked = await vscode.window.showWarningMessage(
    `Markdown Translator: You are about to use a custom OpenRouter endpoint: ${url.origin}. API keys are stored separately per endpoint and the official OpenRouter key will not be reused. Continue?`,
    { modal: true },
    'Use Custom Endpoint',
  );
  if (picked !== 'Use Custom Endpoint') {
    throw new Error('Custom OpenRouter endpoint was canceled.');
  }

  await context.globalState.update(OPENROUTER_CONFIRMED_CUSTOM_ORIGINS, [...confirmedOrigins, url.origin]);
}

async function resolveBaseUrl(context: vscode.ExtensionContext): Promise<{ baseUrl: string; origin: string; official: boolean }> {
  const cfg = getConfiguration();
  const rawBaseUrl = cfg.get<string>('openrouter.baseUrl') ?? DEFAULT_OPENROUTER_BASE_URL;
  const url = parseBaseUrl(rawBaseUrl);
  await confirmCustomOrigin(context, url);
  return {
    baseUrl: normalizeBaseUrl(url.toString()),
    origin: url.origin,
    official: isOfficialOpenRouterUrl(url),
  };
}

async function resolveApiKey(context: vscode.ExtensionContext, endpoint: { origin: string; official: boolean }): Promise<string> {
  const secretKey = getApiKeySecretKey(endpoint.origin);
  const fromSecret = await context.secrets.get(secretKey);
  if (fromSecret?.trim()) return fromSecret.trim();

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter API Key',
    prompt: `Enter the API key for ${endpoint.origin}. It will be stored in VS Code SecretStorage and separated by endpoint.`,
    password: true,
    ignoreFocusOut: true,
  });
  if (!input?.trim()) {
    throw new Error('Missing OpenRouter API key. Save it from Markdown Translator settings or the API key command.');
  }
  const apiKey = input.trim();
  await context.secrets.store(secretKey, apiKey);
  return apiKey;
}

async function resolveModelId(context: vscode.ExtensionContext): Promise<string> {
  const cfg = getConfiguration();
  const modelId = (cfg.get<string>('openrouter.modelId') ?? '').trim();
  if (modelId) {
    await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, modelId);
    return modelId;
  }

  const lastUsed = (context.globalState.get<string>(OPENROUTER_MODEL_ID_LAST_USED) ?? '').trim();
  if (lastUsed) return lastUsed;

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter Model ID',
    prompt: 'Enter the OpenRouter model ID, for example openai/gpt-4o-mini. It will be remembered for later translations.',
    password: false,
    placeHolder: 'Example: openai/gpt-4o-mini',
    ignoreFocusOut: true,
  });

  // Pressing ESC or closing the prompt returns undefined.
  if (input === undefined) {
    throw new Error('Missing OpenRouter modelId. Configure markdownTranslator.openrouter.modelId in settings or enter it in the prompt.');
  }

  const finalModelId = input.trim();
  if (!finalModelId) {
    throw new Error('Missing OpenRouter modelId. Configure markdownTranslator.openrouter.modelId in settings or enter it in the prompt.');
  }

  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, finalModelId);
  return finalModelId;
}

export async function getOpenRouterSettings(context: vscode.ExtensionContext): Promise<OpenRouterSettings> {
  const endpoint = await resolveBaseUrl(context);
  const modelId = await resolveModelId(context);
  const apiKey = await resolveApiKey(context, endpoint);

  return {
    baseUrl: endpoint.baseUrl,
    modelId,
    apiKey,
  };
}

export async function getCurrentOpenRouterEndpoint(context: vscode.ExtensionContext): Promise<{ baseUrl: string; origin: string; official: boolean }> {
  return resolveBaseUrl(context);
}

export async function storeOpenRouterApiKeyForCurrentEndpoint(context: vscode.ExtensionContext, apiKey: string): Promise<string> {
  const endpoint = await resolveBaseUrl(context);
  await context.secrets.store(getApiKeySecretKey(endpoint.origin), apiKey.trim());
  return endpoint.origin;
}

export async function deleteOpenRouterApiKeyForCurrentEndpoint(context: vscode.ExtensionContext): Promise<string> {
  const endpoint = await resolveBaseUrl(context);
  await context.secrets.delete(getApiKeySecretKey(endpoint.origin));
  return endpoint.origin;
}

export async function hasOpenRouterApiKeyForCurrentEndpoint(context: vscode.ExtensionContext): Promise<boolean> {
  const endpoint = await resolveBaseUrl(context);
  const secretKey = getApiKeySecretKey(endpoint.origin);
  const fromSecret = await context.secrets.get(secretKey);
  if (fromSecret?.trim()) return true;
  return false;
}

export async function resetOpenRouterSecretsAndState(context: vscode.ExtensionContext): Promise<void> {
  const confirmedOrigins = context.globalState.get<string[]>(OPENROUTER_CONFIRMED_CUSTOM_ORIGINS) ?? [];
  const origins = new Set([OFFICIAL_OPENROUTER_ORIGIN, ...confirmedOrigins]);
  for (const origin of origins) {
    await context.secrets.delete(getApiKeySecretKey(origin));
  }
  await context.globalState.update(OPENROUTER_CONFIRMED_CUSTOM_ORIGINS, undefined);
  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, undefined);
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readModelContextLength(model: unknown): number | undefined {
  if (!model || typeof model !== 'object') return undefined;
  const value = model as Record<string, unknown>;
  return readPositiveInteger(value.context_length);
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
): Promise<{ ok: boolean; status: number; statusText: string; json: unknown; text: string }> {
  const controller = new AbortController();
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
    max_tokens: options.maxTokens,
    response_format: options.responseFormat,
    reasoning: options.reasoning ?? { effort: 'none', exclude: true },
  };

  const res = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter recommended headers.
        'HTTP-Referer': 'https://github.com/jeejeeguan/vscode-markdown-translator',
        'X-Title': 'vscode-markdown-translator',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
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
