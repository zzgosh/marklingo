import * as vscode from 'vscode';
import { seedTargetLanguageSelectionForTest, translateCurrentMarkdown } from './commands/translateCurrentMarkdown.js';
import { deleteAllTranslatedFiles } from './commands/deleteAllTranslatedFiles.js';
import { setOpenRouterApiKey } from './commands/openRouterApiKey.js';
import { setOpenRouterModelId } from './commands/openRouterModelId.js';
import { setTargetLanguage } from './commands/targetLanguage.js';
import { openSettingsPanel } from './webview/settingsPanel.js';
import { seedOpenRouterApiKeyForCurrentEndpointForTest } from './services/openRouterClient.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.translateCurrentMarkdown', () => {
      return translateCurrentMarkdown(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.translateCurrentMarkdownFull', () => {
      return translateCurrentMarkdown(context, { mode: 'full' });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('marklingo.deleteAllTranslatedFiles', () => {
      return deleteAllTranslatedFiles(context);
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
        const origin = await seedOpenRouterApiKeyForCurrentEndpointForTest(context, apiKey);
        return { globalStorageUri: context.globalStorageUri.toString(), origin };
      }),
    );
  }
}

export function deactivate() {
  // no-op
}
