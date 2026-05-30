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
