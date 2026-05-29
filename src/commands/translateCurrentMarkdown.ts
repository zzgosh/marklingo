import * as vscode from 'vscode';
import * as path from 'node:path';
import { getOpenRouterModelContextLength, getOpenRouterSettings, openRouterChatCompletion } from '../services/openRouterClient.js';
import { getMetaFileUri, getTranslatedFileUri } from '../storage/paths.js';
import { restoreTranslatedBlock } from '../translation/blockResults.js';
import { protectMarkdown } from '../translation/placeholders.js';
import { resolveSystemPrompt } from '../translation/prompts.js';
import { clampContextUsageRatio, planTranslationRequests, type TranslationRequestBlock } from '../translation/requestPlanner.js';
import { SEGMENTER_VERSION, segmentMarkdownDocument } from '../translation/segmenter.js';
import { createEmptyMeta, detectDeletion, loadTranslationMeta, saveTranslationMeta, sha256 } from '../translation/cache.js';

function buildBlocksTranslatePrompt(
  input: { blocks: Array<{ id: string; markdown: string }> },
  options: { systemPrompt?: string; customPrompt?: string; targetLanguage: string },
): { system: string; user: string } {
  const baseSystem = resolveSystemPrompt(options.systemPrompt, options.targetLanguage);
  const customPrompt = (options.customPrompt ?? '').trim();
  const system = customPrompt ? [baseSystem, '', '用户附加 custom prompt：', customPrompt].join('\n') : baseSystem;

  const user = ['请翻译下面这些 Markdown blocks：', '---', JSON.stringify(input)].join('\n');
  return { system, user };
}

const TARGET_LANGUAGE_SELECTED_KEY = 'markdownTranslator.translation.targetLanguageSelected';
const CUSTOM_TARGET_LANGUAGE_LABEL = '自定义...';
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

const outputChannel = vscode.window.createOutputChannel('Markdown Translator');

type TranslationWarning = {
  blockId: string;
  reason: string;
};

async function promptCustomTargetLanguage(current: string): Promise<string | null> {
  const input = await vscode.window.showInputBox({
    title: 'Markdown Translator: 自定义目标翻译语言',
    prompt: '请输入目标语言名称（例如 Italiano、Português）',
    value: current,
    ignoreFocusOut: true,
  });
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  return trimmed;
}

async function ensureTargetLanguage(context: vscode.ExtensionContext): Promise<string | null> {
  const cfg = vscode.workspace.getConfiguration('markdownTranslator');
  const selected = context.globalState.get<boolean>(TARGET_LANGUAGE_SELECTED_KEY) ?? false;
  const current = (cfg.get<string>('translation.targetLanguage') ?? '').trim() || '简体中文';
  const currentCustom = (cfg.get<string>('translation.targetLanguageCustom') ?? '').trim();

  if (selected) {
    if (current === CUSTOM_TARGET_LANGUAGE_LABEL) {
      if (currentCustom) return currentCustom;
      const input = await promptCustomTargetLanguage('');
      if (!input) {
        await vscode.window.showInformationMessage('Markdown Translator: 已取消翻译（需要设置自定义目标语言）。');
        return null;
      }
      await cfg.update('translation.targetLanguageCustom', input, vscode.ConfigurationTarget.Global);
      return input;
    }
    return current;
  }

  const picked = await new Promise<string | undefined>((resolve) => {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem>();
    picker.title = 'Markdown Translator: 选择目标翻译语言';
    picker.placeholder = '选择翻译后的目标语言（默认：简体中文）';
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
    await vscode.window.showInformationMessage('Markdown Translator: 已取消翻译（需要先选择目标语言）。');
    return null;
  }

  if (picked === CUSTOM_TARGET_LANGUAGE_LABEL) {
    const input = await promptCustomTargetLanguage(currentCustom);
    if (!input) {
      await vscode.window.showInformationMessage('Markdown Translator: 已取消翻译（需要设置自定义目标语言）。');
      return null;
    }
    await cfg.update('translation.targetLanguageCustom', input, vscode.ConfigurationTarget.Global);
    await cfg.update('translation.targetLanguage', CUSTOM_TARGET_LANGUAGE_LABEL, vscode.ConfigurationTarget.Global);
    await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
    return input;
  }

  await cfg.update('translation.targetLanguage', picked, vscode.ConfigurationTarget.Global);
  await context.globalState.update(TARGET_LANGUAGE_SELECTED_KEY, true);
  return picked;
}

function tryParseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // 兜底：截取第一个 { 到最后一个 } 再 parse
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sub = text.slice(start, end + 1);
      return JSON.parse(sub);
    }
    throw new Error('模型输出不是合法 JSON。');
  }
}

