import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

export type PlaceholderMap = Record<string, string>;

export type ProtectResult = {
  text: string;
  placeholders: PlaceholderMap;
};

type Replacement = {
  start: number;
  end: number;
  placeholder: string;
  original: string;
};

function buildLineStartOffsets(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function pointToOffset(lineStarts: number[], point: any): number {
  if (!point) return 0;
  if (typeof point.offset === 'number') return point.offset;
  const lineIndex = Math.max(0, (point.line ?? 1) - 1);
  const colIndex = Math.max(0, (point.column ?? 1) - 1);
  return (lineStarts[lineIndex] ?? 0) + colIndex;
}

function nodeToRange(lineStarts: number[], node: any): { start: number; end: number } | null {
  const pos = node?.position;
  if (!pos?.start || !pos?.end) return null;
  const start = pointToOffset(lineStarts, pos.start);
  const end = pointToOffset(lineStarts, pos.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

function createPlaceholder(prefix: string, kind: string, index: number): string {
  return `__MDT_${prefix}_${kind}_${index}__`;
}

function mayContainProtectedMarkdown(markdown: string): boolean {
  return (
    /[`~<\[]/.test(markdown) ||
    /https?:\/\//i.test(markdown) ||
    /\bwww\./i.test(markdown) ||
    /(^|\n)(?: {4,}|\t)/.test(markdown)
  );
}

function findMarkdownUrlOffset(slice: string, url: string, nodeType: string): number {
  const candidates: number[] = [];
  let index = slice.indexOf(url);
  while (index !== -1) {
    candidates.push(index);
    index = slice.indexOf(url, index + url.length);
  }
  if (candidates.length === 0) return -1;

  if (nodeType === 'definition') {
    const colon = slice.indexOf(':');
    const afterColon = candidates.find((candidate) => colon !== -1 && candidate > colon);
    if (typeof afterColon === 'number') return afterColon;
  }

  const inlineMarker = slice.lastIndexOf('](');
  const inInlineDestination = candidates.find((candidate) => inlineMarker !== -1 && candidate > inlineMarker);
  if (typeof inInlineDestination === 'number') return inInlineDestination;

  return candidates[candidates.length - 1];
}

export function protectMarkdown(markdown: string, tokenPrefix: string): ProtectResult {
  if (!mayContainProtectedMarkdown(markdown)) {
    return { text: markdown, placeholders: {} };
  }

  const lineStarts = buildLineStartOffsets(markdown);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).parse(markdown) as any;

  const replacements: Replacement[] = [];
  const placeholders: PlaceholderMap = {};

  let blockIndex = 0;
  let urlIndex = 0;

  const addWholeNodeReplacement = (node: any, kind: string) => {
    const range = nodeToRange(lineStarts, node);
    if (!range) return;
    const original = markdown.slice(range.start, range.end);
    const placeholder = createPlaceholder(tokenPrefix, kind, blockIndex++);
    replacements.push({ start: range.start, end: range.end, placeholder, original });
    placeholders[placeholder] = original;
  };

  const addUrlReplacement = (node: any, kind: string) => {
    const url = typeof node?.url === 'string' ? node.url : '';
    if (!url) return;
    const range = nodeToRange(lineStarts, node);
    if (!range) return;
    const slice = markdown.slice(range.start, range.end);
    const idx = findMarkdownUrlOffset(slice, url, String(node?.type ?? ''));
    if (idx === -1) return;
    const original = url;
    const placeholder = createPlaceholder(tokenPrefix, kind, urlIndex++);
    replacements.push({
      start: range.start + idx,
      end: range.start + idx + url.length,
      placeholder,
      original,
    });
    placeholders[placeholder] = original;
  };

  visit(tree, (node: any) => {
    const type = String(node?.type ?? '');

    // Protect whole syntax nodes: code blocks, inline code, HTML, and YAML.
    if (type === 'code') {
      addWholeNodeReplacement(node, 'CODEBLOCK');
      return;
    }
    if (type === 'inlineCode') {
      addWholeNodeReplacement(node, 'INLINECODE');
      return;
    }
    if (type === 'html') {
      addWholeNodeReplacement(node, 'HTML');
      return;
    }
    if (type === 'yaml') {
      addWholeNodeReplacement(node, 'YAML');
      return;
    }

    // Protect link and image destinations.
    if (type === 'link') {
      addUrlReplacement(node, 'URL');
      return;
    }
    if (type === 'image') {
      addUrlReplacement(node, 'IMG');
      return;
    }
    if (type === 'definition') {
      addUrlReplacement(node, 'DEF');
      return;
    }
  });

  // Replace from the end so earlier replacements do not shift later offsets.
  replacements.sort((a, b) => b.start - a.start || b.end - a.end);

  let out = markdown;
  for (const r of replacements) {
    if (r.start < 0 || r.end > out.length || r.end < r.start) continue;
    out = out.slice(0, r.start) + r.placeholder + out.slice(r.end);
  }

  return { text: out, placeholders };
}

export function restoreMarkdown(translated: string, placeholders: PlaceholderMap): string {
  let out = translated;
  for (const [token, original] of Object.entries(placeholders)) {
    if (!out.includes(token)) {
      throw new Error(`Model output damaged or removed placeholder token: ${token}`);
    }
    out = out.split(token).join(original);
  }
  return out;
}
