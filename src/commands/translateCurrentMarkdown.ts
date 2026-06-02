import * as vscode from 'vscode';
import * as path from 'node:path';
import { getOpenRouterModelContextLength, getOpenRouterSettings, openRouterChatCompletion } from '../services/openRouterClient.js';
import { enforcePrivateStorageQuota } from '../storage/privateStorage.js';
import { getMetaFileUri, getOutputLocation, getTranslatedFileUri } from '../storage/paths.js';
import { restoreTranslatedBlock } from '../translation/blockResults.js';
import { protectMarkdown } from '../translation/placeholders.js';
import { DEFAULT_SYSTEM_PROMPT, resolveSystemPrompt } from '../translation/prompts.js';
import { clampContextUsageRatio, planTranslationRequests, type TranslationRequestBlock } from '../translation/requestPlanner.js';
import { SEGMENTER_VERSION, segmentMarkdownDocument } from '../translation/segmenter.js';
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

function buildBlocksTranslatePrompt(
  input: { blocks: Array<{ id: string; markdown: string }> },
  options: { systemPrompt?: string; customPrompt?: string; targetLanguage: string },
): { system: string; user: string } {
  const baseSystem = resolveSystemPrompt(options.systemPrompt, options.targetLanguage);
  const customPrompt = (options.customPrompt ?? '').trim();
  const system = customPrompt ? [baseSystem, '', 'Additional custom prompt:', customPrompt].join('\n') : baseSystem;

  const user = ['Translate these Markdown blocks:', '---', JSON.stringify(input)].join('\n');
  return { system, user };
}

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

function tryParseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sub = text.slice(start, end + 1);
      return JSON.parse(sub);
    }
    throw new Error('Model output is not valid JSON.');
  }
}

export type TranslateMode = 'auto' | 'full';

