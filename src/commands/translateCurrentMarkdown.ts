import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  getOpenRouterModelContextLength,
  getOpenRouterSettings,
  openRouterChatCompletion,
  type ChatCompletionOptions,
  type OpenRouterSettings,
} from '../services/openRouterClient.js';
import { enforcePrivateStorageQuota } from '../storage/privateStorage.js';
import { getMetaFileUri, getOutputLocation, getTranslatedFileUri } from '../storage/paths.js';
import { restoreTranslatedBlock } from '../translation/blockResults.js';
import { compactPlaceholderTokens, protectMarkdown } from '../translation/placeholders.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import { clampContextUsageRatio, estimatePromptTokens, planTranslationRequests, type TranslationRequestBlock } from '../translation/requestPlanner.js';
import { SEGMENTER_VERSION, segmentMarkdownDocument } from '../translation/segmenter.js';
import {
  buildChatJsonPrompt,
  buildTranslationModelPrompt,
  coerceTranslationModelConcurrency,
  coerceTranslationModelMaxBlocksPerRequest,
  coerceTranslationModelMaxOutputTokens,
  coerceTranslationRequestMode,
  DEFAULT_TRANSLATION_MODEL_CONCURRENCY,
  DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST,
  DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS,
  DEFAULT_TRANSLATION_REQUEST_MODE,
  getTranslationAdapterLabel,
  parseTranslatedBlockMap,
  resolveTranslationModelMaxOutputTokens,
  resolveTranslationAdapterMode,
  type TranslationAdapterMode,
  type TranslationRequestMode,
} from '../translation/translationAdapters.js';
import { formatYamlScalarReplacement } from '../translation/frontmatterValues.js';
import { hasTargetLanguageSelected, markTargetLanguageSelected } from '../onboardingState.js';
import {
  createEmptyMeta,
  loadTranslationMeta,
  markTranslationMetaCacheActive,
  saveTranslationMeta,
  sha256,
  type TranslationMetaDebug,
} from '../translation/cache.js';
import { TRANSLATION_PROGRESS_MESSAGES, getBatchTranslationProgressMessage } from './progressMessages.js';

const CUSTOM_TARGET_LANGUAGE_LABEL = 'Custom...';
const DEFAULT_MAX_BLOCKS_PER_REQUEST = 24;
const DEFAULT_MAX_CONTEXT_USAGE_RATIO = 0.5;
const TARGET_LANGUAGE_OPTIONS = [
  '简体中文',
  '繁体中文',
  'English',
  '日本語',
  '한국어',
  'Français',
  'Español',
  'Deutsch',
  CUSTOM_TARGET_LANGUAGE_LABEL,
];

const outputChannel = vscode.window.createOutputChannel('MarkLingo');
const MAX_DEBUG_EVENT_MESSAGE_LENGTH = 1000;
const MAX_DEBUG_ERROR_MESSAGE_LENGTH = 4000;
const MAX_DEBUG_ERROR_STACK_LENGTH = 8000;

type TranslationWarning = {
  blockId: string;
  reason: string;
};

export async function seedTargetLanguageSelectionForTest(context: vscode.ExtensionContext): Promise<void> {
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    throw new Error('Target language test state seeding is only available in VS Code test mode.');
  }
  await markTargetLanguageSelected(context);
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
  const pkg = context.extension.packageJSON as { version?: unknown };
  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

function getExtensionModeName(mode: vscode.ExtensionMode): string {
  if (mode === vscode.ExtensionMode.Development) return 'development';
  if (mode === vscode.ExtensionMode.Test) return 'test';
  return 'production';
}

function createDebugInfo(
  context: vscode.ExtensionContext,
  doc: vscode.TextDocument,
  sourceText: string,
  startedAt: string,
): TranslationMetaDebug {
  return {
    schemaVersion: 1,
    runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    startedAt,
    status: 'error',
    extension: {
      id: context.extension.id,
      version: getExtensionVersion(context),
      mode: getExtensionModeName(context.extensionMode),
    },
    environment: {
      appName: vscode.env.appName,
      vscodeVersion: vscode.version,
      uiKind: vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
      remoteName: vscode.env.remoteName,
      workspaceFolderCount: vscode.workspace.workspaceFolders?.length ?? 0,
    },
    document: {
      languageId: doc.languageId,
      lineCount: doc.lineCount,
      sourceBytes: Buffer.byteLength(sourceText, 'utf8'),
      sourceHash: sha256(sourceText),
    },
    warnings: [],
    events: [],
  };
}

