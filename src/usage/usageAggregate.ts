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

export type UsageRange = "7d" | "30d" | "90d" | "all";
export type UsageGroupBy = "day" | "week" | "month";
export type UsageScope = "currentProject" | "allProjects";
export type UsageBreakdown = "provider" | "model" | "project" | "targetLanguage";

export type UsageQuery = {
  range: UsageRange;
  groupBy: UsageGroupBy;
  scope: UsageScope;
  breakdown: UsageBreakdown;
};

export const DEFAULT_USAGE_QUERY: UsageQuery = {
  range: "30d",
  groupBy: "day",
  scope: "allProjects",
  breakdown: "model",
};

export type UsageBucketSegment = { key: string; runs: number };

export type UsageBucket = {
  key: string;
  label: string;
  totalRuns: number;
  segments: UsageBucketSegment[];
};

export type UsageView = UsageSummary & {
  query: UsageQuery;
  buckets: UsageBucket[];
  /** Ordered stacking keys: the top dimension values plus "Other" when truncated. */
  dimensionKeys: string[];
  tops: UsageBreakdownEntry[];
  reuse: { translated: number; reused: number; fallback: number };
};

export type AggregateUsageViewContext = {
  now?: Date;
  currentProjectId?: string;
};

const DAY_MS = 86_400_000;
const MAX_BUCKETS = 120;
const TOP_STACK_KEYS = 6;
const TOP_LIST_ENTRIES = 8;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeDays(range: UsageRange): number | undefined {
  switch (range) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    default: return undefined;
  }
}

function breakdownKeyOf(event: UsageEventV1, breakdown: UsageBreakdown): string {
  switch (breakdown) {
    case "provider": return event.providerType ?? "Unknown";
    case "model": return event.modelId ?? "Unknown";
    case "project": return event.projectName ?? "Unknown";
    case "targetLanguage": return event.targetLanguage ?? "Unknown";
  }
}

function withinRange(event: UsageEventV1, cutoffMs: number | undefined): boolean {
  if (cutoffMs === undefined) return true;
  const t = Date.parse(runTimestamp(event));
  return !Number.isNaN(t) && t >= cutoffMs;
}

function filterEvents(
  events: UsageEventV1[],
  query: UsageQuery,
  now: Date,
  currentProjectId: string | undefined,
): UsageEventV1[] {
  const days = rangeDays(query.range);
  const cutoffMs = days === undefined ? undefined : now.getTime() - days * DAY_MS;
  return events.filter((event) => {
    if (query.scope === "currentProject") {
      if (!currentProjectId || event.projectId !== currentProjectId) return false;
    }
    return withinRange(event, cutoffMs);
  });
}

function computeBreakdown(events: UsageEventV1[], breakdown: UsageBreakdown): UsageBreakdownEntry[] {
  const acc: BreakdownAccumulator = new Map();
  for (const event of events) {
    const key = breakdownKeyOf(event, breakdown);
    const entry = acc.get(key) ?? { runs: 0, files: new Set<string>() };
    entry.runs += 1;
    entry.files.add(event.sourceUriHash);
    acc.set(key, entry);
  }
  return toBreakdownEntries(acc);
}

