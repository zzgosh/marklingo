import * as vscode from 'vscode';
import {
  deleteTrackedWorkspaceOutputs,
  type WorkspaceOutputDeleteSummary,
} from './deleteTranslatedFiles.js';
import { MARKLINGO_CONFIGURATION_KEYS } from '../configurationKeys.js';
import { resetOpenRouterSecretsAndState } from '../services/openRouterClient.js';
import { clearOnboardingState } from '../onboardingState.js';

export type CleanupScopes = {
  apiKeys?: boolean;
  settings?: boolean;
  globalStorage?: boolean;
  workspaceOutputs?: boolean;
};

type CleanupOptionId = 'apiKeys' | 'settings' | 'globalStorage' | 'workspaceOutputs';

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

  await clearOnboardingState(context);
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

function buildSummaryMessage(summary: ClearExtensionDataSummary): string {
  const parts: string[] = [];
  if (summary.apiKeysCleared) parts.push('API key');
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

async function runCleanup(context: vscode.ExtensionContext, ids: Set<CleanupOptionId>): Promise<ClearExtensionDataSummary> {
  return vscode.window.withProgress<ClearExtensionDataSummary>(
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
        progress.report({ message: 'Deleting saved API key' });
        try {
          await resetOpenRouterSecretsAndState(context);
          result.apiKeysCleared = true;
        } catch (error) {
          addCleanupError(result, 'saved API key', error);
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
}

/**
 * Clears the selected categories of extension data after the caller has collected explicit scope
 * confirmation.
 */
export async function clearExtensionDataScopes(context: vscode.ExtensionContext, scopes: CleanupScopes): Promise<boolean> {
  const ids = new Set<CleanupOptionId>();
  if (scopes.apiKeys) ids.add('apiKeys');
  if (scopes.settings) ids.add('settings');
  if (scopes.globalStorage) ids.add('globalStorage');
  if (scopes.workspaceOutputs) ids.add('workspaceOutputs');
  if (ids.size === 0) return false;

  const summary = await runCleanup(context, ids);

  if (summary.errors.length > 0) {
    console.warn('[marklingo] clear extension data errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(buildWarningMessage(summary));
    return true;
  }

  await vscode.window.showInformationMessage(buildSummaryMessage(summary));
  return true;
}
