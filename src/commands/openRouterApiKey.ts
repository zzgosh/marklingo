import * as vscode from 'vscode';

const OPENROUTER_API_KEY_SECRET = 'markdownTranslator.openrouter.apiKey';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const existing = await context.secrets.get(OPENROUTER_API_KEY_SECRET);
  const hasExisting = !!existing?.trim();

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter API Key',
    prompt: hasExisting
      ? '已存在已保存的 API Key（不可见）。输入新的 Key 将覆盖。'
      : '请输入 OpenRouter API Key（将安全地存入 VS Code SecretStorage）。',
    password: true,
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('Markdown Translator: 未输入 API Key，已取消。');
    return;
  }

  await context.secrets.store(OPENROUTER_API_KEY_SECRET, input.trim());
  await vscode.window.showInformationMessage('Markdown Translator: 已保存 OpenRouter API Key（SecretStorage）。');
}

export async function resetOpenRouterApiKey(context: vscode.ExtensionContext) {
  const existing = await context.secrets.get(OPENROUTER_API_KEY_SECRET);
  if (!existing?.trim()) {
    await vscode.window.showInformationMessage('Markdown Translator: 当前没有保存的 OpenRouter API Key。');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Markdown Translator: 将删除已保存的 OpenRouter API Key（SecretStorage）。是否继续？',
    { modal: true },
    'Reset',
  );
  if (confirm !== 'Reset') return;

  await context.secrets.delete(OPENROUTER_API_KEY_SECRET);
  await vscode.window.showInformationMessage('Markdown Translator: 已删除 OpenRouter API Key。');
}

