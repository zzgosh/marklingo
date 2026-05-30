import * as vscode from 'vscode';
import {
  deleteTrackedWorkspaceOutputs,
  type WorkspaceOutputDeleteSummary,
} from './deleteAllTranslatedFiles.js';
import { MARKLINGO_CONFIGURATION_KEYS } from '../configurationKeys.js';
import { resetOpenRouterSecretsAndState } from '../services/openRouterClient.js';

const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';

type CleanupOptionId = 'apiKeys' | 'settings' | 'globalStorage' | 'workspaceOutputs';

type CleanupOptionItem = vscode.QuickPickItem & {
  id: CleanupOptionId;
};

type ClearExtensionDataSummary = {
  apiKeysCleared: boolean;
  settingsCleared: number;
  globalStorageCleared: boolean;
  workspaceOutputs?: WorkspaceOutputDeleteSummary;
  failedOperations: string[];
  errors: string[];
};

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function clearUserSettings(context: vscode.ExtensionContext): Promise<number> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  let cleared = 0;

  for (const key of MARKLINGO_CONFIGURATION_KEYS) {
    if (cfg.inspect(key)?.globalValue !== undefined) cleared++;
    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, undefined);
  return cleared;
}

function addCleanupError(summary: ClearExtensionDataSummary, label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  summary.failedOperations.push(label);
  summary.errors.push(`${label}: ${message}`);
}

async function clearExtensionGlobalStorage(context: vscode.ExtensionContext): Promise<boolean> {
  if (!(await uriExists(context.globalStorageUri))) return false;
  await vscode.workspace.fs.delete(context.globalStorageUri, { recursive: true, useTrash: true });
  return true;
}

function getCleanupItems(): CleanupOptionItem[] {
  return [
    {
      id: 'apiKeys',
      label: 'Delete saved API keys',
      description: 'Selected by default',
      detail: 'Deletes MarkLingo API keys stored in VS Code SecretStorage.',
      picked: true,
    },
    {
      id: 'settings',
      label: 'Delete MarkLingo user settings',
      description: 'Selected by default',
      detail: 'Removes marklingo.* keys from VS Code User settings.',
      picked: true,
    },
    {
      id: 'globalStorage',
      label: 'Delete private metadata/cache',
      description: 'Selected by default',
      detail: 'Deletes the extension globalStorage folder, including private cache and metadata.',
      picked: true,
    },
    {
      id: 'workspaceOutputs',
      label: 'Delete tracked workspace translated files',
      description: 'Not selected by default',
      detail: 'Deletes tracked source-folder *_mdt.md outputs when they were not edited after generation.',
      picked: false,
    },
  ];
}

function selectedIds(items: readonly CleanupOptionItem[]): Set<CleanupOptionId> {
  return new Set(items.map((item) => item.id));
}

function buildConfirmMessage(items: readonly CleanupOptionItem[]): string {
  const labels = items.map((item) => `- ${item.label}`).join('\n');
  const ids = selectedIds(items);
  const metadataWarning = ids.has('globalStorage') && !ids.has('workspaceOutputs')
    ? '\n\nTracked workspace *_mdt.md files will be left in place and may need manual deletion later.'
    : '';
  return `MarkLingo will delete the selected data:\n\n${labels}${metadataWarning}`;
}

function buildSummaryMessage(summary: ClearExtensionDataSummary): string {
  const parts: string[] = [];
  if (summary.apiKeysCleared) parts.push('API keys');
  if (summary.settingsCleared > 0) parts.push(`${summary.settingsCleared} user setting(s)`);
  if (summary.globalStorageCleared) parts.push('private metadata/cache');
  if (summary.workspaceOutputs) {
    parts.push(`${summary.workspaceOutputs.deleted} workspace translated file(s)`);
    if (summary.workspaceOutputs.skipped > 0) {
      parts.push(`${summary.workspaceOutputs.skipped} modified translated file(s) skipped`);
    }
  }

  if (parts.length === 0) return 'MarkLingo: No selected data was found to clear.';
  return `MarkLingo: Cleared ${parts.join(', ')}.`;
}

function buildWarningMessage(summary: ClearExtensionDataSummary): string {
  const failed = [...new Set(summary.failedOperations)];
  const failureSummary = failed.length > 0
    ? `Failed: ${failed.join(', ')}.`
    : `${summary.errors.length} cleanup issue(s) occurred.`;
  return `${buildSummaryMessage(summary)} ${failureSummary} See Developer Tools for details.`;
}

export async function clearExtensionData(context: vscode.ExtensionContext): Promise<boolean> {
  const picked = await vscode.window.showQuickPick(getCleanupItems(), {
    title: 'MarkLingo: Clear Extension Data',
    placeHolder: 'Select the data MarkLingo should delete. Workspace translated files are not selected by default.',
    canPickMany: true,
    ignoreFocusOut: true,
  });
  if (!picked || picked.length === 0) return false;

  const confirm = await vscode.window.showWarningMessage(
    buildConfirmMessage(picked),
    { modal: true },
    'Clear Selected Data',
  );
  if (confirm !== 'Clear Selected Data') return false;

  const ids = selectedIds(picked);
  const summary = await vscode.window.withProgress<ClearExtensionDataSummary>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Clearing extension data...',
      cancellable: false,
    },
    async (progress) => {
      const result: ClearExtensionDataSummary = {
        apiKeysCleared: false,
        settingsCleared: 0,
        globalStorageCleared: false,
        failedOperations: [],
        errors: [],
      };

      if (ids.has('apiKeys')) {
        progress.report({ message: 'Deleting saved API keys' });
        try {
          await resetOpenRouterSecretsAndState(context);
          result.apiKeysCleared = true;
        } catch (error) {
          addCleanupError(result, 'saved API keys', error);
        }
      }

      if (ids.has('settings')) {
        progress.report({ message: 'Deleting user settings' });
        try {
          result.settingsCleared = await clearUserSettings(context);
        } catch (error) {
          addCleanupError(result, 'user settings', error);
        }
      }

      if (ids.has('workspaceOutputs')) {
        progress.report({ message: 'Deleting tracked workspace translated files' });
        try {
          result.workspaceOutputs = await deleteTrackedWorkspaceOutputs(context, progress);
          if (result.workspaceOutputs.errors.length > 0) {
            result.failedOperations.push('tracked workspace translated files');
          }
          result.errors.push(...result.workspaceOutputs.errors);
        } catch (error) {
          addCleanupError(result, 'tracked workspace translated files', error);
        }
      }

      if (ids.has('globalStorage')) {
        progress.report({ message: 'Deleting private metadata/cache' });
        try {
          result.globalStorageCleared = await clearExtensionGlobalStorage(context);
        } catch (error) {
          addCleanupError(result, 'private metadata/cache', error);
        }
      }

      return result;
    },
  );

  if (summary.errors.length > 0) {
    console.warn('[marklingo] clear extension data errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(buildWarningMessage(summary));
    return true;
  }

  await vscode.window.showInformationMessage(buildSummaryMessage(summary));
  return true;
}
