import * as vscode from 'vscode';
import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { findYamlFrontmatterValueRanges } from './frontmatterValues.js';

export const SEGMENTER_VERSION = '2';

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

  const addYamlValueSegments = (node: any) => {
    const range = nodeToRange(doc, node);
    if (!range) return;
    const yamlText = text.slice(range.start, range.end);
    for (const valueRange of findYamlFrontmatterValueRanges(yamlText)) {
      segments.push({
        type: 'yamlValue',
        startOffset: range.start + valueRange.start,
        endOffset: range.start + valueRange.end,
        text: yamlText.slice(valueRange.start, valueRange.end),
        translatable: true,
      });
    }
  };

  const collect = (node: any) => {
    if (!node) return;
    const type = String(node.type ?? '');

    // Non-translatable blocks.
    if (type === 'yaml') {
      addYamlValueSegments(node);
      return;
    }

    if (type === 'code' || type === 'html' || type === 'definition' || type === 'thematicBreak') {
      add(node, false);
      return;
    }

    // Split lists by listItem.
    if (type === 'list') {
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) collect(child);
      return;
    }

    // Treat list items as translation blocks. Nested code is protected later by placeholders.
    if (type === 'listItem') {
      add(node, true);
      return;
    }

    // Common translatable blocks.
    if (type === 'heading' || type === 'paragraph' || type === 'blockquote' || type === 'table') {
      add(node, true);
      return;
    }

    // Fallback: use any positioned node as a block; otherwise walk into children.
    if (node?.position?.start && node?.position?.end) {
      add(node, true);
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) collect(child);
  };

  const rootChildren = Array.isArray(tree?.children) ? tree.children : [];
  for (const child of rootChildren) collect(child);

  // Sort and assign stable sequential ids.
  segments.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const deduped: Omit<Segment, 'id'>[] = [];
  let lastEnd = -1;
  for (const seg of segments) {
    // Skip overlapping ranges to avoid invalid replacements.
    if (seg.startOffset < lastEnd) continue;
    deduped.push(seg);
    lastEnd = seg.endOffset;
  }

  return deduped.map((seg, i) => ({ ...seg, id: `b${i}` }));
}
