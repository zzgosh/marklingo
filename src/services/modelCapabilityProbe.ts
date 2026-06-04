import { parseTranslatedBlockMap } from '../translation/translationAdapters.js';
import { normalizeTranslatedBlockLines } from '../translation/modelOutput.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import type { ChatMessage } from './openRouterClient.js';
import type { TranslationRequestBlock } from '../translation/requestPlanner.js';

const PROBE_PLACEHOLDER = '__MDT_PROBE_0__';
const PROBE_CAPABILITY_KEY = '_capability';
const PROBE_CAPABILITY_VALUE = 'chat-json-ok';
const PROBE_BLOCKS: TranslationRequestBlock[] = [
  { id: 'b0', markdown: 'Hello **world**.' },
  { id: 'b1', markdown: `Keep ${PROBE_PLACEHOLDER} unchanged in [this link](https://example.com).` },
  {
    id: 'b2',
    markdown: '- Install from `package.json`.\n- Do not translate `marklingo.openrouter.modelId`.',
  },
];

function parseJsonObjectFromModelText(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Probe response is not valid JSON.');
    parsed = JSON.parse(text.slice(start, end + 1));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Probe response JSON must be an object.');
  }
  return parsed as Record<string, unknown>;
}

export function getChatJsonProbeMessages(): ChatMessage[] {
  const systemPrompt = [
    resolveSystemPrompt(undefined, '简体中文'),
    '',
    'Verification-only rule:',
    `- The top-level JSON object must contain exactly these keys: "${PROBE_CAPABILITY_KEY}", ${PROBE_BLOCKS.map((block) => `"${block.id}"`).join(', ')}.`,
    `- Set "${PROBE_CAPABILITY_KEY}" to exactly "${PROBE_CAPABILITY_VALUE}". This value is not in the input and must not be translated.`,
    '- Do not return a "blocks" array for this verification request.',
  ].join('\n');
  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: ['Translate these Markdown blocks:', '---', JSON.stringify({ blocks: PROBE_BLOCKS })].join('\n'),
    },
  ];
}

export function validateChatJsonProbeResponse(raw: string): void {
  const parsedObject = parseJsonObjectFromModelText(raw);
  const keys = Object.keys(parsedObject).sort();
  const expectedKeys = [PROBE_CAPABILITY_KEY, ...PROBE_BLOCKS.map((block) => block.id)].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Probe response does not follow the required top-level JSON shape.');
  }
  if (parsedObject[PROBE_CAPABILITY_KEY] !== PROBE_CAPABILITY_VALUE) {
    throw new Error('Probe response is missing the required capability marker.');
  }

  const parsed = parseTranslatedBlockMap(raw, PROBE_BLOCKS);
  for (const block of PROBE_BLOCKS) {
    const lines = normalizeTranslatedBlockLines(parsed[block.id], block.id);
    if (lines.join('\n').trim().length === 0) {
      throw new Error(`Probe response is missing ${block.id}.`);
    }
  }
  const b0 = normalizeTranslatedBlockLines(parsed.b0, 'b0').join('\n');
  const b1 = normalizeTranslatedBlockLines(parsed.b1, 'b1').join('\n');
  const b2 = normalizeTranslatedBlockLines(parsed.b2, 'b2').join('\n');
  if (!b0.includes('**')) {
    throw new Error('Probe response changed Markdown formatting.');
  }
  if (!b1.includes(PROBE_PLACEHOLDER) || !b1.includes('https://example.com')) {
    throw new Error('Probe response changed placeholder tokens.');
  }
  if (!b2.includes('`package.json`') || !b2.includes('`marklingo.openrouter.modelId`')) {
    throw new Error('Probe response changed inline code or identifiers.');
  }
}
