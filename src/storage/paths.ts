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

function getProjectRootUri(sourceUri: vscode.Uri): vscode.Uri {
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
