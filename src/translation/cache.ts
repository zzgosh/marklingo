import * as vscode from "vscode";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { SEGMENTER_VERSION } from "./segmenter.js";

export type MetaSegment = {
  type: string;
  srcHash: string;
  source: string;
};

export type TranslationDebugEvent = {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
};

export type TranslationRequestDebug = {
  index: number;
  blockCount: number;
  estimatedPromptTokens: number;
  durationMs?: number;
  status?: "success" | "error";
};

export type TranslationMetaDebug = {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: "success" | "error";
  extension: {
    id: string;
    version: string;
    mode: string;
  };
  environment: {
    appName: string;
    vscodeVersion: string;
    uiKind: string;
    remoteName?: string;
    workspaceFolderCount: number;
  };
  document: {
    languageId: string;
    lineCount: number;
    sourceBytes: number;
    sourceHash: string;
    totalSegments?: number;
    translatableBlocks?: number;
    blocksToTranslate?: number;
    cacheHits?: number;
  };
  settings?: {
    baseUrl: string;
    modelId: string;
    targetLanguage?: string;
    outputLocation: string;
    maxBlocksPerRequest?: number;
    maxContextUsageRatio?: number;
    deletionFallback?: boolean;
    similarityThreshold?: number;
    systemPromptSource?: "default" | "custom";
    systemPromptHash?: string;
    customPromptSet?: boolean;
    customPromptHash?: string;
    request: {
      stream: false;
      temperature: number;
      responseFormat: string;
      reasoning: {
        effort: "none";
        exclude: true;
      };
    };
  };
  plan?: {
    mode: "full" | "incremental";
    requestedMode: "auto" | "full";
    strategy: "contextWindow" | "fallbackBlocks";
    modelContextLength?: number;
    contextBudgetTokens?: number;
    chunkCount: number;
    chunks: TranslationRequestDebug[];
  };
  result?: {
    outputHash?: string;
    translatedBlocks: number;
    reusedBlocks: number;
    fallbackBlocks: number;
    warningCount: number;
  };
  warnings: Array<{ blockId: string; reason: string }>;
  error?: {
    message: string;
    stack?: string;
  };
  events: TranslationDebugEvent[];
};

export type TranslationMetaV1 = {
  version: 1;
  segmenterVersion: string;
  sourceUri: string;
  outputUri?: string;
  outputHash?: string;
  targetLanguage?: string;
  updatedAt: string;
  segments: MetaSegment[];
  translations: Record<string, string>;
  debug?: TranslationMetaDebug;
};

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
    if (typeof json.outputUri !== "undefined" && typeof json.outputUri !== "string")
      return null;
    if (typeof json.outputHash !== "undefined" && typeof json.outputHash !== "string")
      return null;
    if (typeof json.targetLanguage !== "undefined" && typeof json.targetLanguage !== "string")
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
  const raw = JSON.stringify(meta);
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
  // Split Latin text by spaces and CJK text at a rough single-character granularity.
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
  // Treat deletion conservatively: only a net block decrease triggers a full retranslation.
  // This avoids treating whole-block rewrites as deletions when missing and added counts are similar.
  const netDecrease = missingPrev.length > addedNext.length || next.length < prev.length;
  if (!netDecrease) return false;

  // If missing blocks closely match added blocks, treat the change as a rewrite/merge instead of deletion.
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
