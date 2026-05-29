import * as vscode from 'vscode';
import { seedTargetLanguageSelectionForTest, translateCurrentMarkdown } from './commands/translateCurrentMarkdown.js';
import { deleteAllTranslatedFiles } from './commands/deleteAllTranslatedFiles.js';
import { resetOpenRouterApiKey, setOpenRouterApiKey } from './commands/openRouterApiKey.js';
import { setOpenRouterModelId } from './commands/openRouterModelId.js';
import { setTargetLanguage } from './commands/targetLanguage.js';
import { openSettingsPanel } from './webview/settingsPanel.js';
import { seedOpenRouterApiKeyForCurrentEndpointForTest } from './services/openRouterClient.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.translateCurrentMarkdown', () => {
      return translateCurrentMarkdown(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.translateCurrentMarkdownFull', () => {
      return translateCurrentMarkdown(context, { mode: 'full' });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.deleteAllTranslatedFiles', () => {
      return deleteAllTranslatedFiles(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.openrouter.setApiKey', () => {
      return setOpenRouterApiKey(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.openrouter.resetApiKey', () => {
      return resetOpenRouterApiKey(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.openrouter.setModelId', () => {
      return setOpenRouterModelId(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.setTargetLanguage', () => {
      return setTargetLanguage(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownTranslator.openSettings', () => {
      return openSettingsPanel(context);
    }),
  );

  if (context.extensionMode === vscode.ExtensionMode.Test) {
    context.subscriptions.push(
      vscode.commands.registerCommand('markdownTranslator.test.seedState', async (options?: { apiKey?: string }) => {
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
