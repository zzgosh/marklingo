import * as vscode from 'vscode';
import {
  deleteOpenRouterApiKeyForCurrentEndpoint,
  getCurrentOpenRouterEndpoint,
  hasOpenRouterApiKeyForCurrentEndpoint,
  storeOpenRouterApiKeyForCurrentEndpoint,
} from '../services/openRouterClient.js';

export async function setOpenRouterApiKey(context: vscode.ExtensionContext) {
  const endpoint = await getCurrentOpenRouterEndpoint(context);
  const hasExisting = await hasOpenRouterApiKeyForCurrentEndpoint(context);

  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: OpenRouter API Key',
    prompt: hasExisting
      ? `已存在 ${endpoint.origin} 的 API Key（不可见）。输入新的 Key 将覆盖。`
      : `请输入 ${endpoint.origin} 的 API Key（将安全地存入 VS Code SecretStorage）。`,
    password: true,
    ignoreFocusOut: true,
  });

  if (input === undefined) return;
  if (!input.trim()) {
    await vscode.window.showWarningMessage('Markdown Translator: 未输入 API Key，已取消。');
    return;
  }

  const origin = await storeOpenRouterApiKeyForCurrentEndpoint(context, input.trim());
  await vscode.window.showInformationMessage(`Markdown Translator: 已保存 ${origin} 的 API Key（SecretStorage）。`);
}

export async function resetOpenRouterApiKey(context: vscode.ExtensionContext) {
  const endpoint = await getCurrentOpenRouterEndpoint(context);
  const hasExisting = await hasOpenRouterApiKeyForCurrentEndpoint(context);
  if (!hasExisting) {
    await vscode.window.showInformationMessage(`Markdown Translator: 当前没有保存 ${endpoint.origin} 的 OpenRouter API Key。`);
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Markdown Translator: 将删除 ${endpoint.origin} 已保存的 OpenRouter API Key（SecretStorage）。是否继续？`,
    { modal: true },
    'Reset',
  );
  if (confirm !== 'Reset') return;

  const origin = await deleteOpenRouterApiKeyForCurrentEndpoint(context);
  await vscode.window.showInformationMessage(`Markdown Translator: 已删除 ${origin} 的 OpenRouter API Key。`);
}
