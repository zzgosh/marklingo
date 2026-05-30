import * as vscode from 'vscode';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export type OutputLocation = 'sourceFolder' | 'privateStorage';

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

export function getMetaFileUri(context: vscode.ExtensionContext, sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  const id = sha256(sourceUri.toString()).slice(0, 16);
  return vscode.Uri.joinPath(getProjectStorageRoot(context, sourceUri), 'meta', `${parsed.name}_${id}_mdt.meta.json`);
}

export function getSourceFolderTranslatedFileUri(sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}_mdt.md`));
}

export function getPrivateTranslatedFileUri(context: vscode.ExtensionContext, sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  const id = sha256(sourceUri.toString()).slice(0, 8);
  return vscode.Uri.joinPath(getProjectStorageRoot(context, sourceUri), 'translated', `${parsed.name}_${id}_mdt.md`);
}

export function getOutputLocation(): OutputLocation {
  const configured = vscode.workspace
    .getConfiguration('marklingo')
    .get<string>('storage.outputLocation', 'sourceFolder');
  return configured === 'privateStorage' ? 'privateStorage' : 'sourceFolder';
}

export function getTranslatedFileUri(context: vscode.ExtensionContext, sourceUri: vscode.Uri): vscode.Uri {
  return getOutputLocation() === 'privateStorage'
    ? getPrivateTranslatedFileUri(context, sourceUri)
    : getSourceFolderTranslatedFileUri(sourceUri);
}