function addDebugEvent(debug: TranslationMetaDebug, level: 'info' | 'warning' | 'error', message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${level === 'info' ? '' : `${level[0].toUpperCase()}${level.slice(1)}: `}${message}`);
  if (debug.events.length < 200) {
    debug.events.push({
      timestamp,
      level,
      message: truncateDebugText(message, MAX_DEBUG_EVENT_MESSAGE_LENGTH) ?? '',
    });
  }
}

function truncateDebugText(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function finishDebug(
  debug: TranslationMetaDebug,
  startedAtMs: number,
  status: 'success' | 'error',
  error?: unknown,
): TranslationMetaDebug {
  debug.finishedAt = new Date().toISOString();
  debug.durationMs = Date.now() - startedAtMs;
  debug.status = status;
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    debug.error = {
      message: truncateDebugText(message, MAX_DEBUG_ERROR_MESSAGE_LENGTH) ?? '',
      stack: truncateDebugText(stack, MAX_DEBUG_ERROR_STACK_LENGTH),
    };
  }
  return debug;
}

async function promptCustomTargetLanguage(current: string): Promise<string | null> {
  const input = await vscode.window.showInputBox({
    title: 'MarkLingo: Custom Target Language',
    prompt: 'Enter the target language name, for example Italiano or Portuguese.',
    value: current,
    ignoreFocusOut: true,
  });
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  return trimmed;
}

async function ensureTargetLanguage(context: vscode.ExtensionContext): Promise<string | null> {
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const selected = hasTargetLanguageSelected(context);
  const current = (cfg.get<string>('translation.targetLanguage') ?? '').trim() || '简体中文';
  const currentCustom = (cfg.get<string>('translation.targetLanguageCustom') ?? '').trim();

  if (selected) {
    if (current === CUSTOM_TARGET_LANGUAGE_LABEL) {
      if (currentCustom) return currentCustom;
      const input = await promptCustomTargetLanguage('');
      if (!input) {
        await vscode.window.showInformationMessage('MarkLingo: Translation canceled because a custom target language is required.');
        return null;
      }
      await cfg.update('translation.targetLanguageCustom', input, vscode.ConfigurationTarget.Global);
      return input;
    }
    return current;
  }

  const picked = await new Promise<string | undefined>((resolve) => {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem>();
    picker.title = 'MarkLingo: Select Target Language';
    picker.placeholder = 'Select the target language. Default: Simplified Chinese.';
    picker.ignoreFocusOut = true;
    picker.items = TARGET_LANGUAGE_OPTIONS.map((label) => ({ label }));
    const active = picker.items.find((item) => item.label === current) ?? picker.items[0];
    if (active) picker.activeItems = [active];

    let settled = false;
    const done = (value?: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
      picker.hide();
      picker.dispose();
    };

    picker.onDidAccept(() => done(picker.selectedItems[0]?.label));
    picker.onDidHide(() => done(undefined));
    picker.show();
  });

  if (!picked) {
    await vscode.window.showInformationMessage('MarkLingo: Translation canceled because a target language is required.');
    return null;
  }

  if (picked === CUSTOM_TARGET_LANGUAGE_LABEL) {
    const input = await promptCustomTargetLanguage(currentCustom);
    if (!input) {
      await vscode.window.showInformationMessage('MarkLingo: Translation canceled because a custom target language is required.');
      return null;
    }
    await cfg.update('translation.targetLanguageCustom', input, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.targetLanguage', CUSTOM_TARGET_LANGUAGE_LABEL, vscode.ConfigurationTarget.Global);
    await markTargetLanguageSelected(context);
    return input;
  }

  await cfg.update('translation.targetLanguage', picked, vscode.ConfigurationTarget.Global);
  await markTargetLanguageSelected(context);
  return picked;
}

export type TranslateMode = 'auto' | 'full';

type TranslationRuntime = {
  targetLanguage: string;
  settings: OpenRouterSettings;
  requestMode: TranslationRequestMode;
  adapterMode: TranslationAdapterMode;
  maxBlocksPerRequest: number;
  maxContextUsageRatio: number;
  translationModelMaxBlocksPerRequest: number;
  translationModelConcurrency: number;
  translationModelMaxOutputTokens: number;
  systemPrompt: string;
  customPrompt: string;
};

type TranslationProgress = vscode.Progress<{ message?: string; increment?: number }>;

type TranslateMarkdownOptions = {
  mode?: TranslateMode;
  openOutput?: boolean;
  outputViewColumn?: vscode.ViewColumn;
  progress?: TranslationProgress;
  cancellationToken?: vscode.CancellationToken;
  enforceQuota?: boolean;
};

type TranslateMarkdownResult =
  | {
      status: 'translated';
      sourceUri: vscode.Uri;
      translatedUri: vscode.Uri;
      metaUri: vscode.Uri;
    }
  | {
      status: 'skipped';
      sourceUri: vscode.Uri;
      reason: 'empty' | 'noTranslatable';
      message: string;
    };

type TranslationModelValidationResult = {
  values: Record<string, unknown>;
  restoredTexts: Map<string, string>;
  failedBlocks: Array<{ block: TranslationRequestBlock; reason: string }>;
  maxTokens?: number;
};

function hasMarkdownFileExtension(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function isMarkdownDocument(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' || hasMarkdownFileExtension(doc.uri);
}

function isTranslatedMarkdownOutput(uri: vscode.Uri): boolean {
  return path.parse(uri.fsPath).name.endsWith('_mdt');
}

async function openTranslatedMarkdown(translatedUri: vscode.Uri, viewColumn: vscode.ViewColumn): Promise<void> {
  const translatedDoc = await vscode.workspace.openTextDocument(translatedUri);
  await vscode.window.showTextDocument(translatedDoc, {
    viewColumn,
    preview: false,
  });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', translatedUri);
}

async function enforcePrivateStorageQuotaWithWarning(context: vscode.ExtensionContext): Promise<void> {
  try {
    const quotaSummary = await enforcePrivateStorageQuota(context);
    if (quotaSummary.errors.length > 0) {
      outputChannel.appendLine(
        `[${new Date().toISOString()}] Warning: private cache quota cleanup reported ${quotaSummary.errors.length} issue(s).`,
      );
    }
  } catch (quotaError) {
    const quotaMessage = quotaError instanceof Error ? quotaError.message : String(quotaError);
    outputChannel.appendLine(
      `[${new Date().toISOString()}] Warning: private cache quota cleanup failed: ${quotaMessage}`,
    );
  }
}

function getOutputViewColumnForSource(sourceUri?: vscode.Uri): vscode.ViewColumn {
  const activeEditor = vscode.window.activeTextEditor;
  if (!sourceUri) {
    return activeEditor?.viewColumn ?? vscode.ViewColumn.Active;
  }
  if (activeEditor?.document.uri.toString() === sourceUri.toString()) {
    return activeEditor.viewColumn ?? vscode.ViewColumn.Active;
  }
  return vscode.ViewColumn.One;
}

function throwIfCancellationRequested(token: vscode.CancellationToken | undefined): void {
  if (token?.isCancellationRequested) {
    throw new vscode.CancellationError();
  }
}

function createAbortSignalFromCancellationToken(token: vscode.CancellationToken | undefined): {
  signal?: AbortSignal;
  dispose: () => void;
} {
  if (!token) return { dispose: () => undefined };
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort(new Error('Translation canceled.'));
    return { signal: controller.signal, dispose: () => undefined };
  }

  const subscription = token.onCancellationRequested(() => {
    controller.abort(new Error('Translation canceled.'));
  });
  return {
    signal: controller.signal,
    dispose: () => subscription.dispose(),
  };
}

function isLocalHttpBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function getEffectiveSystemPrompt(adapterMode: TranslationAdapterMode, systemPrompt: string, targetLanguage: string): string {
  if (adapterMode === 'chatJson') return resolveSystemPrompt(systemPrompt, targetLanguage);
  return systemPrompt ? resolveSystemPrompt(systemPrompt, targetLanguage) : '';
}

function buildAdapterPrompt(
  adapterMode: TranslationAdapterMode,
  blocks: TranslationRequestBlock[],
  options: { targetLanguage: string; systemPrompt: string; customPrompt: string },
) {
  if (adapterMode === 'translationModel') {
    return buildTranslationModelPrompt(blocks, options);
  }
  return buildChatJsonPrompt({ blocks }, options);
}

function buildChatCompletionOptions(options: {
  adapterMode: TranslationAdapterMode;
  baseUrl: string;
  signal?: AbortSignal;
  modelContextLength?: number;
  estimatedPromptTokens: number;
  translationModelMaxOutputTokens: number;
}): ChatCompletionOptions {
  if (options.adapterMode === 'translationModel') {
    const maxTokens = resolveTranslationModelMaxOutputTokens({
      configuredMaxOutputTokens: options.translationModelMaxOutputTokens,
      modelContextLength: options.modelContextLength,
      estimatedPromptTokens: options.estimatedPromptTokens,
    });
    const localHttp = isLocalHttpBaseUrl(options.baseUrl);
    return {
      timeoutMs: 120_000,
      temperature: 0.7,
      topP: 0.6,
      topK: localHttp ? 20 : undefined,
      repeatPenalty: localHttp ? 1.05 : undefined,
      maxTokens,
      signal: options.signal,
      responseFormat: { type: 'json_object' },
      reasoning: null,
    };
  }

  return {
    timeoutMs: 120_000,
    temperature: 0,
    signal: options.signal,
    responseFormat: { type: 'json_object' },
    reasoning: { effort: 'none', exclude: true },
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.min(items.length || 1, Math.floor(limit)));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

function isModelOutputError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /JSON|Model output|unexpected response shape|empty content/i.test(message);
}

function shouldSplitTranslationModelChunk(error: unknown): boolean {
  if (isModelOutputError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP (400|413|422)/.test(message);
}

function isCancellationError(error: unknown): boolean {
  return error instanceof vscode.CancellationError;
}

const USE_TRANSLATION_MODEL_MODE_ACTION = 'Use Translation Model';
const USE_CHAT_JSON_MODE_ACTION = 'Use Chat JSON';
const OPEN_SETTINGS_ACTION = 'Open Settings';

function buildTranslationFailureMessage(message: string, runtime?: TranslationRuntime | null): string {
  const currentMode = runtime?.requestMode ? ` Current Translation Mode: ${runtime.requestMode}.` : '';
  return (
    `MarkLingo: Translation failed. ${message}` +
    `${currentMode} If the configured model is a dedicated translation model, use Translation Model. ` +
    'For general chat models, use Chat JSON.'
  );
}

async function showTranslationFailureMessage(message: string, runtime?: TranslationRuntime | null): Promise<void> {
  const actions: string[] = [];
  if (runtime?.requestMode !== 'translationModel') actions.push(USE_TRANSLATION_MODEL_MODE_ACTION);
  if (runtime?.requestMode !== 'chatJson') actions.push(USE_CHAT_JSON_MODE_ACTION);
  actions.push(OPEN_SETTINGS_ACTION);

  const picked = await vscode.window.showErrorMessage(buildTranslationFailureMessage(message, runtime), ...actions);
  const cfg = vscode.workspace.getConfiguration('marklingo');
  if (picked === USE_TRANSLATION_MODEL_MODE_ACTION) {
    await cfg.update('translation.requestMode', 'translationModel', vscode.ConfigurationTarget.Global);
    await vscode.window.showInformationMessage('MarkLingo: Translation Mode set to Translation Model. Run translation again.');
    return;
  }
  if (picked === USE_CHAT_JSON_MODE_ACTION) {
    await cfg.update('translation.requestMode', 'chatJson', vscode.ConfigurationTarget.Global);
    await vscode.window.showInformationMessage('MarkLingo: Translation Mode set to Chat JSON. Run translation again.');
    return;
  }
  if (picked === OPEN_SETTINGS_ACTION) {
    await vscode.commands.executeCommand('marklingo.openSettings');
  }
}

function getDocumentValidationError(doc: vscode.TextDocument, sourceLabel: 'active file' | 'selected file'): string | undefined {
  if (!isMarkdownDocument(doc)) {
    return sourceLabel === 'active file'
      ? 'MarkLingo: The active file is not Markdown.'
      : 'MarkLingo: The selected file is not Markdown.';
  }
  if (doc.isUntitled) {
    return 'MarkLingo: Save the file before translating.';
  }
  if (isTranslatedMarkdownOutput(doc.uri)) {
    return 'MarkLingo: This file already looks like translated output (*_mdt.md). Run translation on the source Markdown file.';
  }
  return undefined;
}

async function resolveMarkdownDocument(sourceUri?: vscode.Uri): Promise<{ doc?: vscode.TextDocument; error?: string }> {
  if (sourceUri) {
    if (sourceUri.scheme !== 'file') {
      return { error: 'MarkLingo: Only local Markdown files can be translated.' };
    }
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(sourceUri);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { error: `MarkLingo: Could not open the selected file. ${msg}` };
    }
    return { doc, error: getDocumentValidationError(doc, 'selected file') };
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { error: 'MarkLingo: No active editor is available.' };
  }
  const doc = editor.document;
  return { doc, error: getDocumentValidationError(doc, 'active file') };
}

async function resolveTranslationRuntime(context: vscode.ExtensionContext): Promise<TranslationRuntime | null> {
  const targetLanguage = await ensureTargetLanguage(context);
  if (!targetLanguage) return null;

  const settings = await getOpenRouterSettings(context);
  const cfg = vscode.workspace.getConfiguration('marklingo');
  const requestMode = coerceTranslationRequestMode(cfg.get<string>('translation.requestMode') ?? DEFAULT_TRANSLATION_REQUEST_MODE);
  const adapterMode = resolveTranslationAdapterMode(requestMode, settings.modelId);
  const maxBlocksPerRequest = Math.max(1, cfg.get<number>('translation.maxBlocksPerRequest') ?? DEFAULT_MAX_BLOCKS_PER_REQUEST);
  const maxContextUsageRatio = clampContextUsageRatio(cfg.get<number>('translation.maxContextUsageRatio') ?? DEFAULT_MAX_CONTEXT_USAGE_RATIO);
  const translationModelMaxBlocksPerRequest = coerceTranslationModelMaxBlocksPerRequest(
    cfg.get<number>('translation.translationModelMaxBlocksPerRequest') ?? DEFAULT_TRANSLATION_MODEL_MAX_BLOCKS_PER_REQUEST,
  );
  const translationModelConcurrency = coerceTranslationModelConcurrency(
    cfg.get<number>('translation.translationModelConcurrency') ?? DEFAULT_TRANSLATION_MODEL_CONCURRENCY,
  );
  const translationModelMaxOutputTokens = coerceTranslationModelMaxOutputTokens(
    cfg.get<number>('translation.translationModelMaxOutputTokens') ?? DEFAULT_TRANSLATION_MODEL_MAX_OUTPUT_TOKENS,
  );
  const systemPrompt = (cfg.get<string>('translation.systemPrompt') ?? '').trim();
  const customPrompt = (cfg.get<string>('translation.customPrompt') ?? '').trim();

  return {
    targetLanguage,
    settings,
    requestMode,
    adapterMode,
    maxBlocksPerRequest,
    maxContextUsageRatio,
    translationModelMaxBlocksPerRequest,
    translationModelConcurrency,
    translationModelMaxOutputTokens,
    systemPrompt,
    customPrompt,
  };
}

async function translateMarkdownDocument(
  context: vscode.ExtensionContext,
  doc: vscode.TextDocument,
  runtime: TranslationRuntime,
  options: TranslateMarkdownOptions = {},
): Promise<TranslateMarkdownResult> {
  const sourceText = doc.getText();
  if (!sourceText.trim()) {
    return {
      status: 'skipped',
      sourceUri: doc.uri,
      reason: 'empty',
      message: 'MarkLingo: The Markdown document is empty.',
    };
  }

  const debugStartedAtMs = Date.now();
  const debugStartedAt = new Date(debugStartedAtMs).toISOString();
  const debug = createDebugInfo(context, doc, sourceText, debugStartedAt);
  let translatedUri: vscode.Uri | undefined;
  let metaUri: vscode.Uri | undefined;

  try {
    const {
      targetLanguage,
      settings,
      requestMode,
      adapterMode,
      maxBlocksPerRequest,
      maxContextUsageRatio,
      translationModelMaxBlocksPerRequest,
      translationModelConcurrency,
      translationModelMaxOutputTokens,
      systemPrompt,
      customPrompt,
    } = runtime;
    const effectiveSystemPrompt = getEffectiveSystemPrompt(adapterMode, systemPrompt, targetLanguage);
    const currentTranslatedUri = getTranslatedFileUri(context, doc.uri, targetLanguage);
    const currentMetaUri = getMetaFileUri(context, doc.uri, targetLanguage);
    translatedUri = currentTranslatedUri;
    metaUri = currentMetaUri;

    debug.settings = {
      baseUrl: settings.baseUrl,
      modelId: settings.modelId,
      targetLanguage,
      outputLocation: getOutputLocation(),
      requestMode,
      adapterMode: getTranslationAdapterLabel(adapterMode),
      maxBlocksPerRequest,
      maxContextUsageRatio,
      translationModelMaxBlocksPerRequest,
      translationModelConcurrency,
      translationModelMaxOutputTokens,
      systemPromptSource: systemPrompt ? 'custom' : (effectiveSystemPrompt ? 'default' : 'none'),
      systemPromptHash: sha256(effectiveSystemPrompt),
      customPromptSet: Boolean(customPrompt),
      customPromptHash: customPrompt ? sha256(customPrompt) : undefined,
      request: adapterMode === 'translationModel'
        ? {
            stream: false,
            temperature: 0.7,
            topP: 0.6,
            topK: isLocalHttpBaseUrl(settings.baseUrl) ? 20 : undefined,
            repeatPenalty: isLocalHttpBaseUrl(settings.baseUrl) ? 1.05 : undefined,
            maxTokens: translationModelMaxOutputTokens > 0 ? translationModelMaxOutputTokens : undefined,
            maxTokensMode: translationModelMaxOutputTokens > 0 ? 'fixed' : 'auto',
            responseFormat: 'json_object',
          }
        : {
            stream: false,
            temperature: 0,
            responseFormat: 'json_object',
            reasoning: {
              effort: 'none',
              exclude: true,
            },
          },
    };

    const segments = segmentMarkdownDocument(doc);
    const translatableBase = segments.filter((s) => s.translatable && s.text.trim());
    if (translatableBase.length === 0) {
      return {
        status: 'skipped',
        sourceUri: doc.uri,
        reason: 'noTranslatable',
        message: 'MarkLingo: No translatable Markdown content was found.',
      };
    }

    const translateWithProgress = async (progress: TranslationProgress) => {
        throwIfCancellationRequested(options.cancellationToken);
        debug.document.totalSegments = segments.length;
        debug.document.translatableBlocks = translatableBase.length;

        const translatable = translatableBase.map((s) => ({ ...s, srcHash: sha256(s.text) }));
        const hashById = new Map(translatable.map((s) => [s.id, s.srcHash]));

        const prevMeta = await loadTranslationMeta(currentMetaUri);
        const nextMetaSegments = translatable.map((s) => ({ type: s.type, srcHash: s.srcHash }));

        const requestedMode: TranslateMode = options.mode ?? 'auto';
        let mode: 'full' | 'incremental' = 'full';
        const isSameTargetLanguage = prevMeta?.targetLanguage === targetLanguage;
        if (requestedMode === 'auto' && prevMeta && prevMeta.segmenterVersion === SEGMENTER_VERSION && isSameTargetLanguage) {
          // Incremental reuse is keyed by block hash, so deleted blocks simply drop out of the
          // rebuilt output and removed translations are pruned on write. No full-retranslate fallback needed.
          mode = 'incremental';
        }

        const translatedByHash = new Map<string, string>();
        const outputByHash = new Map<string, string>();
        if (mode === 'incremental' && prevMeta) {
          for (const [h, t] of Object.entries(prevMeta.translations)) {
            translatedByHash.set(h, t);
            outputByHash.set(h, t);
          }
        }

        const toTranslate = mode === 'full' ? translatable : translatable.filter((s) => !translatedByHash.has(s.srcHash));
        debug.document.blocksToTranslate = toTranslate.length;
        debug.document.cacheHits = translatable.length - toTranslate.length;
        const protectedBlocks: TranslationRequestBlock[] = [];
        const placeholdersById = new Map<string, ReturnType<typeof protectMarkdown>>();
        for (const seg of toTranslate) {
          const protectedResult = protectMarkdown(seg.text, seg.id);
          const modelProtectedResult = adapterMode === 'translationModel'
            ? compactPlaceholderTokens(protectedResult)
            : protectedResult;
          protectedBlocks.push({ id: seg.id, markdown: modelProtectedResult.text });
          placeholdersById.set(seg.id, modelProtectedResult);
        }

        progress.report({ message: TRANSLATION_PROGRESS_MESSAGES.preparing });
        const modelContextLength = await getOpenRouterModelContextLength(settings);
        const translationModelBlockLimit = Math.min(maxBlocksPerRequest, translationModelMaxBlocksPerRequest);
        const buildPrompt = (blocks: TranslationRequestBlock[]) =>
          buildAdapterPrompt(adapterMode, blocks, { targetLanguage, systemPrompt: effectiveSystemPrompt, customPrompt }).estimatePrompt;
        const plan = planTranslationRequests(protectedBlocks, {
          modelContextLength,
          maxContextUsageRatio,
          fallbackMaxBlocksPerRequest: adapterMode === 'translationModel' ? translationModelBlockLimit : maxBlocksPerRequest,
          maxBlocksPerRequest: adapterMode === 'translationModel' ? translationModelBlockLimit : undefined,
          buildPrompt,
        });
        const segById = new Map(toTranslate.map((seg) => [seg.id, seg]));
        const warnings: TranslationWarning[] = [];
        const startedAt = Date.now();
        const translatedValuesById = new Map<string, unknown>();
        const restoredTextsById = new Map<string, string>();
        let actualRequestCount = 0;
        debug.plan = {
          mode,
          requestedMode,
          strategy: plan.strategy,
          modelContextLength,
          contextBudgetTokens: plan.contextBudgetTokens,
          chunkCount: plan.chunks.length,
          chunks: plan.chunks.map((chunk, index) => ({
            index: index + 1,
            blockCount: chunk.blocks.length,
            estimatedPromptTokens: chunk.estimatedPromptTokens,
          })),
        };
        addDebugEvent(
          debug,
          'info',
          `Translating ${doc.uri.fsPath} with ${settings.modelId}: ` +
            `${translatable.length} translatable blocks, ${toTranslate.length} to translate, ` +
            `${plan.chunks.length} planned request(s), mode=${mode}, adapter=${getTranslationAdapterLabel(adapterMode)}, strategy=${plan.strategy}, ` +
            `contextLength=${modelContextLength ?? 'unknown'}, estimatedPromptBudget=${plan.contextBudgetTokens ?? 'n/a'}.`,
        );

        if (plan.chunks.length === 0) {
          progress.report({ message: TRANSLATION_PROGRESS_MESSAGES.cached });
        }

        const requestTranslatedBlocks = async (
          blocks: TranslationRequestBlock[],
          signal?: AbortSignal,
        ): Promise<{ values: Record<string, unknown>; maxTokens?: number }> => {
          const prompt = buildAdapterPrompt(adapterMode, blocks, {
            targetLanguage,
            systemPrompt: effectiveSystemPrompt,
            customPrompt,
          });
          const estimatedPrompt = estimatePromptTokens(prompt.estimatePrompt);
          const requestOptions = buildChatCompletionOptions({
            adapterMode,
            baseUrl: settings.baseUrl,
            signal,
            modelContextLength,
            estimatedPromptTokens: estimatedPrompt,
            translationModelMaxOutputTokens,
          });
          const raw = await openRouterChatCompletion(
            settings,
            prompt.messages,
            requestOptions,
          );
          return {
            values: parseTranslatedBlockMap(raw, blocks),
            maxTokens: requestOptions.maxTokens,
          };
        };

        const validateTranslationModelValues = (
          values: Record<string, unknown>,
          blocks: TranslationRequestBlock[],
        ): TranslationModelValidationResult => {
          const validValues: Record<string, unknown> = {};
          const restoredTexts = new Map<string, string>();
          const failedBlocks: Array<{ block: TranslationRequestBlock; reason: string }> = [];
          for (const block of blocks) {
            if (!Object.hasOwn(values, block.id)) {
              failedBlocks.push({ block, reason: 'missing from model output' });
              continue;
            }
            const seg = segById.get(block.id);
            const protectedResult = seg ? placeholdersById.get(seg.id) : undefined;
            if (!seg || !protectedResult) {
              throw new Error(`Internal error: missing translation block mapping (${block.id}).`);
            }
            const restored = restoreTranslatedBlock(values[block.id], seg.id, seg.text, protectedResult);
            if (!restored.ok) {
              failedBlocks.push({ block, reason: restored.reason });
              continue;
            }
            validValues[block.id] = values[block.id];
            restoredTexts.set(block.id, restored.text);
          }
          return { values: validValues, restoredTexts, failedBlocks };
        };

        const requestChatJsonChunk = async (plannedChunk: typeof plan.chunks[number], chunkIndex: number) => {
          throwIfCancellationRequested(options.cancellationToken);
          progress.report({ message: TRANSLATION_PROGRESS_MESSAGES.translating });
          const requestStartedAt = Date.now();
          const requestDebug = debug.plan?.chunks[chunkIndex];
          const abortSignal = createAbortSignalFromCancellationToken(options.cancellationToken);
          try {
            actualRequestCount += 1;
            const { values, maxTokens } = await requestTranslatedBlocks(plannedChunk.blocks, abortSignal.signal);
            if (requestDebug) requestDebug.maxTokens = maxTokens;
            for (const [blockId, value] of Object.entries(values)) {
              translatedValuesById.set(blockId, value);
            }
          } catch (error) {
            if (requestDebug) {
              requestDebug.durationMs = Date.now() - requestStartedAt;
              requestDebug.status = 'error';
            }
            throw error;
          } finally {
            abortSignal.dispose();
          }
          throwIfCancellationRequested(options.cancellationToken);
          const requestDurationMs = Date.now() - requestStartedAt;
          if (requestDebug) {
            requestDebug.durationMs = requestDurationMs;
            requestDebug.status = 'success';
          }
          addDebugEvent(
            debug,
            'info',
            `Request ${chunkIndex + 1}/${plan.chunks.length} finished in ${requestDurationMs}ms ` +
              `(${plannedChunk.blocks.length} blocks, ~${plannedChunk.estimatedPromptTokens} estimated prompt tokens).`,
          );
        };

        const requestTranslationModelBlocks = async (
          blocks: TranslationRequestBlock[],
          label: string,
        ): Promise<TranslationModelValidationResult> => {
          throwIfCancellationRequested(options.cancellationToken);
          progress.report({ message: TRANSLATION_PROGRESS_MESSAGES.translating });
          const requestIndex = ++actualRequestCount;
          const requestStartedAt = Date.now();
          const abortSignal = createAbortSignalFromCancellationToken(options.cancellationToken);
          try {
            const { values, maxTokens } = await requestTranslatedBlocks(blocks, abortSignal.signal);
            const validated = validateTranslationModelValues(values, blocks);
            const requestDurationMs = Date.now() - requestStartedAt;
            addDebugEvent(
              debug,
              'info',
              `Request ${requestIndex} finished in ${requestDurationMs}ms (${label}, ${blocks.length} blocks, maxTokens=${maxTokens ?? 'default'}).`,
            );
            validated.maxTokens = maxTokens;
            if (validated.failedBlocks.length === 0) return validated;

            const failedBlockSummary = validated.failedBlocks
              .slice(0, 3)
              .map((item) => `${item.block.id}: ${item.reason}`)
              .join('; ');
            if (blocks.length > 1) {
              addDebugEvent(
                debug,
                'warning',
                `Request ${requestIndex} kept ${validated.restoredTexts.size} valid block(s) and will retry ` +
                  `${validated.failedBlocks.length} failed block(s): ${failedBlockSummary}`,
              );
              const retry = await requestTranslationModelBlocks(
                validated.failedBlocks.map((item) => item.block),
                `${label}.retry`,
              );
              return {
                values: { ...validated.values, ...retry.values },
                restoredTexts: new Map([...validated.restoredTexts, ...retry.restoredTexts]),
                failedBlocks: retry.failedBlocks,
                maxTokens,
              };
            }

            addDebugEvent(
              debug,
              'warning',
              `Request ${requestIndex} returned invalid model output for ${blocks[0].id}; keeping the source block. ${failedBlockSummary}`,
            );
            return validated;
          } catch (error) {
            const requestDurationMs = Date.now() - requestStartedAt;
            if (blocks.length > 1 && shouldSplitTranslationModelChunk(error)) {
              addDebugEvent(
                debug,
                'warning',
                `Request ${requestIndex} could not be parsed after ${requestDurationMs}ms; splitting ${blocks.length} blocks.`,
              );
              const midpoint = Math.ceil(blocks.length / 2);
              const left = await requestTranslationModelBlocks(blocks.slice(0, midpoint), `${label}.1`);
              const right = await requestTranslationModelBlocks(blocks.slice(midpoint), `${label}.2`);
              return {
                values: { ...left.values, ...right.values },
                restoredTexts: new Map([...left.restoredTexts, ...right.restoredTexts]),
                failedBlocks: [...left.failedBlocks, ...right.failedBlocks],
                maxTokens: left.maxTokens ?? right.maxTokens,
              };
            }
            if (blocks.length === 1 && isModelOutputError(error)) {
              addDebugEvent(
                debug,
                'warning',
                `Request ${requestIndex} returned invalid model output for ${blocks[0].id}; keeping the source block.`,
              );
              return {
                values: {},
                restoredTexts: new Map(),
                failedBlocks: [{ block: blocks[0], reason: error instanceof Error ? error.message : String(error) }],
              };
            }
            throw error;
          } finally {
            abortSignal.dispose();
          }
        };

        if (adapterMode === 'translationModel') {
          await mapWithConcurrency(plan.chunks, translationModelConcurrency, async (plannedChunk, chunkIndex) => {
            const requestDebug = debug.plan?.chunks[chunkIndex];
            const chunkStartedAt = Date.now();
            try {
              const validated = await requestTranslationModelBlocks(plannedChunk.blocks, `chunk ${chunkIndex + 1}/${plan.chunks.length}`);
              for (const [blockId, value] of Object.entries(validated.values)) {
                translatedValuesById.set(blockId, value);
              }
              for (const [blockId, text] of validated.restoredTexts) {
                restoredTextsById.set(blockId, text);
              }
              if (requestDebug) requestDebug.maxTokens = validated.maxTokens;
              if (requestDebug) {
                requestDebug.durationMs = Date.now() - chunkStartedAt;
                requestDebug.status = 'success';
              }
            } catch (error) {
              if (requestDebug) {
                requestDebug.durationMs = Date.now() - chunkStartedAt;
                requestDebug.status = 'error';
              }
              throw error;
            }
          });
        } else {
          for (const [chunkIndex, plannedChunk] of plan.chunks.entries()) {
            await requestChatJsonChunk(plannedChunk, chunkIndex);
          }
        }
        if (debug.plan) debug.plan.actualRequestCount = actualRequestCount;

        for (const plannedChunk of plan.chunks) {
          for (const block of plannedChunk.blocks) {
            const seg = segById.get(block.id);
            if (!seg) {
              throw new Error(`Internal error: missing translation block mapping (${block.id}).`);
            }
            const protectedResult = placeholdersById.get(seg.id);
            if (!protectedResult) {
              throw new Error(`Internal error: missing placeholder mapping (${seg.id}).`);
            }
            const restoredText = restoredTextsById.get(seg.id);
            if (restoredText !== undefined) {
              translatedByHash.set(seg.srcHash, restoredText);
              outputByHash.set(seg.srcHash, restoredText);
              continue;
            }
            const result = restoreTranslatedBlock(translatedValuesById.get(seg.id), seg.id, seg.text, protectedResult);
            if (!result.ok) {
              warnings.push({ blockId: seg.id, reason: result.reason });
              addDebugEvent(debug, 'warning', `Block ${seg.id} kept as source: ${result.reason}`);
            }
            if (result.ok) {
              translatedByHash.set(seg.srcHash, result.text);
              outputByHash.set(seg.srcHash, result.text);
            } else if (!outputByHash.has(seg.srcHash)) {
              outputByHash.set(seg.srcHash, result.fallbackText);
            }
          }
        }
        addDebugEvent(debug, 'info', `Translation finished in ${Date.now() - startedAt}ms.`);
        if (warnings.length > 0) {
          addDebugEvent(
            debug,
            'warning',
            `Translation completed with ${warnings.length} block warning(s): ${warnings.map((warning) => warning.blockId).join(', ')}`,
          );
        }
        debug.warnings = warnings;
        progress.report({ message: TRANSLATION_PROGRESS_MESSAGES.writing });

        const parts: string[] = [];
        let cursor = 0;
        for (const seg of segments) {
          parts.push(sourceText.slice(cursor, seg.startOffset));
          const h = seg.translatable ? hashById.get(seg.id) : undefined;
          const translatedText = seg.translatable && h ? outputByHash.get(h) ?? seg.text : seg.text;
          const replacement =
            seg.type === 'yamlValue' && h && translatedByHash.has(h)
              ? formatYamlScalarReplacement(translatedText, seg.yamlQuote ?? 'plain')
              : translatedText;
          parts.push(replacement);
          cursor = seg.endOffset;
        }
        parts.push(sourceText.slice(cursor));
        const out = parts.join('');

        const meta = createEmptyMeta(doc.uri);
        meta.targetLanguage = targetLanguage;
        meta.updatedAt = new Date().toISOString();
        meta.outputUri = currentTranslatedUri.toString();
        meta.outputHash = sha256(out);
        meta.segments = nextMetaSegments;
        const nextTranslations: Record<string, string> = {};
        for (const seg of translatable) {
          const t = translatedByHash.get(seg.srcHash);
          if (typeof t === 'string') nextTranslations[seg.srcHash] = t;
        }
        meta.translations = nextTranslations;
        debug.result = {
          outputHash: meta.outputHash,
          translatedBlocks: Math.max(0, toTranslate.length - warnings.length),
          reusedBlocks: translatable.length - toTranslate.length,
          fallbackBlocks: warnings.length,
          warningCount: warnings.length,
        };
        meta.debug = finishDebug(debug, debugStartedAtMs, 'success');
        markTranslationMetaCacheActive(meta, meta.updatedAt);

        return { markdown: out, meta };
      };

    const { markdown: translatedMarkdown, meta: nextMeta } = options.progress
      ? await translateWithProgress(options.progress)
      : await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'MarkLingo: Translating Markdown',
          cancellable: false,
        },
        translateWithProgress,
      );

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(currentTranslatedUri.fsPath)));
    await Promise.all([
      vscode.workspace.fs.writeFile(currentTranslatedUri, Buffer.from(translatedMarkdown, 'utf8')),
      saveTranslationMeta(currentMetaUri, nextMeta),
    ]);
    if (options.enforceQuota !== false) {
      await enforcePrivateStorageQuotaWithWarning(context);
    }

    if (options.openOutput !== false) {
      await openTranslatedMarkdown(currentTranslatedUri, options.outputViewColumn ?? vscode.ViewColumn.Active);
    }
    return {
      status: 'translated',
      sourceUri: doc.uri,
      translatedUri: currentTranslatedUri,
      metaUri: currentMetaUri,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addDebugEvent(debug, 'error', msg);
    try {
      if (metaUri && translatedUri) {
        const meta = await loadTranslationMeta(metaUri) ?? createEmptyMeta(doc.uri);
        meta.updatedAt = new Date().toISOString();
        meta.outputUri = translatedUri.toString();
        meta.debug = finishDebug(debug, debugStartedAtMs, 'error', err);
        await saveTranslationMeta(metaUri, meta);
      }
    } catch (metaError) {
      const metaMessage = metaError instanceof Error ? metaError.message : String(metaError);
      outputChannel.appendLine(`[${new Date().toISOString()}] Error: failed to write translation debug metadata: ${metaMessage}`);
    }
    throw err;
  }
}

type TranslateCurrentMarkdownOptions = {
  mode?: TranslateMode;
};

export async function translateCurrentMarkdown(
  context: vscode.ExtensionContext,
  sourceUri?: vscode.Uri,
  options: TranslateCurrentMarkdownOptions = {},
  selectedResources?: vscode.Uri[],
): Promise<TranslateMarkdownResult | undefined> {
  const commandResources = getCommandResources(sourceUri, selectedResources);
  if (commandResources.length > 1) {
    await translateMarkdownResources(context, commandResources, { mode: options.mode });
    return undefined;
  }

  const { doc, error } = await resolveMarkdownDocument(sourceUri);
  if (error || !doc) {
    await vscode.window.showErrorMessage(error ?? 'MarkLingo: No Markdown file is available.');
    return undefined;
  }

  let runtime: TranslationRuntime | null = null;
  try {
    runtime = await resolveTranslationRuntime(context);
    if (!runtime) return undefined;
    const result = await translateMarkdownDocument(context, doc, runtime, {
      mode: options.mode,
      outputViewColumn: getOutputViewColumnForSource(sourceUri),
    });
    if (result.status === 'skipped') {
      await vscode.window.showInformationMessage(result.message);
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await showTranslationFailureMessage(msg, runtime);
    return undefined;
  }
}

export async function translateExplorerMarkdownFile(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
): Promise<TranslateMarkdownResult | undefined> {
  if (!resource) {
    await vscode.window.showErrorMessage('MarkLingo: Right-click a Markdown file in the Explorer to translate it.');
    return undefined;
  }

  return translateCurrentMarkdown(context, resource);
}

const TRANSLATE_FOLDER_CONFIRM_ACTION = 'Translate';
const SKIPPED_FOLDER_NAMES = new Set(['.git', 'node_modules']);

type TranslateMarkdownResourcesOptions = {
  mode?: TranslateMode;
  sourceLabel?: string;
};

type MarkdownSourceScanResult = {
  files: vscode.Uri[];
  skippedSymbolicLinks: number;
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getCommandResources(resource?: vscode.Uri, selectedResources?: vscode.Uri[]): vscode.Uri[] {
  const resources = selectedResources?.length ? [...selectedResources] : [];
  if (resource && !resources.some((item) => item.toString() === resource.toString())) {
    resources.unshift(resource);
  }
  return resources;
}

function shouldSkipFolderEntry(name: string, type: vscode.FileType): boolean {
  return SKIPPED_FOLDER_NAMES.has(name) || (type & vscode.FileType.SymbolicLink) !== 0;
}

async function collectMarkdownSourceFiles(resources: vscode.Uri[]): Promise<MarkdownSourceScanResult> {
  const filesByUri = new Map<string, vscode.Uri>();
  let skippedSymbolicLinks = 0;

  const addMarkdownSourceFile = (uri: vscode.Uri) => {
    if (!hasMarkdownFileExtension(uri) || isTranslatedMarkdownOutput(uri)) return;
    filesByUri.set(uri.toString(), uri);
  };

  const visitDirectory = async (dirUri: vscode.Uri) => {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped unreadable directory ${dirUri.fsPath}: ${msg}`);
      return;
    }
    entries.sort(([a], [b]) => a.localeCompare(b));

    for (const [name, type] of entries) {
      if (shouldSkipFolderEntry(name, type)) {
        if ((type & vscode.FileType.SymbolicLink) !== 0) skippedSymbolicLinks += 1;
        continue;
      }

      const childUri = vscode.Uri.joinPath(dirUri, name);
      if ((type & vscode.FileType.Directory) !== 0) {
        await visitDirectory(childUri);
        continue;
      }
      if ((type & vscode.FileType.File) !== 0) {
        addMarkdownSourceFile(childUri);
      }
    }
  };

  for (const resource of resources) {
    if (resource.scheme !== 'file') {
      outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped non-file resource ${resource.toString()}.`);
      continue;
    }

    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(resource);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped unreadable resource ${resource.fsPath}: ${msg}`);
      continue;
    }

    if ((stat.type & vscode.FileType.SymbolicLink) !== 0) {
      skippedSymbolicLinks += 1;
      outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped symbolic link ${resource.fsPath}.`);
      continue;
    }
    if ((stat.type & vscode.FileType.Directory) !== 0) {
      await visitDirectory(resource);
      continue;
    }
    if ((stat.type & vscode.FileType.File) !== 0) {
      addMarkdownSourceFile(resource);
    }
  }

  return { files: [...filesByUri.values()], skippedSymbolicLinks };
}

function buildBatchConfirmationMessage(files: vscode.Uri[], sourceLabel?: string): string {
  if (sourceLabel) {
    return `MarkLingo: Translate ${pluralize(files.length, 'Markdown file')} in ${sourceLabel} and subfolders?`;
  }
  return `MarkLingo: Translate ${pluralize(files.length, 'Markdown file')} from the selected Explorer items?`;
}

async function translateMarkdownFilesBatch(
  context: vscode.ExtensionContext,
  markdownFiles: vscode.Uri[],
  options: TranslateMarkdownResourcesOptions,
): Promise<void> {
  const confirmed = await vscode.window.showWarningMessage(
    buildBatchConfirmationMessage(markdownFiles, options.sourceLabel),
    { modal: true },
    TRANSLATE_FOLDER_CONFIRM_ACTION,
  );
  if (confirmed !== TRANSLATE_FOLDER_CONFIRM_ACTION) {
    await vscode.window.showInformationMessage('MarkLingo: Batch translation canceled.');
    return;
  }

  let runtime: TranslationRuntime | null;
  try {
    runtime = await resolveTranslationRuntime(context);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await showTranslationFailureMessage(msg);
    return;
  }
  if (!runtime) return;

  const summary = {
    translated: 0,
    skipped: 0,
    failed: [] as Array<{ uri: vscode.Uri; message: string }>,
    canceled: false,
  };
  const outputViewColumn = vscode.ViewColumn.One;
  let openedFirstOutput = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'MarkLingo: Translating Markdown Files',
      cancellable: true,
    },
    async (progress, token) => {
      for (const [index, uri] of markdownFiles.entries()) {
        if (token.isCancellationRequested) {
          summary.canceled = true;
          break;
        }

        const fileLabel = getBatchTranslationProgressMessage(index, markdownFiles.length);
        progress.report({ message: fileLabel });

        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const validationError = getDocumentValidationError(doc, 'selected file');
          if (validationError) {
            summary.skipped += 1;
            outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped ${uri.fsPath}: ${validationError}`);
            continue;
          }

          const fileProgress: TranslationProgress = {
            report: () => progress.report({ message: fileLabel }),
          };
          const result = await translateMarkdownDocument(context, doc, runtime!, {
            mode: options.mode ?? 'auto',
            openOutput: !openedFirstOutput,
            outputViewColumn,
            progress: fileProgress,
            cancellationToken: token,
            enforceQuota: false,
          });
          if (result.status === 'translated') {
            summary.translated += 1;
            openedFirstOutput = true;
          } else {
            summary.skipped += 1;
            outputChannel.appendLine(`[${new Date().toISOString()}] Warning: skipped ${uri.fsPath}: ${result.message}`);
          }
        } catch (error) {
          if (token.isCancellationRequested || isCancellationError(error)) {
            summary.canceled = true;
            break;
          }
          const msg = error instanceof Error ? error.message : String(error);
          summary.failed.push({ uri, message: msg });
          outputChannel.appendLine(`[${new Date().toISOString()}] Error: batch translation failed for ${uri.fsPath}: ${msg}`);
        } finally {
          progress.report({ increment: 100 / markdownFiles.length });
        }
      }
    },
  );

  if (summary.translated > 0) {
    await enforcePrivateStorageQuotaWithWarning(context);
  }

  const summaryText = [
    pluralize(summary.translated, 'file'),
    summary.skipped > 0 ? `${pluralize(summary.skipped, 'file')} skipped` : undefined,
    summary.failed.length > 0 ? `${pluralize(summary.failed.length, 'file')} failed` : undefined,
  ].filter(Boolean).join(', ');

  if (summary.failed.length > 0) {
    await vscode.window.showErrorMessage(
      `MarkLingo: Batch translation ${summary.canceled ? 'canceled' : 'completed'}: ${summaryText}. ` +
        'See the MarkLingo output for details. If failures mention JSON or incomplete model output, check Translation Mode.',
    );
    return;
  }

  await vscode.window.showInformationMessage(`MarkLingo: Batch translation ${summary.canceled ? 'canceled' : 'completed'}: ${summaryText}.`);
}

