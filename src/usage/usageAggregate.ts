import type { UsageEventV1 } from "./usageEvent.js";

export type UsageBreakdownEntry = {
  key: string;
  runs: number;
  files: number;
};

export type RecentRun = {
  eventId: string;
  startedAt: string;
  finishedAt?: string;
  status: "success" | "error";
  projectName: string;
  sourceFileName: string;
  targetLanguage?: string;
  providerType?: string;
  modelId?: string;
  translatedBlocks?: number;
  reusedBlocks?: number;
  fallbackBlocks?: number;
  durationMs?: number;
  tokensInput?: number;
  tokensSource: string;
};

export type UsageSummary = {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  filesTranslated: number;
  projectsTouched: number;
  translatedBlocks: number;
  reusedBlocks: number;
  fallbackBlocks: number;
  /** reused / (reused + translated); undefined when no blocks were processed. */
  reusePercent?: number;
  estimatedInputTokens: number;
  /** True once any provider-reported token total is present (Phase 3). */
  hasReportedTokens: boolean;
  providers: UsageBreakdownEntry[];
  models: UsageBreakdownEntry[];
  targetLanguages: UsageBreakdownEntry[];
  recentRuns: RecentRun[];
};

export type AggregateUsageOptions = {
  recentLimit?: number;
};

function emptySummary(): UsageSummary {
  return {
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
    filesTranslated: 0,
    projectsTouched: 0,
    translatedBlocks: 0,
    reusedBlocks: 0,
    fallbackBlocks: 0,
    reusePercent: undefined,
    estimatedInputTokens: 0,
    hasReportedTokens: false,
    providers: [],
    models: [],
    targetLanguages: [],
    recentRuns: [],
  };
}

type BreakdownAccumulator = Map<string, { runs: number; files: Set<string> }>;

function addBreakdown(acc: BreakdownAccumulator, key: string | undefined, fileHash: string): void {
  if (!key) return;
  const entry = acc.get(key) ?? { runs: 0, files: new Set<string>() };
  entry.runs += 1;
  entry.files.add(fileHash);
  acc.set(key, entry);
}

function toBreakdownEntries(acc: BreakdownAccumulator): UsageBreakdownEntry[] {
  return [...acc.entries()]
    .map(([key, value]) => ({ key, runs: value.runs, files: value.files.size }))
    .sort((a, b) => b.runs - a.runs || a.key.localeCompare(b.key));
}

function runTimestamp(event: UsageEventV1): string {
  return event.finishedAt ?? event.startedAt;
}

function toRecentRun(event: UsageEventV1): RecentRun {
  return {
    eventId: event.eventId,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt,
    status: event.status,
    projectName: event.projectName,
    sourceFileName: event.sourceFileName,
    targetLanguage: event.targetLanguage,
    providerType: event.providerType,
    modelId: event.modelId,
    translatedBlocks: event.translatedBlocks,
    reusedBlocks: event.reusedBlocks,
    fallbackBlocks: event.fallbackBlocks,
    durationMs: event.durationMs,
    tokensInput: event.tokens?.input,
    tokensSource: event.tokens?.source ?? "unavailable",
  };
}

/** Aggregate raw usage events into the Phase 1 summary. Pure; tolerates an empty input. */
export function aggregateUsage(
  events: UsageEventV1[],
  options: AggregateUsageOptions = {},
): UsageSummary {
  if (events.length === 0) return emptySummary();

  const recentLimit = options.recentLimit ?? 30;
  const summary = emptySummary();
  const translatedFiles = new Set<string>();
  const projects = new Set<string>();
  const providers: BreakdownAccumulator = new Map();
  const models: BreakdownAccumulator = new Map();
  const targetLanguages: BreakdownAccumulator = new Map();

  for (const event of events) {
    summary.totalRuns += 1;
    if (event.status === "success") {
      summary.successRuns += 1;
      translatedFiles.add(event.sourceUriHash);
    } else {
      summary.failedRuns += 1;
    }
    projects.add(event.projectId);

    summary.translatedBlocks += event.translatedBlocks ?? 0;
    summary.reusedBlocks += event.reusedBlocks ?? 0;
    summary.fallbackBlocks += event.fallbackBlocks ?? 0;

    if (event.tokens?.source === "reported") {
      summary.hasReportedTokens = true;
    }
    if (typeof event.tokens?.input === "number" && event.tokens.source === "estimated") {
      summary.estimatedInputTokens += event.tokens.input;
    }

    addBreakdown(providers, event.providerType, event.sourceUriHash);
    addBreakdown(models, event.modelId, event.sourceUriHash);
    addBreakdown(targetLanguages, event.targetLanguage, event.sourceUriHash);
  }

  summary.filesTranslated = translatedFiles.size;
  summary.projectsTouched = projects.size;

  const reuseDenominator = summary.reusedBlocks + summary.translatedBlocks;
  summary.reusePercent =
    reuseDenominator > 0 ? (summary.reusedBlocks / reuseDenominator) * 100 : undefined;

  summary.providers = toBreakdownEntries(providers);
  summary.models = toBreakdownEntries(models);
  summary.targetLanguages = toBreakdownEntries(targetLanguages);

  summary.recentRuns = [...events]
    .sort((a, b) => runTimestamp(b).localeCompare(runTimestamp(a)))
    .slice(0, recentLimit)
    .map(toRecentRun);

  return summary;
}
