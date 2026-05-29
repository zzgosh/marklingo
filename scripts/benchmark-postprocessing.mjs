import fs from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { protectMarkdown, restoreMarkdown } from '../out/translation/placeholders.js';

function sha256(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function segmentMarkdownText(text) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }

  const pointToOffset = (point) => {
    if (typeof point?.offset === 'number') return point.offset;
    const line = Math.max(0, (point?.line ?? 1) - 1);
    const column = Math.max(0, (point?.column ?? 1) - 1);
    return (lineStarts[line] ?? 0) + column;
  };

  const nodeToRange = (node) => {
    const pos = node?.position;
    if (!pos?.start || !pos?.end) return null;
    const start = pointToOffset(pos.start);
    const end = pointToOffset(pos.end);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? { start, end } : null;
  };

  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).parse(text);
  const segments = [];

  const add = (node, translatable) => {
    const range = nodeToRange(node);
    if (!range) return;
    segments.push({
      type: String(node?.type ?? 'unknown'),
      startOffset: range.start,
      endOffset: range.end,
      text: text.slice(range.start, range.end),
      translatable,
    });
  };

  const collect = (node) => {
    if (!node) return;
    const type = String(node.type ?? '');

    if (['yaml', 'code', 'html', 'definition', 'thematicBreak'].includes(type)) {
      add(node, false);
      return;
    }
    if (type === 'list') {
      for (const child of Array.isArray(node.children) ? node.children : []) collect(child);
      return;
    }
    if (type === 'listItem') {
      add(node, true);
      return;
    }
    if (['heading', 'paragraph', 'blockquote', 'table'].includes(type)) {
      add(node, true);
      return;
    }
    if (node?.position?.start && node?.position?.end) {
      add(node, true);
      return;
    }
    for (const child of Array.isArray(node.children) ? node.children : []) collect(child);
  };

  for (const child of Array.isArray(tree?.children) ? tree.children : []) collect(child);

  segments.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  const deduped = [];
  let lastEnd = -1;
  for (const seg of segments) {
    if (seg.startOffset < lastEnd) continue;
    deduped.push(seg);
    lastEnd = seg.endOffset;
  }
  return deduped.map((seg, index) => ({ ...seg, id: `b${index}` }));
}

function fakeMarkdown(sizeKb) {
  const paragraph = 'This is a paragraph with [a link](https://example.com/path) and `inline code`, intended to benchmark Markdown translation post-processing.\n\n';
  const plainItem = '- A list item with enough words to become a translatable block and keep the parser busy.\n';
  const richItem = '- A list item with `inline code`, [a link](https://example.com/docs), and plain text.\n';
  let out = '# Benchmark\n\n';
  let index = 0;
  while (Buffer.byteLength(out) < sizeKb * 1024) {
    out += `## Section ${index}\n\n${paragraph}${plainItem}${plainItem}${richItem}\n`;
    index += 1;
  }
  return out;
}

async function benchmarkCase(name, text, iterations) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mdt-bench-'));
  const outputFile = path.join(tempDir, 'out.md');
  const metaFile = path.join(tempDir, 'meta.json');
  const totals = {
    segment: 0,
    protect: 0,
    parseRestoreCompose: 0,
    metaStringify: 0,
    write: 0,
    total: 0,
  };
  let blockCount = 0;
  let outputBytes = 0;

  for (let run = 0; run < iterations; run += 1) {
    const totalStartedAt = performance.now();

    const segmentStartedAt = performance.now();
    const segments = segmentMarkdownText(text);
    const translatable = segments
      .filter((segment) => segment.translatable && segment.text.trim())
      .map((segment) => ({ ...segment, srcHash: sha256(segment.text) }));
    blockCount = translatable.length;
    totals.segment += performance.now() - segmentStartedAt;

    const protectStartedAt = performance.now();
    const placeholdersById = new Map();
    const protectedBlocks = [];
    for (const segment of translatable) {
      const protectedResult = protectMarkdown(segment.text, segment.id);
      placeholdersById.set(segment.id, protectedResult);
      protectedBlocks.push({ id: segment.id, markdown: protectedResult.text });
    }
    const rawResponse = JSON.stringify(Object.fromEntries(protectedBlocks.map((block) => [block.id, block.markdown.split('\n')])));
    totals.protect += performance.now() - protectStartedAt;

    const parseStartedAt = performance.now();
    const response = JSON.parse(rawResponse);
    const translatedByHash = new Map();
    for (const segment of translatable) {
      const protectedTranslated = response[segment.id].join('\n');
      const restored = restoreMarkdown(protectedTranslated, placeholdersById.get(segment.id).placeholders);
      translatedByHash.set(segment.srcHash, restored);
    }

    const hashById = new Map(translatable.map((segment) => [segment.id, segment.srcHash]));
    const parts = [];
    let cursor = 0;
    for (const segment of segments) {
      parts.push(text.slice(cursor, segment.startOffset));
      const hash = segment.translatable ? hashById.get(segment.id) : undefined;
      parts.push(segment.translatable && hash ? translatedByHash.get(hash) ?? segment.text : segment.text);
      cursor = segment.endOffset;
    }
    parts.push(text.slice(cursor));
    const output = parts.join('');
    outputBytes = Buffer.byteLength(output);
    totals.parseRestoreCompose += performance.now() - parseStartedAt;

    const metaStartedAt = performance.now();
    const meta = {
      version: 1,
      segmenterVersion: '1',
      sourceUri: 'file:///benchmark.md',
      outputUri: 'file:///benchmark_mdt.md',
      outputHash: sha256(output),
      targetLanguage: '简体中文',
      updatedAt: new Date().toISOString(),
      segments: translatable.map((segment) => ({ type: segment.type, srcHash: segment.srcHash, source: segment.text })),
      translations: Object.fromEntries(translatable.map((segment) => [segment.srcHash, translatedByHash.get(segment.srcHash)])),
    };
    const metaRaw = JSON.stringify(meta);
    totals.metaStringify += performance.now() - metaStartedAt;

    const writeStartedAt = performance.now();
    await Promise.all([
      fs.writeFile(outputFile, output, 'utf8'),
      fs.writeFile(metaFile, metaRaw, 'utf8'),
    ]);
    totals.write += performance.now() - writeStartedAt;
    totals.total += performance.now() - totalStartedAt;
  }

  rmSync(tempDir, { recursive: true, force: true });
  const averageMs = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number((value / iterations).toFixed(3))]));
  return {
    name,
    inputKb: Number((Buffer.byteLength(text) / 1024).toFixed(1)),
    outputKb: Number((outputBytes / 1024).toFixed(1)),
    blockCount,
    iterations,
    averageMs,
  };
}

const readme = await fs.readFile('README.md', 'utf8');
const results = [
  await benchmarkCase('README.md', readme, 30),
  await benchmarkCase('synthetic-100KB', fakeMarkdown(100), 8),
  await benchmarkCase('synthetic-1MB', fakeMarkdown(1024), 2),
];

console.log(JSON.stringify(results, null, 2));
