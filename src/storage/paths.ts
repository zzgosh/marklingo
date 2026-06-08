import * as vscode from 'vscode';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  getTranslatedMarkdownFileName,
  getTranslationMetaFileName,
} from './outputNames.js';

export type OutputLocation = 'sourceFolder';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sanitizePathPart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return sanitized || 'project';
}

export function getProjectRootUri(sourceUri: vscode.Uri): vscode.Uri {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
  if (workspaceFolder) return workspaceFolder.uri;
  return vscode.Uri.file(path.dirname(sourceUri.fsPath));
}

function getProjectStorageName(sourceUri: vscode.Uri): string {
  const rootUri = getProjectRootUri(sourceUri);
  const rootName = path.basename(rootUri.fsPath) || 'project';
  const id = sha256(rootUri.toString()).slice(0, 12);
  return `${sanitizePathPart(rootName)}-${id}`;
}

export function getProjectsStorageRoot(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, 'projects');
}

export function getProjectStorageRoot(context: vscode.ExtensionContext, sourceUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(getProjectsStorageRoot(context), getProjectStorageName(sourceUri));
}

/**
 * Per-project usage-insights ledger directory. Lives under the same `<project-id>` directory as
 * `meta/`, so the existing `Clear Current Project Data` and `Clear All Data` flows (which delete the
 * whole project storage root / the whole global storage) remove usage data automatically.
 */
export function getProjectUsageDirUri(context: vscode.ExtensionContext, sourceUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(getProjectStorageRoot(context, sourceUri), 'usage');
}

/** Stable hashed project identifier, matching the suffix used by the project storage directory name. */
export function getProjectId(sourceUri: vscode.Uri): string {
  return sha256(getProjectRootUri(sourceUri).toString()).slice(0, 12);
}

/** Human-readable project display name (folder basename), for usage UI rows. */
export function getProjectDisplayName(sourceUri: vscode.Uri): string {
  return path.basename(getProjectRootUri(sourceUri).fsPath) || 'project';
}

export function getMetaFileUri(context: vscode.ExtensionContext, sourceUri: vscode.Uri, targetLanguage: string): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  const id = sha256(sourceUri.toString()).slice(0, 16);
  return vscode.Uri.joinPath(getProjectStorageRoot(context, sourceUri), 'meta', getTranslationMetaFileName(parsed.name, id, targetLanguage));
}

export function getSourceFolderTranslatedFileUri(sourceUri: vscode.Uri, targetLanguage: string): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, getTranslatedMarkdownFileName(parsed.name, targetLanguage)));
}

export function getOutputLocation(): OutputLocation {
  return 'sourceFolder';
}

export function getTranslatedFileUri(_context: vscode.ExtensionContext, sourceUri: vscode.Uri, targetLanguage: string): vscode.Uri {
  return getSourceFolderTranslatedFileUri(sourceUri, targetLanguage);
}
