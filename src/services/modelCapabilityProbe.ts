import { parseTranslatedBlockMap } from '../translation/translationAdapters.js';
import type { ChatMessage } from './openRouterClient.js';
import type { TranslationRequestBlock } from '../translation/requestPlanner.js';

const PROBE_PLACEHOLDER = '__MDT_PROBE_0__';
const PROBE_CAPABILITY_KEY = '_capability';
const PROBE_CAPABILITY_VALUE = 'chat-json-ok';

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
  const input = {
    b0: 'Hello **world**.',
    b1: `Keep ${PROBE_PLACEHOLDER} unchanged.`,
  };
  return [
    {
      role: 'system',
      content: [
        'Return only valid JSON.',
        'Translate each input Markdown string into Simplified Chinese.',
        `The top-level JSON object must contain exactly these keys: "${PROBE_CAPABILITY_KEY}", "b0", "b1".`,
        `Set "${PROBE_CAPABILITY_KEY}" to exactly "${PROBE_CAPABILITY_VALUE}". This value is not in the input and must not be translated.`,
        'Preserve Markdown syntax and placeholder tokens exactly.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Input JSON: ${JSON.stringify(input)}`,
    },
  ];
}

export function validateChatJsonProbeResponse(raw: string): void {
  const parsedObject = parseJsonObjectFromModelText(raw);
  const keys = Object.keys(parsedObject).sort();
  const expectedKeys = [PROBE_CAPABILITY_KEY, 'b0', 'b1'].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Probe response does not follow the required top-level JSON shape.');
  }
  if (parsedObject[PROBE_CAPABILITY_KEY] !== PROBE_CAPABILITY_VALUE) {
    throw new Error('Probe response is missing the required capability marker.');
  }

  const requestedBlocks: TranslationRequestBlock[] = [
    { id: 'b0', markdown: 'Hello **world**.' },
    { id: 'b1', markdown: `Keep ${PROBE_PLACEHOLDER} unchanged.` },
  ];
  const parsed = parseTranslatedBlockMap(raw, requestedBlocks);
  for (const block of requestedBlocks) {
    if (typeof parsed[block.id] !== 'string' || !String(parsed[block.id]).trim()) {
      throw new Error(`Probe response is missing ${block.id}.`);
    }
  }
  if (!String(parsed.b0).includes('**')) {
    throw new Error('Probe response changed Markdown formatting.');
  }
  if (!String(parsed.b1).includes(PROBE_PLACEHOLDER)) {
    throw new Error('Probe response changed placeholder tokens.');
  }
}
