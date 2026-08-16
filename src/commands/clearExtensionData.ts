import * as vscode from 'vscode';
import {
  deleteTrackedWorkspaceOutputs,
  type WorkspaceOutputDeleteSummary,
} from './deleteTranslatedFiles.js';
import { MARKLINGO_CONFIGURATION_KEYS } from '../configurationKeys.js';
import { resetOpenRouterSecretsAndState } from '../services/openRouterClient.js';
import { clearOnboardingState } from '../onboardingState.js';
import { l10n } from '../localization.js';

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
    const inspected = cfg.inspect(key);
    if (inspected?.globalValue === undefined) continue;
    cleared++;
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
  if (summary.apiKeysCleared) parts.push(l10n('API key'));
  if (summary.settingsCleared > 0) parts.push(l10n('{0} user setting(s)', summary.settingsCleared));
  if (summary.globalStorageCleared) parts.push(l10n('translation metadata/cache'));
  if (summary.workspaceOutputs) {
    parts.push(l10n('{0} workspace translated file(s)', summary.workspaceOutputs.deleted));
    if (summary.workspaceOutputs.skipped > 0) {
      parts.push(l10n('{0} modified translated file(s) skipped', summary.workspaceOutputs.skipped));
    }
  }

  if (parts.length === 0) return l10n('MarkLingo: No selected data was found to clear.');
  return l10n('MarkLingo: Cleared {0}.', parts.join(', '));
}

function buildWarningMessage(summary: ClearExtensionDataSummary): string {
  const failed = [...new Set(summary.failedOperations)];
  const failureSummary = failed.length > 0
    ? l10n('Failed: {0}.', failed.join(', '))
    : l10n('{0} cleanup issue(s) occurred.', summary.errors.length);
  return l10n('{0} {1} See Developer Tools for details.', buildSummaryMessage(summary), failureSummary);
}

function showCleanupNotification(kind: 'info' | 'warning', message: string): void {
  const notification = kind === 'warning'
    ? vscode.window.showWarningMessage(message)
    : vscode.window.showInformationMessage(message);
  void notification.then(undefined, (error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[marklingo] cleanup notification failed:', detail);
  });
}

async function runCleanup(context: vscode.ExtensionContext, ids: Set<CleanupOptionId>): Promise<ClearExtensionDataSummary> {
  return vscode.window.withProgress<ClearExtensionDataSummary>(
    {
      location: vscode.ProgressLocation.Notification,
      title: l10n('MarkLingo: Clearing extension data...'),
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
        progress.report({ message: l10n('Deleting saved API key') });
        try {
          await resetOpenRouterSecretsAndState(context);
          result.apiKeysCleared = true;
        } catch (error) {
          addCleanupError(result, l10n('saved API key'), error);
        }
      }

      if (ids.has('settings')) {
        progress.report({ message: l10n('Deleting user settings') });
        try {
          result.settingsCleared = await clearUserSettings(context);
        } catch (error) {
          addCleanupError(result, l10n('user settings'), error);
        }
      }

      if (ids.has('workspaceOutputs')) {
        progress.report({ message: l10n('Deleting tracked workspace translated files') });
        try {
          result.workspaceOutputs = await deleteTrackedWorkspaceOutputs(context, progress);
          if (result.workspaceOutputs.errors.length > 0) {
            result.failedOperations.push(l10n('tracked workspace translated files'));
          }
          result.errors.push(...result.workspaceOutputs.errors);
        } catch (error) {
          addCleanupError(result, l10n('tracked workspace translated files'), error);
        }
      }

      if (ids.has('globalStorage')) {
        progress.report({ message: l10n('Deleting translation metadata/cache') });
        try {
          result.globalStorageCleared = await clearExtensionGlobalStorage(context);
        } catch (error) {
          addCleanupError(result, l10n('translation metadata/cache'), error);
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
    showCleanupNotification('warning', buildWarningMessage(summary));
    return true;
  }

  showCleanupNotification('info', buildSummaryMessage(summary));
  return true;
}
