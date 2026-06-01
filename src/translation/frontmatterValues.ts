export type TextRange = {
  start: number;
  end: number;
};

type Line = {
  start: number;
  end: number;
  text: string;
};

const TRANSLATABLE_FRONTMATTER_KEYS = new Set([
  'abstract',
  'description',
  'excerpt',
  'metadescription',
  'metatitle',
  'ogdescription',
  'ogtitle',
  'seodescription',
  'seotitle',
  'subtitle',
  'summary',
  'tagline',
  'title',
  'twitterdescription',
  'twittertitle',
]);

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;

  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const rawEnd = newline === -1 ? text.length : newline;
    const end = rawEnd > start && text[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
    lines.push({ start, end, text: text.slice(start, end) });
    if (newline === -1) break;
    start = newline + 1;
  }

  return lines;
}

function isFence(text: string): boolean {
  return /^(?:---|\.\.\.)[ \t]*$/.test(text);
}

function findMappingColon(line: string): number {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && (quote !== '"' || line[i - 1] !== '\\')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':') return i;
  }

  return -1;
}

function findInlineCommentStart(line: string, start: number, end: number): number {
  let quote: '"' | "'" | null = null;

  for (let i = start; i < end; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && (quote !== '"' || line[i - 1] !== '\\')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === start || /\s/.test(line[i - 1] ?? ''))) return i;
  }

  return end;
}

function trimRange(line: string, start: number, end: number): TextRange {
  while (start < end && /[ \t]/.test(line[start] ?? '')) start++;
  while (end > start && /[ \t]/.test(line[end - 1] ?? '')) end--;
  return { start, end };
}

function findQuotedInnerRange(line: string, start: number, end: number): TextRange | null {
  const quote = line[start];
  if (quote !== '"' && quote !== "'") return null;

  for (let i = end - 1; i > start; i--) {
    if (line[i] === quote && (quote !== '"' || line[i - 1] !== '\\')) {
      return { start: start + 1, end: i };
    }
  }

  return null;
}

function shouldSkipScalarValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === '' ||
    /^(?:[|>][+-]?|true|false|null|~)$/i.test(trimmed) ||
    /^[+-]?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(trimmed) ||
    /^[\[{]/.test(trimmed) ||
    /^[&*!]/.test(trimmed)
  );
}

function normalizeKeyName(key: string): string {
  let normalized = key.trim();
  const quote = normalized[0];
  if ((quote === '"' || quote === "'") && normalized[normalized.length - 1] === quote) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTranslatableFrontmatterKey(key: string): boolean {
  return TRANSLATABLE_FRONTMATTER_KEYS.has(normalizeKeyName(key));
}

export function findYamlFrontmatterValueRanges(frontmatter: string): TextRange[] {
  const lines = splitLines(frontmatter);
  if (lines.length === 0) return [];

  const hasOpeningFence = isFence(lines[0]?.text ?? '');
  const bodyStart = hasOpeningFence ? 1 : 0;
  let bodyEnd = lines.length;

  if (hasOpeningFence) {
    for (let i = lines.length - 1; i >= bodyStart; i--) {
      if (isFence(lines[i].text)) {
        bodyEnd = i;
        break;
      }
    }
  }

  const ranges: TextRange[] = [];
  for (let lineIndex = bodyStart; lineIndex < bodyEnd; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.text.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const colon = findMappingColon(line.text);
    if (colon === -1) continue;

    const key = line.text.slice(0, colon).trim();
    if (!key || key.startsWith('-')) continue;
    if (!isTranslatableFrontmatterKey(key)) continue;

    const valueStart = colon + 1;
    const commentStart = findInlineCommentStart(line.text, valueStart, line.text.length);
    const rawValueRange = trimRange(line.text, valueStart, commentStart);
    if (rawValueRange.start >= rawValueRange.end) continue;

    const quotedRange = findQuotedInnerRange(line.text, rawValueRange.start, rawValueRange.end);
    const valueRange = quotedRange ?? rawValueRange;
    const value = line.text.slice(valueRange.start, valueRange.end);
    if (shouldSkipScalarValue(value)) continue;

    ranges.push({
      start: line.start + valueRange.start,
      end: line.start + valueRange.end,
    });
  }

  return ranges;
}