function hasMarkdownFileExtension(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function isMarkdownDocument(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' || hasMarkdownFileExtension(doc.uri);
}

async function openTranslatedMarkdown(translatedUri: vscode.Uri): Promise<void> {
  const translatedDoc = await vscode.workspace.openTextDocument(translatedUri);
  await vscode.window.showTextDocument(translatedDoc, {
    viewColumn: vscode.ViewColumn.Active,
    preview: false,
  });
  await vscode.commands.executeCommand('markdown.showPreviewToSide', translatedUri);
}

export async function translateCurrentMarkdown(context: vscode.ExtensionContext, options: { mode?: TranslateMode } = {}) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showErrorMessage('MarkLingo: No active editor is available.');
    return;
  }

  const doc = editor.document;
  if (!isMarkdownDocument(doc)) {
    await vscode.window.showErrorMessage('MarkLingo: The active file is not Markdown.');
    return;
  }
  if (doc.isUntitled) {
    await vscode.window.showErrorMessage('MarkLingo: Save the file before translating.');
    return;
  }

  const parsed = path.parse(doc.uri.fsPath);
  if (parsed.name.endsWith('_mdt')) {
    await vscode.window.showErrorMessage('MarkLingo: This file already looks like translated output (*_mdt.md). Run translation on the source Markdown file.');
    return;
  }

  const sourceText = doc.getText();
  if (!sourceText.trim()) {
    await vscode.window.showInformationMessage('MarkLingo: The active document is empty.');
    return;
  }

  const debugStartedAtMs = Date.now();
  const debugStartedAt = new Date(debugStartedAtMs).toISOString();
  const debug = createDebugInfo(context, doc, sourceText, debugStartedAt);
  let translatedUri: vscode.Uri | undefined;
  let metaUri: vscode.Uri | undefined;

  try {
    const targetLanguage = await ensureTargetLanguage(context);
    if (!targetLanguage) return;
    const currentTranslatedUri = getTranslatedFileUri(context, doc.uri, targetLanguage);
    const currentMetaUri = getMetaFileUri(context, doc.uri, targetLanguage);
    translatedUri = currentTranslatedUri;
    metaUri = currentMetaUri;

    const settings = await getOpenRouterSettings(context);
    const cfg = vscode.workspace.getConfiguration('marklingo');
    const maxBlocksPerRequest = Math.max(1, cfg.get<number>('translation.maxBlocksPerRequest') ?? DEFAULT_MAX_BLOCKS_PER_REQUEST);
    const maxContextUsageRatio = clampContextUsageRatio(cfg.get<number>('translation.maxContextUsageRatio') ?? DEFAULT_MAX_CONTEXT_USAGE_RATIO);
    const systemPrompt = (cfg.get<string>('translation.systemPrompt') ?? '').trim();
    const customPrompt = (cfg.get<string>('translation.customPrompt') ?? '').trim();
    debug.settings = {
      baseUrl: settings.baseUrl,
      modelId: settings.modelId,
      targetLanguage,
      outputLocation: getOutputLocation(),
      maxBlocksPerRequest,
      maxContextUsageRatio,
      systemPromptSource: systemPrompt ? 'custom' : 'default',
      systemPromptHash: sha256(systemPrompt || DEFAULT_SYSTEM_PROMPT),
      customPromptSet: Boolean(customPrompt),
      customPromptHash: customPrompt ? sha256(customPrompt) : undefined,
      request: {
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
      await vscode.window.showInformationMessage('MarkLingo: No translatable Markdown content was found.');
      return;
    }

    const { markdown: translatedMarkdown, meta: nextMeta } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MarkLingo: Translating Markdown',
        cancellable: false,
      },
      async (progress) => {
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
          protectedBlocks.push({ id: seg.id, markdown: protectedResult.text });
          placeholdersById.set(seg.id, protectedResult);
        }

        progress.report({ message: 'Preparing translation' });
        const modelContextLength = await getOpenRouterModelContextLength(settings);
        const buildPrompt = (blocks: TranslationRequestBlock[]) => buildBlocksTranslatePrompt({ blocks }, { systemPrompt, customPrompt, targetLanguage });
        const plan = planTranslationRequests(protectedBlocks, {
          modelContextLength,
          maxContextUsageRatio,
          fallbackMaxBlocksPerRequest: maxBlocksPerRequest,
          buildPrompt,
        });
        const segById = new Map(toTranslate.map((seg) => [seg.id, seg]));
        const warnings: TranslationWarning[] = [];
        const startedAt = Date.now();
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
            `${plan.chunks.length} request(s), mode=${mode}, strategy=${plan.strategy}, ` +
            `contextLength=${modelContextLength ?? 'unknown'}, estimatedPromptBudget=${plan.contextBudgetTokens ?? 'n/a'}.`,
        );

        if (plan.chunks.length === 0) {
          progress.report({ message: 'Using cached translations' });
        }

        for (const [chunkIndex, plannedChunk] of plan.chunks.entries()) {
          progress.report({
            message: `Processing batch ${chunkIndex + 1} of ${plan.chunks.length} · ${plannedChunk.blocks.length} blocks`,
          });
          const prompt = buildPrompt(plannedChunk.blocks);
          const requestStartedAt = Date.now();
          const requestDebug = debug.plan?.chunks[chunkIndex];
          let raw: string;
          try {
            raw = await openRouterChatCompletion(
              settings,
              [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
              ],
              {
                timeoutMs: 120_000,
                temperature: 0,
                responseFormat: { type: 'json_object' },
                reasoning: { effort: 'none', exclude: true },
              },
            );
          } catch (error) {
            if (requestDebug) {
              requestDebug.durationMs = Date.now() - requestStartedAt;
              requestDebug.status = 'error';
            }
            throw error;
          }
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

          const obj = tryParseJsonObject(raw);
          for (const block of plannedChunk.blocks) {
            const seg = segById.get(block.id);
            if (!seg) {
              throw new Error(`Internal error: missing translation block mapping (${block.id}).`);
            }
            const protectedResult = placeholdersById.get(seg.id);
            if (!protectedResult) {
              throw new Error(`Internal error: missing placeholder mapping (${seg.id}).`);
            }
            const result = restoreTranslatedBlock(obj?.[seg.id], seg.id, seg.text, protectedResult);
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
        progress.report({ message: 'Writing translated file' });

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
      },
    );

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(currentTranslatedUri.fsPath)));
    await Promise.all([
      vscode.workspace.fs.writeFile(currentTranslatedUri, Buffer.from(translatedMarkdown, 'utf8')),
      saveTranslationMeta(currentMetaUri, nextMeta),
    ]);
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

    await openTranslatedMarkdown(currentTranslatedUri);
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
    await vscode.window.showErrorMessage(`MarkLingo: Translation failed. ${msg}`);
  }
}
