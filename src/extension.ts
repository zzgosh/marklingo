import * as vscode from 'vscode';
import { seedTargetLanguageSelectionForTest, translateCurrentMarkdown, translateFolderMarkdown } from './commands/translateCurrentMarkdown.js';
import { deleteCurrentProjectTranslatedFiles, deleteProjectTranslationData } from './commands/deleteTranslatedFiles.js';
import { setOpenRouterApiKey } from './commands/openRouterApiKey.js';
import { setOpenRouterModelId } from './commands/openRouterModelId.js';
import { setTargetLanguage } from './commands/targetLanguage.js';
import { ignoreTranslatedFilesInGit } from './commands/ignoreTranslatedFilesInGit.js';
import { openSettingsPanel } from './webview/settingsPanel.js';
import { seedOpenRouterApiKeyForTest } from './services/openRouterClient.js';
import { compactPrivateStorage, readPrivateStorageStats } from './storage/privateStorage.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.translateCurrentMarkdown', (resource?: vscode.Uri) => {
      return translateCurrentMarkdown(context, resource);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.translateCurrentMarkdownFull', (resource?: vscode.Uri) => {
      return translateCurrentMarkdown(context, resource, { mode: 'full' });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.translateFolderMarkdown', (resource?: vscode.Uri) => {
      return translateFolderMarkdown(context, resource);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.deleteCurrentProjectTranslatedFiles', () => {
      return deleteCurrentProjectTranslatedFiles(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.ignoreTranslatedFilesInGit', () => {
      return ignoreTranslatedFilesInGit();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.openrouter.setApiKey', () => {
      return setOpenRouterApiKey(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.openrouter.setModelId', () => {
      return setOpenRouterModelId(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.setTargetLanguage', () => {
      return setTargetLanguage(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.openSettings', () => {
      return openSettingsPanel(context);
    }),
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand('marklingo.test.seedState', async (options?: { apiKey?: string }) => {
        await seedTargetLanguageSelectionForTest(context);
        const apiKey = (options?.apiKey ?? 'test-key').trim();
        const origin = await seedOpenRouterApiKeyForTest(context, apiKey);
        return { globalStorageUri: context.globalStorageUri.toString(), origin };
      }),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('marklingo.test.deleteProjectTranslationData', (options?: {
        projectUri?: string;
        workspaceOutputs?: boolean;
        metadataCache?: boolean;
      }) => {
        const projectUri = options?.projectUri ? vscode.Uri.parse(options.projectUri) : vscode.window.activeTextEditor?.document.uri;
        if (!projectUri) throw new Error('Missing projectUri for test cleanup command.');
        return deleteProjectTranslationData(context, projectUri, undefined, {
          workspaceOutputs: options?.workspaceOutputs ?? true,
          metadataCache: options?.metadataCache ?? true,
        });
      }),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('marklingo.test.compactPrivateStorage', (options?: { targetBytes?: number; quotaBytes?: number }) => {
        return compactPrivateStorage(context, options);
      }),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand('marklingo.test.readPrivateStorageStats', () => {
        return readPrivateStorageStats(context);
      }),
    );
  }
}

export function deactivate() {
  // no-op
}
