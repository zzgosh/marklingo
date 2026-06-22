export type ProviderType =
  | 'openrouter'
  | 'openai'
  | 'deepseek'
  | 'moonshot'
  | 'glm'
  | 'xiaomiMimo'
  | 'openaiCompatible';

export type ProviderAuthMode = 'bearer' | 'optional' | 'none';
export type ProviderReasoningControl = 'openrouter' | 'reasoningEffortNone' | 'thinkingDisabled' | 'none';
export type ModelTag = 'fast' | 'quality' | 'slow' | 'local';

export type ProviderBaseUrlOption = {
  label: string;
  baseUrl: string;
};

export type ProviderModelOption = {
  label: string;
  modelId: string;
  gatewayModelId?: string;
  tags?: readonly ModelTag[];
};

export type KnownLocalModelTagRule = {
  pattern: string;
  flags?: string;
  tags: readonly ModelTag[];
};

export type ProviderPreset = {
  id: ProviderType;
  label: string;
  description: string;
  defaultBaseUrl: string;
  defaultModelId: string;
  authMode: ProviderAuthMode;
  baseUrlEditable: boolean;
  modelIdEditable: boolean;
  reasoningControl: ProviderReasoningControl;
  baseUrlOptions?: ProviderBaseUrlOption[];
  modelOptions: ProviderModelOption[];
  deprecatedModelReplacements?: Readonly<Record<string, string>>;
  baseUrlSetting?: string;
  modelIdSetting?: string;
};

export const DEFAULT_OPENROUTER_MODEL_ID = 'google/gemini-3.1-flash-lite';
export const DEFAULT_PROVIDER_TYPE: ProviderType = 'openrouter';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'http://127.0.0.1:8080/v1';

export const OPENROUTER_PROVIDER_MODEL_ID_SETTING = 'providers.openrouter.modelId';
export const OPENAI_COMPATIBLE_BASE_URL_SETTING = 'providers.openaiCompatible.baseUrl';
export const OPENAI_COMPATIBLE_MODEL_ID_SETTING = 'providers.openaiCompatible.modelId';