async function translateMarkdownResources(
  context: vscode.ExtensionContext,
  resources: vscode.Uri[],
  options: TranslateMarkdownResourcesOptions = {},
): Promise<void> {
  let collected: MarkdownSourceScanResult;
  try {
    collected = await collectMarkdownSourceFiles(resources);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`MarkLingo: Could not scan the selected resources. ${msg}`);
    return;
  }

  if (collected.files.length === 0) {
    if (collected.skippedSymbolicLinks > 0) {
      await vscode.window.showInformationMessage(
        `MarkLingo: No source Markdown files were found. ${pluralize(collected.skippedSymbolicLinks, 'symbolic link')} skipped.`,
      );
      return;
    }
    await vscode.window.showInformationMessage('MarkLingo: No source Markdown files were found in the selected resources.');
    return;
  }

  await translateMarkdownFilesBatch(context, collected.files, options);
}

export async function translateSelectedMarkdownResources(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
  selectedResources?: vscode.Uri[],
): Promise<void> {
  const resources = getCommandResources(resource, selectedResources);
  if (resources.length === 0) {
    await vscode.window.showErrorMessage('MarkLingo: Right-click Markdown files or folders in the Explorer to translate them.');
    return;
  }

  await translateMarkdownResources(context, resources);
}

export async function translateFolderMarkdown(
  context: vscode.ExtensionContext,
  resource?: vscode.Uri,
  selectedResources?: vscode.Uri[],
): Promise<void> {
  const resources = getCommandResources(resource, selectedResources);
  if (resources.length === 0) {
    await vscode.window.showErrorMessage('MarkLingo: Right-click a folder in the Explorer to translate Markdown files.');
    return;
  }

  const sourceLabel = resources.length === 1 ? path.basename(resources[0].fsPath) || resources[0].fsPath : undefined;
  await translateMarkdownResources(context, resources, { sourceLabel });
}
