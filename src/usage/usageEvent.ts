import type { TranslationMetaDebug } from "../translation/cache.js";
import { estimateProviderModelCost } from "./modelPricing.js";

/** Source label for token/cost values. */
export type UsageValueSource = "reported" | "estimated" | "unavailable";

export type UsageTokens = {
  input?: number;
  output?: number;
  total?: number;
  cachedProviderTokens?: number;
  source: UsageValueSource;
};

export type UsageCost = {
  amount: number;
  currency: string;
  source: UsageValueSource;
};

/**
 * One append-only usage event per source-file translation attempt. Privacy boundary: only hashes,
 * counts, labels, and timestamps. Never API keys, prompts, raw paths, or full source/output text.
 */
export type UsageEventV1 = {
  schemaVersion: 1;
  eventId: string;
  batchRunId: string;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: "success" | "error";
  projectId: string;
  projectName: string;
  sourceFileName: string;
  sourceUriHash: string;
  outputUriHash?: string;
  targetLanguage?: string;
  providerType?: string;
  modelId?: string;
  adapterMode?: string;
  sourceBytes?: number;
  lineCount?: number;
  translatableBlocks?: number;
  blocksToTranslate?: number;
  translatedBlocks?: number;
  reusedBlocks?: number;
  fallbackBlocks?: number;
  requestCount?: number;
  tokens: UsageTokens;
  cost?: UsageCost;
};

/**
 * Identity and hashed fields the caller resolves from the live VS Code context before building the
 * event. Kept separate so {@link buildUsageEventFromDebug} stays a pure, environment-free function.
 */
export type UsageEventContext = {
  eventId: string;
  batchRunId: string;
  projectId: string;
  projectName: string;
  sourceFileName: string;
  sourceUriHash: string;
  outputUriHash?: string;
};

/** Sum the per-chunk prompt-token estimates. Covers only blocks sent in the current request. */
function sumEstimatedPromptTokens(debug: TranslationMetaDebug): number | undefined {
  const chunks = debug.plan?.chunks;
  if (!chunks || chunks.length === 0) return undefined;
  let sum = 0;
  for (const chunk of chunks) {
    if (typeof chunk.estimatedPromptTokens === "number") sum += chunk.estimatedPromptTokens;
  }
  return sum;
}

function hasReportedTokenUsage(debug: TranslationMetaDebug): boolean {
  const usage = debug.usage;
  return Boolean(
    usage &&
    (
      typeof usage.promptTokens === "number" ||
      typeof usage.completionTokens === "number" ||
      typeof usage.totalTokens === "number" ||
      typeof usage.cachedTokens === "number"
    ),
  );
}

function buildUsageTokens(debug: TranslationMetaDebug): UsageTokens {
  if (hasReportedTokenUsage(debug)) {
    return {
      input: debug.usage?.promptTokens,
      output: debug.usage?.completionTokens,
      total: debug.usage?.totalTokens,
      cachedProviderTokens: debug.usage?.cachedTokens,
      source: "reported",
    };
  }

  const estimatedInput = sumEstimatedPromptTokens(debug);
  return typeof estimatedInput === "number"
    ? { input: estimatedInput, source: "estimated" }
    : { source: "unavailable" };
}

function buildUsageCost(debug: TranslationMetaDebug): UsageCost | undefined {
  if (typeof debug.usage?.cost === "number") {
    return {
      amount: debug.usage.cost,
      currency: "USD",
      source: "reported",
    };
  }
  const estimate = estimateProviderModelCost(debug.settings?.providerType, debug.settings?.modelId, {
    input: debug.usage?.promptTokens,
    output: debug.usage?.completionTokens,
    total: debug.usage?.totalTokens,
  });
  if (!estimate) return undefined;
  return {
    amount: estimate.amount,
    currency: estimate.currency,
    source: "estimated",
  };
}

/**
 * Map a finished {@link TranslationMetaDebug} plus resolved identity into a privacy-safe usage event.
 * Pure: all environment/IO-derived values arrive via {@link UsageEventContext}. On the failure path
 * `debug.result` may be absent, so result block counts are optional.
 */
export function buildUsageEventFromDebug(
  debug: TranslationMetaDebug,
  ctx: UsageEventContext,
): UsageEventV1 {
  const tokens = buildUsageTokens(debug);
  const cost = buildUsageCost(debug);

  return {
    schemaVersion: 1,
    eventId: ctx.eventId,
    batchRunId: ctx.batchRunId,
    runId: debug.runId,
    startedAt: debug.startedAt,
    finishedAt: debug.finishedAt,
    durationMs: debug.durationMs,
    status: debug.status,
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    sourceFileName: ctx.sourceFileName,
    sourceUriHash: ctx.sourceUriHash,
    outputUriHash: ctx.outputUriHash,
    targetLanguage: debug.settings?.targetLanguage,
    providerType: debug.settings?.providerType,
    modelId: debug.settings?.modelId,
    adapterMode: debug.settings?.adapterMode,
    sourceBytes: debug.document.sourceBytes,
    lineCount: debug.document.lineCount,
    translatableBlocks: debug.document.translatableBlocks,
    blocksToTranslate: debug.document.blocksToTranslate,
    translatedBlocks: debug.result?.translatedBlocks,
    reusedBlocks: debug.result?.reusedBlocks ?? debug.document.cacheHits,
    fallbackBlocks: debug.result?.fallbackBlocks,
    requestCount: debug.plan?.actualRequestCount ?? debug.plan?.chunkCount,
    tokens,
    cost,
  };
}
