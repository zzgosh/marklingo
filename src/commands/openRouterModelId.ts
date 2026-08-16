import * as vscode from 'vscode';
import { DEFAULT_OPENROUTER_MODEL_ID, OPENROUTER_PROVIDER_MODEL_ID_SETTING } from '../services/openRouterClient.js';
import { l10n } from '../localization.js';

const OPENROUTER_MODEL_ID_LAST_USED = 'marklingo.openrouter.lastModelId';

export async function setOpenRouterModelId(context: vscode.ExtensionContext) {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  const cfg = vscode.workspace.getConfiguration('marklingo', activeUri);

  const existing = (context.globalState.get<string>(OPENROUTER_MODEL_ID_LAST_USED) ?? '').trim();

  const input = await vscode.window.showInputBox({
    title: l10n('MarkLingo: OpenRouter Model ID'),
    prompt: l10n('Model ID. Default: {0}.', DEFAULT_OPENROUTER_MODEL_ID),
    password: false,
    value: existing || DEFAULT_OPENROUTER_MODEL_ID,
    placeHolder: l10n('Default: {0}', DEFAULT_OPENROUTER_MODEL_ID),
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage(l10n('MarkLingo: Model ID was empty, so the operation was canceled.'));
    return;
  }

  const modelId = input.trim();
  await context.globalState.update(OPENROUTER_MODEL_ID_LAST_USED, modelId);

  const inspected = cfg.inspect<string>('openrouter.modelId');
  const hasWorkspaceFolderValue = typeof inspected?.workspaceFolderValue === 'string' && inspected.workspaceFolderValue.trim();
  const hasWorkspaceValue = typeof inspected?.workspaceValue === 'string' && inspected.workspaceValue.trim();
  const target = hasWorkspaceFolderValue
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : hasWorkspaceValue
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;

  await cfg.update(OPENROUTER_PROVIDER_MODEL_ID_SETTING, modelId, target);
  await cfg.update('openrouter.modelId', modelId, target);
  await vscode.window.showInformationMessage(l10n('MarkLingo: Model ID saved: {0}', modelId));
}