export type TranslateMode = 'auto' | 'full';

export async function translateCurrentMarkdown(context: vscode.ExtensionContext, options: { mode?: TranslateMode } = {}) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.window.showErrorMessage('Markdown Translator: 没有可用的编辑器。');
    return;
  }

  const doc = editor.document;
  if (doc.languageId !== 'markdown') {
    await vscode.window.showErrorMessage('Markdown Translator: 当前文件不是 Markdown。');
    return;
  }
  if (doc.isUntitled) {
    await vscode.window.showErrorMessage('Markdown Translator: 请先保存文件再翻译。');
    return;
  }

  const parsed = path.parse(doc.uri.fsPath);
  if (parsed.name.endsWith('_mdt')) {
    await vscode.window.showErrorMessage('Markdown Translator: 当前文件看起来已经是译文（*_mdt.md），请在原始 Markdown 上执行翻译。');
    return;
  }

  const sourceText = doc.getText();
  if (!sourceText.trim()) {
    await vscode.window.showInformationMessage('Markdown Translator: 当前文档为空，无需翻译。');
    return;
  }

  try {
    const targetLanguage = await ensureTargetLanguage(context);
    if (!targetLanguage) return;

    const settings = await getOpenRouterSettings(context);
    const cfg = vscode.workspace.getConfiguration('markdownTranslator');
    const maxBlocksPerRequest = Math.max(1, cfg.get<number>('translation.maxBlocksPerRequest') ?? DEFAULT_MAX_BLOCKS_PER_REQUEST);
    const maxContextUsageRatio = clampContextUsageRatio(cfg.get<number>('translation.maxContextUsageRatio') ?? DEFAULT_MAX_CONTEXT_USAGE_RATIO);
    const systemPrompt = (cfg.get<string>('translation.systemPrompt') ?? '').trim();
    const customPrompt = (cfg.get<string>('translation.customPrompt') ?? '').trim();
    const deletionFallback = cfg.get<boolean>('translation.deletionFallback') ?? true;
    const similarityThreshold = cfg.get<number>('translation.similarityThreshold') ?? 0.6;

    const segments = segmentMarkdownDocument(doc);
    const translatableBase = segments.filter((s) => s.translatable && s.text.trim());
    if (translatableBase.length === 0) {
      await vscode.window.showInformationMessage('Markdown Translator: 未找到可翻译内容。');
      return;
    }

    const translatedUri = getTranslatedFileUri(context, doc.uri);
    const metaUri = getMetaFileUri(context, doc.uri);

    const { markdown: translatedMarkdown, meta: nextMeta } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Markdown Translator: 正在翻译…',
        cancellable: false,
      },
      async (progress) => {
        // 为块计算 hash，用于增量复用
        const translatable = translatableBase.map((s) => ({ ...s, srcHash: sha256(s.text) }));
        const hashById = new Map(translatable.map((s) => [s.id, s.srcHash]));

        // 读取上次的 meta（若存在）
        const prevMeta = await loadTranslationMeta(metaUri);
        const nextMetaSegments = translatable.map((s) => ({ type: s.type, srcHash: s.srcHash, source: s.text }));

        const requestedMode: TranslateMode = options.mode ?? 'auto';
        let mode: 'full' | 'incremental' = 'full';
        const isSameTargetLanguage = prevMeta?.targetLanguage === targetLanguage;
        if (requestedMode === 'auto' && prevMeta && prevMeta.segmenterVersion === SEGMENTER_VERSION && isSameTargetLanguage) {
          const deleted = deletionFallback ? detectDeletion(prevMeta.segments, nextMetaSegments, similarityThreshold) : false;
          mode = deleted ? 'full' : 'incremental';
        }

        const translatedByHash = new Map<string, string>();
        if (mode === 'incremental' && prevMeta) {
          for (const [h, t] of Object.entries(prevMeta.translations)) translatedByHash.set(h, t);
        }

        const toTranslate = mode === 'full' ? translatable : translatable.filter((s) => !translatedByHash.has(s.srcHash));
        const protectedBlocks: TranslationRequestBlock[] = [];
        const placeholdersById = new Map<string, ReturnType<typeof protectMarkdown>>();
        for (const seg of toTranslate) {
          const protectedResult = protectMarkdown(seg.text, seg.id);
          protectedBlocks.push({ id: seg.id, markdown: protectedResult.text });
          placeholdersById.set(seg.id, protectedResult);
        }

        progress.report({ message: 'Checking model context window…' });
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
        outputChannel.appendLine(
          `[${new Date().toISOString()}] Translating ${doc.uri.fsPath} with ${settings.modelId}: ` +
            `${translatable.length} translatable blocks, ${toTranslate.length} to translate, ` +
            `${plan.chunks.length} request(s), mode=${mode}, strategy=${plan.strategy}, ` +
            `contextLength=${modelContextLength ?? 'unknown'}, promptBudget=${plan.contextBudgetTokens ?? 'n/a'}.`,
        );

        if (plan.chunks.length === 0) {
          progress.report({ message: 'Using cached translations…' });
        }

        for (const [chunkIndex, plannedChunk] of plan.chunks.entries()) {
          progress.report({
            message: `Request ${chunkIndex + 1}/${plan.chunks.length} (${plannedChunk.blocks.length} blocks, ~${plannedChunk.estimatedPromptTokens} prompt tokens)…`,
          });
          const prompt = buildPrompt(plannedChunk.blocks);
          const requestStartedAt = Date.now();
          const raw = await openRouterChatCompletion(
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
          outputChannel.appendLine(
            `[${new Date().toISOString()}] Request ${chunkIndex + 1}/${plan.chunks.length} finished in ${Date.now() - requestStartedAt}ms ` +
              `(${plannedChunk.blocks.length} blocks, ~${plannedChunk.estimatedPromptTokens} prompt tokens).`,
          );

          const obj = tryParseJsonObject(raw);
          for (const block of plannedChunk.blocks) {
            const seg = segById.get(block.id);
            if (!seg) {
              throw new Error(`内部错误：缺少翻译块映射（${block.id}）。`);
            }
            const protectedResult = placeholdersById.get(seg.id);
            if (!protectedResult) {
              throw new Error(`内部错误：缺少占位符映射（${seg.id}）。`);
            }
            const result = restoreTranslatedBlock(obj?.[seg.id], seg.id, seg.text, protectedResult);
            if (!result.ok) {
              warnings.push({ blockId: seg.id, reason: result.reason });
              outputChannel.appendLine(`[${new Date().toISOString()}] Warning: block ${seg.id} kept as source: ${result.reason}`);
            }
            translatedByHash.set(seg.srcHash, result.ok ? result.text : result.fallbackText);
          }
        }
        outputChannel.appendLine(`[${new Date().toISOString()}] Translation finished in ${Date.now() - startedAt}ms.`);
        if (warnings.length > 0) {
          outputChannel.appendLine(
            `[${new Date().toISOString()}] Translation completed with ${warnings.length} block warning(s): ` +
              warnings.map((warning) => warning.blockId).join(', '),
          );
        }
        progress.report({ message: 'Writing translated Markdown…' });

        // 用“按 offset 替换”的方式合成最终译文，最大程度保留原始格式与不可翻译片段
        const parts: string[] = [];
        let cursor = 0;
        for (const seg of segments) {
          parts.push(sourceText.slice(cursor, seg.startOffset));
          const h = seg.translatable ? hashById.get(seg.id) : undefined;
          const replacement = seg.translatable && h ? translatedByHash.get(h) ?? seg.text : seg.text;
          parts.push(replacement);
          cursor = seg.endOffset;
        }
        parts.push(sourceText.slice(cursor));
        const out = parts.join('');

        // 生成并保存本次 meta（只保留当前文档相关的 translations）
        const meta = createEmptyMeta(doc.uri);
        meta.targetLanguage = targetLanguage;
        meta.updatedAt = new Date().toISOString();
        meta.outputUri = translatedUri.toString();
        meta.outputHash = sha256(out);
        meta.segments = nextMetaSegments;
        const nextTranslations: Record<string, string> = {};
        for (const seg of translatable) {
          const t = translatedByHash.get(seg.srcHash);
          if (typeof t === 'string') nextTranslations[seg.srcHash] = t;
        }
        meta.translations = nextTranslations;

        return { markdown: out, meta };
      },
    );

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(translatedUri.fsPath)));
    await Promise.all([
      vscode.workspace.fs.writeFile(translatedUri, Buffer.from(translatedMarkdown, 'utf8')),
      saveTranslationMeta(metaUri, nextMeta),
    ]);

    await vscode.commands.executeCommand('markdown.showPreviewToSide', translatedUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${msg}`);
    await vscode.window.showErrorMessage(`Markdown Translator: 翻译失败。${msg}`);
  }
}