export const KNOWN_LOCAL_MODEL_TAG_RULES: readonly KnownLocalModelTagRule[] = [
  {
    pattern: 'hy[-_ ]?mt2',
    flags: 'i',
    tags: ['local', 'slow'],
  },
  {
    pattern: 'gpt[-_ ]?5[._-]?3[-_ ]?codex[-_ ]?spark',
    flags: 'i',
    tags: ['quality', 'fast'],
  },
] as const;

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Hosted model gateway via openrouter.ai.',
    defaultBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    defaultModelId: DEFAULT_OPENROUTER_MODEL_ID,
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: true,
    reasoningControl: 'openrouter',
    modelIdSetting: OPENROUTER_PROVIDER_MODEL_ID_SETTING,
    modelOptions: [
      { label: 'Gemini 3.1 Flash Lite', modelId: DEFAULT_OPENROUTER_MODEL_ID, tags: ['quality', 'fast'] },
      { label: 'DeepSeek V4 Flash', modelId: 'deepseek/deepseek-v4-flash', tags: ['quality', 'fast'] },
      { label: 'GPT-5.4 Mini', modelId: 'openai/gpt-5.4-mini', tags: ['quality', 'fast'] },
      { label: 'MiMo V2.5', modelId: 'xiaomi/mimo-v2.5', tags: ['quality', 'slow'] },
    ],
    deprecatedModelReplacements: {
      'xiaomi/mimo-v2-flash': 'xiaomi/mimo-v2.5',
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI API through Chat Completions.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModelId: 'gpt-5.4-mini',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'reasoningEffortNone',
    modelIdSetting: 'providers.openai.modelId',
    modelOptions: [
      { label: 'GPT-5.4 Mini', modelId: 'gpt-5.4-mini', gatewayModelId: 'openai/gpt-5.4-mini', tags: ['quality', 'fast'] },
      { label: 'GPT-5.4 Nano', modelId: 'gpt-5.4-nano', gatewayModelId: 'openai/gpt-5.4-nano', tags: ['fast'] },
      { label: 'GPT-5.4', modelId: 'gpt-5.4', gatewayModelId: 'openai/gpt-5.4', tags: ['quality'] },
      { label: 'GPT-5.5', modelId: 'gpt-5.5', gatewayModelId: 'openai/gpt-5.5', tags: ['quality', 'slow'] },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModelId: 'deepseek-v4-flash',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'thinkingDisabled',
    modelIdSetting: 'providers.deepseek.modelId',
    modelOptions: [
      { label: 'DeepSeek V4 Flash', modelId: 'deepseek-v4-flash', gatewayModelId: 'deepseek/deepseek-v4-flash', tags: ['quality', 'fast'] },
      { label: 'DeepSeek V4 Pro', modelId: 'deepseek-v4-pro', gatewayModelId: 'deepseek/deepseek-v4-pro', tags: ['quality', 'slow'] },
    ],
  },
  {
    id: 'moonshot',
    label: 'Moonshot',
    description: 'Moonshot/Kimi OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    defaultModelId: 'kimi-k2.6',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'thinkingDisabled',
    modelIdSetting: 'providers.moonshot.modelId',
    baseUrlOptions: [
      { label: 'Global', baseUrl: 'https://api.moonshot.ai/v1' },
      { label: 'China', baseUrl: 'https://api.moonshot.cn/v1' },
    ],
    modelOptions: [
      { label: 'Kimi K2.6', modelId: 'kimi-k2.6', gatewayModelId: 'moonshotai/kimi-k2.6', tags: ['quality'] },
      { label: 'Kimi K2.5', modelId: 'kimi-k2.5', gatewayModelId: 'moonshotai/kimi-k2.5', tags: ['quality'] },
    ],
  },
  {
    id: 'glm',
    label: 'GLM',
    description: 'GLM OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModelId: 'glm-4.7',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'thinkingDisabled',
    modelIdSetting: 'providers.glm.modelId',
    baseUrlOptions: [
      { label: 'Global', baseUrl: 'https://api.z.ai/api/paas/v4' },
      { label: 'China', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    ],
    modelOptions: [
      { label: 'GLM-4.7', modelId: 'glm-4.7', gatewayModelId: 'zai/glm-4.7', tags: ['quality'] },
      { label: 'GLM-5', modelId: 'glm-5', gatewayModelId: 'zai/glm-5', tags: ['quality', 'slow'] },
      { label: 'GLM-5.1', modelId: 'glm-5.1', gatewayModelId: 'zai/glm-5.1', tags: ['quality', 'slow'] },
    ],
  },
  {
    id: 'xiaomiMimo',
    label: 'Xiaomi MiMo',
    description: 'Xiaomi MiMo OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModelId: 'mimo-v2.5',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'thinkingDisabled',
    modelIdSetting: 'providers.xiaomiMimo.modelId',
    modelOptions: [
      { label: 'MiMo V2.5', modelId: 'mimo-v2.5', gatewayModelId: 'xiaomi/mimo-v2.5', tags: ['quality', 'slow'] },
      { label: 'MiMo V2.5 Pro', modelId: 'mimo-v2.5-pro', gatewayModelId: 'xiaomi/mimo-v2.5-pro', tags: ['quality', 'slow'] },
    ],
    deprecatedModelReplacements: {
      'mimo-v2-flash': 'mimo-v2.5',
    },
  },
  {
    id: 'openaiCompatible',
    label: 'Custom OpenAI Compatible',
    description: 'Custom endpoint compatible with OpenAI Chat Completions.',
    defaultBaseUrl: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
    defaultModelId: '',
    authMode: 'optional',
    baseUrlEditable: true,
    modelIdEditable: true,
    reasoningControl: 'none',
    baseUrlSetting: OPENAI_COMPATIBLE_BASE_URL_SETTING,
    modelIdSetting: OPENAI_COMPATIBLE_MODEL_ID_SETTING,
    modelOptions: [
      { label: 'Custom...', modelId: '' },
    ],
  },
] as const;

export const PROVIDER_TYPES = new Set<ProviderType>(PROVIDER_PRESETS.map((preset) => preset.id));

export function getProviderPreset(providerType: ProviderType): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.id === providerType) ?? PROVIDER_PRESETS[0];
}

export function coerceProviderType(value: unknown): ProviderType {
  return PROVIDER_TYPES.has(value as ProviderType) ? value as ProviderType : DEFAULT_PROVIDER_TYPE;
}

export function getProviderDefaultBaseUrl(providerType: ProviderType): string {
  return getProviderPreset(providerType).defaultBaseUrl;
}

export function getProviderDefaultModelId(providerType: ProviderType): string {
  return getProviderPreset(providerType).defaultModelId;
}

export function normalizeDeprecatedProviderModelId(providerType: ProviderType, modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return '';
  return getProviderPreset(providerType).deprecatedModelReplacements?.[trimmed] ?? trimmed;
}

