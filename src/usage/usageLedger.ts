import * as vscode from "vscode";
import { appendFile } from "node:fs/promises";
import { getProjectsStorageRoot, getProjectUsageDirUri } from "../storage/paths.js";
import type { UsageEventV1 } from "./usageEvent.js";

const EVENT_SHARD_PATTERN = /^events-\d{4}-\d{2}\.jsonl$/;

export type UsageReadScope = "currentProject" | "allProjects";

export type ReadUsageOptions = {
  scope: UsageReadScope;
  /** Required when scope is `currentProject`. Any URI inside the project resolves to its root. */
  projectUri?: vscode.Uri;
};

/** Monthly shard name derived from the event start time (UTC), e.g. `events-2026-06.jsonl`. */
function getMonthShardName(startedAt: string): string {
  const parsed = new Date(startedAt);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `events-${year}-${month}.jsonl`;
}

/**
 * Append one event as a JSONL line to the current month's shard. Uses Node `fs.appendFile` because
 * `vscode.workspace.fs` has no append API. Batch translation is serial, so append contention is low.
 */
export async function appendUsageEvent(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
  event: UsageEventV1,
): Promise<void> {
  const usageDir = getProjectUsageDirUri(context, sourceUri);
  await vscode.workspace.fs.createDirectory(usageDir);
  const fileUri = vscode.Uri.joinPath(usageDir, getMonthShardName(event.startedAt));
  await appendFile(fileUri.fsPath, `${JSON.stringify(event)}\n`, "utf8");
}

async function readDirectorySafe(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try {
    return await vscode.workspace.fs.readDirectory(uri);
  } catch {
    return [];
  }
}

async function resolveUsageDirs(
  context: vscode.ExtensionContext,
  options: ReadUsageOptions,
): Promise<vscode.Uri[]> {
  if (options.scope === "currentProject") {
    if (!options.projectUri) return [];
    return [getProjectUsageDirUri(context, options.projectUri)];
  }
  const projectsRoot = getProjectsStorageRoot(context);
  const entries = await readDirectorySafe(projectsRoot);
  return entries
    .filter(([, type]) => type === vscode.FileType.Directory)
    .map(([name]) => vscode.Uri.joinPath(projectsRoot, name, "usage"));
}

function parseEventLine(line: string): UsageEventV1 | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as UsageEventV1;
    if (parsed && parsed.schemaVersion === 1 && typeof parsed.eventId === "string") {
      return parsed;
    }
  } catch {
    // Skip malformed line; a single bad line must not discard the whole shard.
  }
  return undefined;
}

async function readUsageDir(dir: vscode.Uri, out: UsageEventV1[]): Promise<void> {
  const entries = await readDirectorySafe(dir);
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File || !EVENT_SHARD_PATTERN.test(name)) continue;
    let raw: string;
    try {
      const buf = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, name));
      raw = Buffer.from(buf).toString("utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const event = parseEventLine(line);
      if (event) out.push(event);
    }
  }
}

/** Read and parse usage events across month shards. Malformed lines and missing dirs are skipped. */
export async function readUsageEvents(
  context: vscode.ExtensionContext,
  options: ReadUsageOptions,
): Promise<UsageEventV1[]> {
  const usageDirs = await resolveUsageDirs(context, options);
  const events: UsageEventV1[] = [];
  for (const dir of usageDirs) {
    await readUsageDir(dir, events);
  }
  return events;
}
