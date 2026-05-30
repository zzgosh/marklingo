import * as vscode from 'vscode';
import {
  deleteTrackedWorkspaceOutputs,
  type WorkspaceOutputDeleteSummary,
} from './deleteAllTranslatedFiles.js';
import { resetOpenRouterSecretsAndState } from '../services/openRouterClient.js';

const TARGET_LANGUAGE_SELECTED_KEY = 'marklingo.translation.targetLanguageSelected';
const MARKLINGO_COMMAND_PREFIX = 'marklingo.';

const CONFIGURATION_KEYS = [
  'openrouter.baseUrl',
  'openrouter.modelId',
  'translation.targetLanguage',
  'translation.targetLanguageCustom',
  'translation.maxBlocksPerRequest',
  'translation.maxContextUsageRatio',
  'translation.deletionFallback',
  'translation.similarityThreshold',
  'translation.systemPrompt',
  'translation.customPrompt',
  'storage.outputLocation',
];

type CleanupOptionId = 'apiKeys' | 'settings' | 'keybindings' | 'globalStorage' | 'workspaceOutputs';

type CleanupOptionItem = vscode.QuickPickItem & {
  id: CleanupOptionId;
};

type UserKeybinding = {
  command?: unknown;
  [key: string]: unknown;
};

type ClearExtensionDataSummary = {
  apiKeysCleared: boolean;
  settingsCleared: number;
  keybindingsCleared: number;
  globalStorageCleared: boolean;
  workspaceOutputs?: WorkspaceOutputDeleteSummary;
  errors: string[];
};

function stripJsonComments(text: string): string {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }

    output += char;
  }
  return output.replace(/,\s*([}\]])/g, '$1');
}

function getUserKeybindingsUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'keybindings.json');
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function isMarkLingoKeybinding(value: unknown): value is UserKeybinding {
  if (!value || typeof value !== 'object') return false;
  const binding = value as UserKeybinding;
  if (typeof binding.command !== 'string') return false;
  const command = binding.command.startsWith('-') ? binding.command.slice(1) : binding.command;
  return command.startsWith(MARKLINGO_COMMAND_PREFIX);
}

async function clearUserKeybindings(context: vscode.ExtensionContext): Promise<number> {
  const uri = getUserKeybindingsUri(context);
  if (!(await uriExists(uri))) return 0;

  const raw = await vscode.workspace.fs.readFile(uri);
  const parsed = JSON.parse(stripJsonComments(Buffer.from(raw).toString('utf8'))) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('User keybindings.json is not a JSON array.');
  }

  const filtered = parsed.filter((item) => !isMarkLingoKeybinding(item));
  const removed = parsed.length - filtered.length;
  if (removed === 0) return 0;

  const body = `// Place your key bindings in this file to override the defaults\n${JSON.stringify(filtered, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(body, 'utf8'));
  return removed;
}

async function clearUserSettings(context: vscode.ExtensionContext): Promise<number> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  let cleared = 0;

  for (const key of CONFIGURATION_KEYS) {
    if (cfg.inspect(key)?.globalValue !== undefined) cleared++;
    await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, undefined);
  return cleared;
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
      id: 'keybindings',
      label: 'Delete MarkLingo user keybindings',
      description: 'Selected by default',
      detail: 'Removes user keybindings whose command starts with marklingo.',
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
  if (summary.keybindingsCleared > 0) parts.push(`${summary.keybindingsCleared} user keybinding(s)`);
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
        keybindingsCleared: 0,
        globalStorageCleared: false,
        errors: [],
      };

      if (ids.has('apiKeys')) {
        progress.report({ message: 'Deleting saved API keys' });
        await resetOpenRouterSecretsAndState(context);
        result.apiKeysCleared = true;
      }

      if (ids.has('settings')) {
        progress.report({ message: 'Deleting user settings' });
        result.settingsCleared = await clearUserSettings(context);
      }

      if (ids.has('keybindings')) {
        progress.report({ message: 'Deleting user keybindings' });
        result.keybindingsCleared = await clearUserKeybindings(context);
      }

      if (ids.has('workspaceOutputs')) {
        progress.report({ message: 'Deleting tracked workspace translated files' });
        result.workspaceOutputs = await deleteTrackedWorkspaceOutputs(context, progress);
        result.errors.push(...result.workspaceOutputs.errors);
      }

      if (ids.has('globalStorage')) {
        progress.report({ message: 'Deleting private metadata/cache' });
        result.globalStorageCleared = await clearExtensionGlobalStorage(context);
      }

      return result;
    },
  );

  if (summary.errors.length > 0) {
    console.warn('[marklingo] clear extension data errors:', summary.errors.slice(0, 20));
    await vscode.window.showWarningMessage(
      `${buildSummaryMessage(summary)} ${summary.errors.length} operation(s) failed. See Developer Tools for details.`,
    );
    return true;
  }

  await vscode.window.showInformationMessage(buildSummaryMessage(summary));
  return true;
}