export function getProviderGatewayModelId(providerType: ProviderType, modelId: string): string | undefined {
  const trimmed = normalizeDeprecatedProviderModelId(providerType, modelId);
  if (!trimmed || providerType === 'openrouter' || providerType === 'openaiCompatible') return undefined;
  return getProviderPreset(providerType).modelOptions.find((option) => option.modelId === trimmed)?.gatewayModelId;
}

export function getProviderBaseUrlSetting(providerType: ProviderType): string | undefined {
  return getProviderPreset(providerType).baseUrlSetting;
}

export function getProviderModelIdSetting(providerType: ProviderType): string | undefined {
  return getProviderPreset(providerType).modelIdSetting;
}

export function getProviderReasoningControl(providerType: ProviderType): ProviderReasoningControl {
  return getProviderPreset(providerType).reasoningControl;
}

export function getProviderBaseUrlCandidates(providerType: ProviderType, preferredBaseUrl?: string): string[] {
  const preset = getProviderPreset(providerType);
  const preferred = preferredBaseUrl?.trim();
  const candidates = preset.baseUrlOptions?.length
    ? [
        preferred,
        ...preset.baseUrlOptions.map((option) => option.baseUrl),
        preset.defaultBaseUrl,
      ]
    : [
        preferred || preset.defaultBaseUrl,
      ];
  const seen = new Set<string>();
  return candidates.filter((value): value is string => Boolean(value?.trim())).filter((candidate) => {
    const normalized = candidate.replace(/\/+$/, '');
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function providerSupportsApiKey(providerType: ProviderType): boolean {
  return getProviderPreset(providerType).authMode !== 'none';
}

export function providerRequiresApiKey(providerType: ProviderType): boolean {
  return getProviderPreset(providerType).authMode === 'bearer';
}

export function providerSupportsEditableModelId(providerType: ProviderType): boolean {
  return getProviderPreset(providerType).modelIdEditable;
}

export function providerAcceptsModelId(providerType: ProviderType, modelId: string): boolean {
  const preset = getProviderPreset(providerType);
  const normalized = normalizeDeprecatedProviderModelId(providerType, modelId);
  if (preset.modelIdEditable) return normalized.length > 0 || preset.defaultModelId.length === 0;
  return preset.modelOptions.some((option) => option.modelId === normalized);
}

export function coerceProviderModelId(providerType: ProviderType, modelId: string): string {
  const normalized = normalizeDeprecatedProviderModelId(providerType, modelId);
  if (providerAcceptsModelId(providerType, normalized)) return normalized;
  return getProviderDefaultModelId(providerType);
}

function uniqueModelTags(tags: readonly ModelTag[]): ModelTag[] {
  const seen = new Set<ModelTag>();
  const result: ModelTag[] = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

// Keep this endpoint heuristic in sync with the webview copy in settingsHtml.ts.
function parseIpv4Literal(hostname: string): number[] | undefined {
  const parts = hostname.split('.');
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : undefined;
}

function isLocalIpv4Literal(hostname: string): boolean {
  const octets = parseIpv4Literal(hostname);
  if (!octets) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isLocalEndpoint(baseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    isLocalIpv4Literal(hostname)
  );
}

export function getKnownLocalModelTags(modelId: string): ModelTag[] {
  const trimmed = modelId.trim();
  if (!trimmed) return [];

  for (const rule of KNOWN_LOCAL_MODEL_TAG_RULES) {
    if (new RegExp(rule.pattern, rule.flags).test(trimmed)) {
      return uniqueModelTags(rule.tags);
    }
  }

  return [];
}

export function getProviderModelTags(providerType: ProviderType, baseUrl: string, modelId: string): ModelTag[] {
  const trimmed = normalizeDeprecatedProviderModelId(providerType, modelId);
  const option = getProviderPreset(providerType).modelOptions.find((item) => item.modelId === trimmed);
  if (option?.tags) return uniqueModelTags(option.tags);

  if (providerType === 'openaiCompatible' && isLocalEndpoint(baseUrl)) {
    return uniqueModelTags(['local', ...getKnownLocalModelTags(trimmed)]);
  }

  return [];
}

export function providerSupportsOpenRouterHeaders(providerType: ProviderType): boolean {
  return providerType === 'openrouter';
}

export function providerSupportsOpenRouterReasoningControl(providerType: ProviderType): boolean {
  return getProviderReasoningControl(providerType) === 'openrouter';
}

export function providerSupportsReasoningDisable(providerType: ProviderType): boolean {
  return getProviderReasoningControl(providerType) !== 'none';
}

export function providerSupportsTemperatureControl(providerType: ProviderType): boolean {
  return providerType !== 'moonshot';
}
