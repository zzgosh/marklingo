import type { ChatMessage } from '../services/openRouterClient.js';
import type { TranslationRequestBlock } from './requestPlanner.js';

export type TranslationRequestMode = 'auto' | 'chatJson' | 'translationModel';
export type TranslationAdapterMode = 'chatJson' | 'translationModel';

export const DEFAULT_TRANSLATION_REQUEST_MODE: TranslationRequestMode = 'auto';
export const DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST = 12;
export const DEFAULT_TRANSLATION_MODEL_CONCURRENCY = 1;
export const DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS = 0;
export const MAX_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST = 24;
export const MAX_TRANSLATION_MODEL_CONCURRENCY = 4;
export const MAX_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS = 32768;
export const AUTO_TRANSLATION_MODEL_MAX_OUTPUT_TOKEN_CAP = 8192;

const TRANSLATION_REQUEST_MODES = new Set<TranslationRequestMode>([
  'auto',
  'chatJson',
  'translationModel',
]);

export function coerceTranslationRequestMode(value: unknown): TranslationRequestMode {
  return TRANSLATION_REQUEST_MODES.has(value as TranslationRequestMode)
    ? value as TranslationRequestMode
    : DEFAULT_TRANSLATION_REQUEST_MODE;
}

function coerceIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function coerceTranslationModelMaxBlocksPerRequest(value: unknown): number {
  return coerceIntegerInRange(
    value,
    DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST,
    1,
    MAX_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST,
  );
}

export function coerceTranslationModelConcurrency(value: unknown): number {
  return coerceIntegerInRange(
    value,
    DEFAULT_TRANSLATION_MODEL_CONCURRENCY,
    1,
    MAX_TRANSLATION_MODEL_CONCURRENCY,
  );
}

export function coerceTranslationModelMaxOutputTokens(value: unknown): number {
  return coerceIntegerInRange(
    value,
    DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS,
    0,
    MAX_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS,
  );
}

export function resolveTranslationModelMaxOutputTokens(options: {
  configuredMaxOutputTokens: number;
  modelContextLength?: number;
  estimatedPromptTokens: number;
}): number {
  if (options.configuredMaxOutputTokens > 0) return options.configuredMaxOutputTokens;

  if (options.modelContextLength && options.modelContextLength > 0) {
    const available = Math.floor(options.modelContextLength * 0.95) - options.estimatedPromptTokens - 32;
    if (available >= 256) {
      return Math.min(AUTO_TRANSLATION_MODEL_MAX_OUTPUT_TOKEN_CAP, available);
    }
  }

  return 4096;
}

export function resolveTranslationAdapterMode(
  mode: TranslationRequestMode,
  verifiedAdapterMode?: TranslationAdapterMode,
): TranslationAdapterMode {
  if (mode === 'chatJson' || mode === 'translationModel') return mode;
  if (verifiedAdapterMode) return verifiedAdapterMode;
  return 'chatJson';
}

export function getTranslationAdapterLabel(mode: TranslationAdapterMode): string {
  return mode === 'translationModel' ? 'translationModel' : 'chatJson';
}

export function buildChatJsonPrompt(
  input: { blocks: Array<{ id: string; markdown: string }> },
  options: { systemPrompt: string; customPrompt: string },
): { messages: ChatMessage[]; estimatePrompt: { system: string; user: string } } {
  const customPrompt = options.customPrompt.trim();
  const system = customPrompt
    ? [options.systemPrompt, '', 'Additional custom prompt:', customPrompt].join('\n')
    : options.systemPrompt;

  const user = ['Translate these Markdown blocks:', '---', JSON.stringify(input)].join('\n');
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    estimatePrompt: { system, user },
  };
}

export function buildTranslationModelPrompt(
  blocks: TranslationRequestBlock[],
  options: { targetLanguage: string; systemPrompt: string },
): { messages: ChatMessage[]; estimatePrompt: { system: string; user: string } } {
  const lines = [
    `Translate each "markdown" value in the JSON below into ${options.targetLanguage}.`,
    'Return only one valid JSON object with the same top-level "blocks" array shape as the input.',
    'Copy every block id exactly from the input. Do not output example ids, ellipses, or placeholder values.',
    'Keep every object key, block order, and placeholder token unchanged.',
    'Translate natural-language text only. Preserve Markdown syntax, code, URLs, image paths, file paths, versions, identifiers, and frontmatter keys.',
  ];

  lines.push('', 'JSON input:', JSON.stringify({ blocks }));
  const user = lines.join('\n');
  const system = options.systemPrompt.trim();
  return {
    messages: system
      ? [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]
      : [{ role: 'user', content: user }],
    estimatePrompt: { system, user },
  };
}

function parseJsonObjectFromModelText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Model output is not valid JSON.');
  }
}

function readBlocksArrayMap(value: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(value.blocks)) return undefined;

  const out: Record<string, unknown> = {};
  for (const item of value.blocks) {
    if (!item || typeof item !== 'object') continue;
    const block = item as Record<string, unknown>;
    if (typeof block.id !== 'string') continue;
    if (!Object.hasOwn(block, 'markdown')) continue;
    out[block.id] = block.markdown;
  }
  return out;
}

export function parseTranslatedBlockMap(text: string, requestedBlocks: TranslationRequestBlock[]): Record<string, unknown> {
  const parsed = parseJsonObjectFromModelText(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model output JSON must be an object.');
  }

  const value = parsed as Record<string, unknown>;
  const blocksArrayMap = readBlocksArrayMap(value);
  if (blocksArrayMap) return blocksArrayMap;

  const out: Record<string, unknown> = {};
  for (const block of requestedBlocks) {
    if (Object.hasOwn(value, block.id)) out[block.id] = value[block.id];
  }
  return out;
}
