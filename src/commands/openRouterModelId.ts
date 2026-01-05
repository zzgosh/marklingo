import * as vscode from 'vscode';

const OPENROUTER_MODEL_ID_LAST_USED = 'markdownTranslator.openrouter.lastModelId';

export async function setOpenRouterModelId(context: vscode.ExtensionContext) {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  const cfg = vscode.workspace.getConfiguration('markdownTranslator', activeUri);

  const existing = (context.globalState.get<string>(OPENROUTER_MODEL_ID_LAST_USED) ?? '').trim();

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter Model ID',
    prompt: '请输入 OpenRouter modelId（例如：openai/gpt-4o-mini）。',
    password: false,
    placeHolder: existing || '例如：openai/gpt-4o-mini',
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('Markdown Translator: 未输入 modelId，已取消。');
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

  await cfg.update('openrouter.modelId', modelId, target);
  await vscode.window.showInformationMessage(`Markdown Translator: 已保存 OpenRouter modelId：${modelId}`);
}
