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

export function protectMarkdown(markdown: string, tokenPrefix: string): ProtectResult {
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
    const idx = slice.indexOf(url);
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

    // 整块保护：代码块、行内代码、HTML、YAML
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

    // URL 保护：链接与图片的 url/path
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

  // 从后往前替换，避免 offset 被破坏
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
      throw new Error(`占位符被模型破坏或丢失：${token}`);
    }
    out = out.split(token).join(original);
  }
  return out;
}


