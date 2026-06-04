import type { TranslationRequestBlock } from './requestPlanner.js';

export type TranslationModelPromptProfile = {
  id: string;
  label: string;
  enhanced: boolean;
  enhancementNote?: string;
};

export type TranslationModelPromptPreview = TranslationModelPromptProfile & {
  prompt: string;
};

const GENERIC_TRANSLATION_MODEL_PROFILE: TranslationModelPromptProfile = {
  id: 'generic',
  label: 'Generic Translation Model',
  enhanced: false,
};

const HY_MT2_TRANSLATION_MODEL_PROFILE: TranslationModelPromptProfile = {
  id: 'hyMt2',
  label: 'Hy-MT2',
  enhanced: true,
  enhancementNote: 'MarkLingo uses a model-specific optimized prompt for Hy-MT2 translation models.',
};

const PREVIEW_BLOCKS: TranslationRequestBlock[] = [
  { id: 'b0', markdown: '# Title' },
  { id: 'b1', markdown: 'Translate visible Markdown text and keep __M0__ unchanged.' },
];

function normalizedModelTokens(modelId: string): string {
  return modelId.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function getTranslationModelPromptProfile(modelId: string): TranslationModelPromptProfile {
  const tokens = normalizedModelTokens(modelId);
  if (tokens === 'hymt2' || /\bhy mt2\b/.test(tokens)) {
    return HY_MT2_TRANSLATION_MODEL_PROFILE;
  }
  return GENERIC_TRANSLATION_MODEL_PROFILE;
}

function buildGenericTranslationModelUserPrompt(blocks: TranslationRequestBlock[], targetLanguage: string): string {
  const lines = [
    `Translate each "markdown" value in the JSON below into ${targetLanguage}.`,
    'Return only one valid JSON object with the same top-level "blocks" array shape as the input.',
    'Copy every block id exactly from the input. Do not output example ids, ellipses, or placeholder values.',
    'Keep every object key, block order, and placeholder token unchanged.',
    'Translate natural-language text only. Preserve Markdown syntax, code, URLs, image paths, file paths, versions, identifiers, and frontmatter keys.',
  ];

  lines.push('', 'JSON input:', JSON.stringify({ blocks }));
  return lines.join('\n');
}

function buildHyMt2TranslationModelUserPrompt(blocks: TranslationRequestBlock[], targetLanguage: string): string {
  const lines = [
    '### Task',
    `Translate the user-facing text in each \`markdown\` field of the JSON data below into ${targetLanguage}.`,
    '',
    '### Output Contract',
    '- Output exactly one valid JSON object.',
    '- The top-level object must contain exactly one key named `blocks`.',
    '- `blocks` must be an array of objects. Each item must be an object, never an array.',
    '- Each output item must have exactly the same `id` value as the matching input item and one `markdown` string.',
    '- Do not output sample ids, placeholder values, schemas, or examples.',
    '- The first output character must be `{`. Stop immediately after the final `}`.',
    '',
    '### Translation Rules',
    '- Translate only natural-language text inside `markdown` values.',
    '- Preserve Markdown syntax, list markers, headings, blockquotes, tables, line breaks, nesting, and indentation.',
    '- Never translate or alter code, inline code, HTML, URLs, image paths, file paths, versions, package names, setting keys, identifiers, or placeholder tokens.',
    '- Escape line breaks inside JSON strings as `\\n`. Do not output raw unescaped line breaks inside JSON strings.',
    '',
    '### Input JSON',
    JSON.stringify({ blocks }),
  ];

  return lines.join('\n');
}

export function buildTranslationModelUserPrompt(options: {
  blocks: TranslationRequestBlock[];
  targetLanguage: string;
  modelId: string;
}): string {
  const profile = getTranslationModelPromptProfile(options.modelId);
  if (profile.id === HY_MT2_TRANSLATION_MODEL_PROFILE.id) {
    return buildHyMt2TranslationModelUserPrompt(options.blocks, options.targetLanguage);
  }
  return buildGenericTranslationModelUserPrompt(options.blocks, options.targetLanguage);
}

export function getTranslationModelPromptPreview(options: {
  targetLanguage: string;
  modelId: string;
}): TranslationModelPromptPreview {
  const profile = getTranslationModelPromptProfile(options.modelId);
  return {
    ...profile,
    prompt: buildTranslationModelUserPrompt({
      blocks: PREVIEW_BLOCKS,
      targetLanguage: options.targetLanguage,
      modelId: options.modelId,
    }),
  };
}