function alignDayUtc(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function alignWeekUtc(ms: number): number {
  const day = alignDayUtc(ms);
  const dow = new Date(day).getUTCDay();
  return day - ((dow + 6) % 7) * DAY_MS;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function monthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

function bucketKeyOf(ms: number, groupBy: UsageGroupBy): string {
  if (groupBy === "month") return monthKey(ms);
  if (groupBy === "week") return isoDate(alignWeekUtc(ms));
  return isoDate(ms);
}

function bucketSpan(
  events: UsageEventV1[],
  query: UsageQuery,
  now: Date,
): { startMs: number; endMs: number } | undefined {
  const days = rangeDays(query.range);
  const endMs = now.getTime();
  if (days !== undefined) {
    return { startMs: endMs - (days - 1) * DAY_MS, endMs };
  }
  let min = Infinity;
  for (const event of events) {
    const t = Date.parse(runTimestamp(event));
    if (!Number.isNaN(t)) min = Math.min(min, t);
  }
  if (min === Infinity) return undefined;
  return { startMs: min, endMs };
}

function generateBucketScaffold(
  span: { startMs: number; endMs: number },
  groupBy: UsageGroupBy,
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  if (groupBy === "month") {
    const startDate = new Date(span.startMs);
    const endDate = new Date(span.endMs);
    let cur = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1);
    const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1);
    while (cur <= end) {
      out.push({ key: monthKey(cur), label: monthLabel(cur) });
      const d = new Date(cur);
      cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
  } else if (groupBy === "week") {
    let cur = alignWeekUtc(span.startMs);
    const end = alignWeekUtc(span.endMs);
    while (cur <= end) {
      out.push({ key: isoDate(cur), label: dayLabel(cur) });
      cur += 7 * DAY_MS;
    }
  } else {
    let cur = alignDayUtc(span.startMs);
    const end = alignDayUtc(span.endMs);
    while (cur <= end) {
      out.push({ key: isoDate(cur), label: dayLabel(cur) });
      cur += DAY_MS;
    }
  }
  return out.length > MAX_BUCKETS ? out.slice(out.length - MAX_BUCKETS) : out;
}

function buildBuckets(
  events: UsageEventV1[],
  query: UsageQuery,
  now: Date,
  dimensionKeys: string[],
): UsageBucket[] {
  const span = bucketSpan(events, query, now);
  if (!span) return [];
  const scaffold = generateBucketScaffold(span, query.groupBy);
  const dimSet = new Set(dimensionKeys);
  const hasOther = dimSet.has("Other");
  const counts = new Map<string, Map<string, number>>();
  for (const event of events) {
    const t = Date.parse(runTimestamp(event));
    if (Number.isNaN(t)) continue;
    const bucketKey = bucketKeyOf(t, query.groupBy);
    let dim = breakdownKeyOf(event, query.breakdown);
    if (!dimSet.has(dim)) dim = hasOther ? "Other" : dim;
    const bucket = counts.get(bucketKey) ?? new Map<string, number>();
    bucket.set(dim, (bucket.get(dim) ?? 0) + 1);
    counts.set(bucketKey, bucket);
  }
  return scaffold.map(({ key, label }) => {
    const bucket = counts.get(key);
    const segments = dimensionKeys.map((dimKey) => ({ key: dimKey, runs: bucket?.get(dimKey) ?? 0 }));
    const totalRuns = segments.reduce((sum, segment) => sum + segment.runs, 0);
    return { key, label, totalRuns, segments };
  });
}

/**
 * Aggregate events into a query-driven view: summary cards, time buckets stacked by the selected
 * breakdown, a top-dimension list, and cache-reuse totals. Pure; `now` and `currentProjectId` are
 * passed in so the function stays environment-free and testable. Extends {@link UsageSummary}.
 */
export function aggregateUsageView(
  events: UsageEventV1[],
  query: UsageQuery,
  context: AggregateUsageViewContext = {},
): UsageView {
  const now = context.now ?? new Date();
  const filtered = filterEvents(events, query, now, context.currentProjectId);
  const summary = aggregateUsage(filtered, { recentLimit: 25 });
  const breakdownEntries = computeBreakdown(filtered, query.breakdown);
  const topKeys = breakdownEntries.slice(0, TOP_STACK_KEYS).map((entry) => entry.key);
  const dimensionKeys = breakdownEntries.length > TOP_STACK_KEYS ? [...topKeys, "Other"] : topKeys;
  const buckets = buildBuckets(filtered, query, now, dimensionKeys);
  return {
    ...summary,
    query,
    buckets,
    dimensionKeys,
    tops: breakdownEntries.slice(0, TOP_LIST_ENTRIES),
    reuse: {
      translated: summary.translatedBlocks,
      reused: summary.reusedBlocks,
      fallback: summary.fallbackBlocks,
    },
  };
}

const USAGE_RANGE_VALUES: UsageRange[] = ["7d", "30d", "90d", "all"];
const USAGE_GROUPBY_VALUES: UsageGroupBy[] = ["day", "week", "month"];
const USAGE_SCOPE_VALUES: UsageScope[] = ["currentProject", "allProjects"];
const USAGE_BREAKDOWN_VALUES: UsageBreakdown[] = ["provider", "model", "project", "targetLanguage"];

/** Coerce an untrusted message payload into a valid UsageQuery, falling back to defaults per field. */
export function coerceUsageQuery(raw: unknown): UsageQuery {
  const source = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  return {
    range: pick(source.range, USAGE_RANGE_VALUES, DEFAULT_USAGE_QUERY.range),
    groupBy: pick(source.groupBy, USAGE_GROUPBY_VALUES, DEFAULT_USAGE_QUERY.groupBy),
    scope: pick(source.scope, USAGE_SCOPE_VALUES, DEFAULT_USAGE_QUERY.scope),
    breakdown: pick(source.breakdown, USAGE_BREAKDOWN_VALUES, DEFAULT_USAGE_QUERY.breakdown),
  };
}
