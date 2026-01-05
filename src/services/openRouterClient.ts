import * as vscode from 'vscode';

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
};

const OPENROUTER_API_KEY_SECRET = 'markdownTranslator.openrouter.apiKey';
const OPENROUTER_MODEL_ID_LAST_USED = 'markdownTranslator.openrouter.lastModelId';

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('markdownTranslator');
}

async function resolveApiKey(context: vscode.ExtensionContext): Promise<string> {
  const fromSecret = await context.secrets.get(OPENROUTER_API_KEY_SECRET);
  if (fromSecret?.trim()) return fromSecret.trim();

  const cfg = getConfiguration();
  const fromSetting = (cfg.get<string>('openrouter.apiKey') ?? '').trim();
  if (fromSetting) return fromSetting;

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter API Key',
    prompt: '请输入 OpenRouter API Key（将安全地存入 VS Code SecretStorage）。',
    password: true,
    ignoreFocusOut: true,
  });
  if (!input?.trim()) {
    throw new Error('缺少 OpenRouter API Key。请在设置中配置 markdownTranslator.openrouter.apiKey 或在提示框中输入。');
  }
  const apiKey = input.trim();
  await context.secrets.store(OPENROUTER_API_KEY_SECRET, apiKey);
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
    prompt: '请输入 OpenRouter modelId（例如：openai/gpt-4o-mini）。设置后将自动记住，后续翻译不会再弹出。',
    password: false,
    placeHolder: '例如：openai/gpt-4o-mini',
    ignoreFocusOut: true,
  });

  // 用户按 ESC / 关闭：input === undefined
  if (input === undefined) {
    throw new Error('缺少 OpenRouter modelId。请在设置中配置 markdownTranslator.openrouter.modelId 或在提示框中输入。');
  }

  const finalModelId = input.trim();
  if (!finalModelId) {
    throw new Error('缺少 OpenRouter modelId。请在设置中配置 markdownTranslator.openrouter.modelId 或在提示框中输入。');
  }

  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, finalModelId);
  return finalModelId;
}

export async function getOpenRouterSettings(context: vscode.ExtensionContext): Promise<OpenRouterSettings> {
  const cfg = getConfiguration();
  const baseUrl = normalizeBaseUrl(cfg.get<string>('openrouter.baseUrl') ?? 'https://openrouter.ai/api/v1');
  const modelId = await resolveModelId(context);
  const apiKey = await resolveApiKey(context);

  return {
    baseUrl,
    modelId,
    apiKey,
  };
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
      // ignore
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
  };

  const res = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter 推荐 Header
        'HTTP-Referer': 'https://github.com/jeejeeguan/vscode-markdown-translator',
        'X-Title': 'vscode-markdown-translator',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const errorDetail = typeof res.text === 'string' && res.text.trim() ? res.text.trim() : res.statusText;
    throw new Error(`OpenRouter 请求失败：HTTP ${res.status}. ${errorDetail}`);
  }

  const data = res.json as any;
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter 返回内容为空或格式不符合预期。');
  }
  return content;
}

