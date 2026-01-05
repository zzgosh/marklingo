import * as vscode from "vscode";
import * as path from "path";
import { createHash } from "crypto";
import { SEGMENTER_VERSION } from "./segmenter";

export type MetaSegment = {
  type: string;
  srcHash: string;
  source: string;
};

export type TranslationMetaV1 = {
  version: 1;
  segmenterVersion: string;
  sourceUri: string;
  updatedAt: string;
  segments: MetaSegment[];
  translations: Record<string, string>;
};

export function getMetaFileUri(sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);

  // 优先将 meta 放到工作区 .vscode/ 下，避免在文档目录旁边生成缓存文件
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
  if (!workspaceFolder) {
    return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}_mdt.meta.json`));
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const rel = path.relative(workspaceRoot, sourceUri.fsPath);
  const relDir = path.dirname(rel);

  // 当文件不在该 workspace root 内（例如跨盘符）时，退回到 hash 命名避免非法路径
  const isUnsafeRel = !rel || rel.startsWith('..') || path.isAbsolute(rel);
  if (isUnsafeRel) {
    const id = sha256(sourceUri.toString()).slice(0, 16);
    return vscode.Uri.file(
      path.join(workspaceRoot, '.vscode', 'markdown-translator', 'meta', `${parsed.name}_${id}_mdt.meta.json`),
    );
  }

  return vscode.Uri.file(
    path.join(workspaceRoot, '.vscode', 'markdown-translator', 'meta', relDir, `${parsed.name}_mdt.meta.json`),
  );
}

function normalizeForHash(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function sha256(text: string): string {
  return createHash("sha256")
    .update(normalizeForHash(text), "utf8")
    .digest("hex");
}

export async function loadTranslationMeta(
  metaUri: vscode.Uri
): Promise<TranslationMetaV1 | null> {
  try {
    const buf = await vscode.workspace.fs.readFile(metaUri);
    const raw = Buffer.from(buf).toString("utf8");
    const json = JSON.parse(raw) as TranslationMetaV1;
    if (!json || json.version !== 1) return null;
    if (typeof json.segmenterVersion !== "string") return null;
    if (!Array.isArray(json.segments)) return null;
    if (!json.translations || typeof json.translations !== "object")
      return null;
    return json;
  } catch {
    return null;
  }
}

export async function saveTranslationMeta(
  metaUri: vscode.Uri,
  meta: TranslationMetaV1
): Promise<void> {
  const raw = JSON.stringify(meta, null, 2);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(metaUri.fsPath)));
  await vscode.workspace.fs.writeFile(metaUri, Buffer.from(raw, "utf8"));
}

function normalizeForSimilarity(text: string): string[] {
  const s = text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];
  // 英文按空格分词；中文保持为单字符粒度（粗略但可用）
  if (/[a-z0-9]/.test(s)) return s.split(" ");
  return s.split("");
}

export function similarity(a: string, b: string): number {
  const ta = normalizeForSimilarity(a);
  const tb = normalizeForSimilarity(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function detectDeletion(
  prev: MetaSegment[],
  next: MetaSegment[],
  similarityThreshold: number
): boolean {
  const prevHashes = new Set(prev.map((s) => s.srcHash));
  const nextHashes = new Set(next.map((s) => s.srcHash));

  const missingPrev = prev.filter((p) => !nextHashes.has(p.srcHash));
  if (missingPrev.length === 0) return false;

  const addedNext = next.filter((n) => !prevHashes.has(n.srcHash));
  // 更保守的判定：只有在“净减少”的情况下，才认为发生了精简/删除
  // 这样像“整段替换”这种修改（missingPrev 与 addedNext 数量相当）不会误触发全量重译。
  const netDecrease = missingPrev.length > addedNext.length || next.length < prev.length;
  if (!netDecrease) return false;

  // 若缺失块与新增块在文本上高度相似，视为“改写/合并”而非删除，避免不必要的全量重译。
  const threshold = Math.max(0, Math.min(1, similarityThreshold));
  if (threshold > 0 && addedNext.length > 0) {
    let allMatched = true;
    for (const p of missingPrev) {
      let best = 0;
      for (const n of addedNext) {
        const s = similarity(p.source, n.source);
        if (s > best) best = s;
        if (best >= threshold) break;
      }
      if (best < threshold) {
        allMatched = false;
        break;
      }
    }
    if (allMatched) return false;
  }

  return true;
}

export function createEmptyMeta(sourceUri: vscode.Uri): TranslationMetaV1 {
  return {
    version: 1,
    segmenterVersion: SEGMENTER_VERSION,
    sourceUri: sourceUri.toString(),
    updatedAt: new Date().toISOString(),
    segments: [],
    translations: {},
  };
}
