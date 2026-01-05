import * as vscode from 'vscode';
import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';

export const SEGMENTER_VERSION = '1';

export type Segment = {
  id: string;
  type: string;
  startOffset: number;
  endOffset: number;
  text: string;
  translatable: boolean;
};

function pointToOffset(doc: vscode.TextDocument, point: any): number {
  if (!point) return 0;
  if (typeof point.offset === 'number') return point.offset;
  const line = Math.max(0, (point.line ?? 1) - 1);
  const character = Math.max(0, (point.column ?? 1) - 1);
  return doc.offsetAt(new vscode.Position(line, character));
}

function nodeToRange(doc: vscode.TextDocument, node: any): { start: number; end: number } | null {
  const pos = node?.position;
  if (!pos?.start || !pos?.end) return null;
  const start = pointToOffset(doc, pos.start);
  const end = pointToOffset(doc, pos.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

export function segmentMarkdownDocument(doc: vscode.TextDocument): Segment[] {
  const text = doc.getText();
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).parse(text) as any;

  const segments: Omit<Segment, 'id'>[] = [];

  const add = (node: any, translatable: boolean) => {
    const range = nodeToRange(doc, node);
    if (!range) return;
    segments.push({
      type: String(node?.type ?? 'unknown'),
      startOffset: range.start,
      endOffset: range.end,
      text: text.slice(range.start, range.end),
      translatable,
    });
  };

  const collect = (node: any) => {
    if (!node) return;
    const type = String(node.type ?? '');

    // 不可翻译的 block
    if (type === 'yaml' || type === 'code' || type === 'html' || type === 'definition' || type === 'thematicBreak') {
      add(node, false);
      return;
    }

    // list：按 listItem 粒度切分
    if (type === 'list') {
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) collect(child);
      return;
    }

    // listItem：作为翻译块（内部若包含代码块，后续用占位符保护）
    if (type === 'listItem') {
      add(node, true);
      return;
    }

    // 常见可翻译 block
    if (type === 'heading' || type === 'paragraph' || type === 'blockquote' || type === 'table') {
      add(node, true);
      return;
    }

    // 兜底：有位置就当作一个可翻译块；否则下钻 children
    if (node?.position?.start && node?.position?.end) {
      add(node, true);
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) collect(child);
  };

  const rootChildren = Array.isArray(tree?.children) ? tree.children : [];
  for (const child of rootChildren) collect(child);

  // 排序并赋予稳定顺序 id
  segments.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const deduped: Omit<Segment, 'id'>[] = [];
  let lastEnd = -1;
  for (const seg of segments) {
    // 防止出现重叠范围导致替换异常
    if (seg.startOffset < lastEnd) continue;
    deduped.push(seg);
    lastEnd = seg.endOffset;
  }

  return deduped.map((seg, i) => ({ ...seg, id: `b${i}` }));
}


