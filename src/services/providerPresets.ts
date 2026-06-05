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

export type ProviderBaseUrlOption = {
  label: string;
  baseUrl: string;
};

export type ProviderModelOption = {
  label: string;
  modelId: string;
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
      { label: DEFAULT_OPENROUTER_MODEL_ID, modelId: DEFAULT_OPENROUTER_MODEL_ID },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI API through Chat Completions.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModelId: 'gpt-5.2',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'reasoningEffortNone',
    modelIdSetting: 'providers.openai.modelId',
    modelOptions: [
      { label: 'GPT-5.2', modelId: 'gpt-5.2' },
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
      { label: 'DeepSeek V4 Flash', modelId: 'deepseek-v4-flash' },
      { label: 'DeepSeek V4 Pro', modelId: 'deepseek-v4-pro' },
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
      { label: 'Kimi K2.6', modelId: 'kimi-k2.6' },
      { label: 'Kimi K2.5', modelId: 'kimi-k2.5' },
    ],
  },
  {
    id: 'glm',
    label: 'GLM',
    description: 'GLM OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModelId: 'glm-5.1',
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
      { label: 'GLM-5.1', modelId: 'glm-5.1' },
      { label: 'GLM-5', modelId: 'glm-5' },
      { label: 'GLM-4.7', modelId: 'glm-4.7' },
    ],
  },
  {
    id: 'xiaomiMimo',
    label: 'Xiaomi MiMo',
    description: 'Xiaomi MiMo OpenAI-compatible API.',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModelId: 'mimo-v2.5-pro',
    authMode: 'bearer',
    baseUrlEditable: false,
    modelIdEditable: false,
    reasoningControl: 'thinkingDisabled',
    modelIdSetting: 'providers.xiaomiMimo.modelId',
    modelOptions: [
      { label: 'MiMo V2.5 Pro', modelId: 'mimo-v2.5-pro' },
      { label: 'MiMo V2.5', modelId: 'mimo-v2.5' },
    ],
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
  if (preset.modelIdEditable) return modelId.trim().length > 0 || preset.defaultModelId.length === 0;
  return preset.modelOptions.some((option) => option.modelId === modelId.trim());
}

export function coerceProviderModelId(providerType: ProviderType, modelId: string): string {
  const trimmed = modelId.trim();
  if (providerAcceptsModelId(providerType, trimmed)) return trimmed;
  return getProviderDefaultModelId(providerType);
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
