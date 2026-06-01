import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  ensureMarkLingoGitExclude,
  findGitRepository,
  MARKLINGO_GIT_EXCLUDE_PATTERN,
  type GitRepositoryInfo,
} from '../git/exclude.js';

function getCurrentStartPath(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === 'file') return activeUri.fsPath;

  const folders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
  if (folders.length === 1) return folders[0].uri.fsPath;
  return undefined;
}

function getExcludeDisplayPath(repo: GitRepositoryInfo): string {
  const defaultExclude = path.join(repo.workTree, '.git', 'info', 'exclude');
  if (path.resolve(repo.excludeFile) === path.resolve(defaultExclude)) return '.git/info/exclude';
  return repo.excludeFile;
}

export async function ignoreTranslatedFilesInGit() {
  const startPath = getCurrentStartPath();
  if (!startPath) {
    await vscode.window.showWarningMessage('MarkLingo: Open a file or single workspace folder in a Git repository before configuring local ignores.');
    return;
  }

  const repo = await findGitRepository(startPath);
  if (!repo) {
    await vscode.window.showWarningMessage('MarkLingo: The current workspace is not a Git repository. Initialize Git before configuring local ignores.');
    return;
  }

  try {
    const result = await ensureMarkLingoGitExclude(repo);
    const target = getExcludeDisplayPath(repo);
    if (result === 'already-present') {
      await vscode.window.showInformationMessage(`MarkLingo: ${MARKLINGO_GIT_EXCLUDE_PATTERN} is already in ${target}.`);
      return;
    }
    await vscode.window.showInformationMessage(`MarkLingo: Added ${MARKLINGO_GIT_EXCLUDE_PATTERN} to ${target}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`MarkLingo: Failed to update .git/info/exclude. ${message}`);
  }
}
