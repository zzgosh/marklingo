import * as vscode from 'vscode';
import * as path from 'path';
import { getOpenRouterSettings, openRouterChatCompletion } from '../services/openRouterClient';
import { protectMarkdown, restoreMarkdown } from '../translation/placeholders';
import { SEGMENTER_VERSION, segmentMarkdownDocument } from '../translation/segmenter';
import { createEmptyMeta, detectDeletion, getMetaFileUri, loadTranslationMeta, saveTranslationMeta, sha256 } from '../translation/cache';

function getTranslatedFileUri(sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}_mdt.md`));
}

function getLegacyMetaFileUri(sourceUri: vscode.Uri): vscode.Uri {
  const parsed = path.parse(sourceUri.fsPath);
  return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}_mdt.meta.json`));
}

function buildBlocksTranslatePrompt(
  input: { blocks: Array<{ id: string; markdown: string }> },
  options: { systemPromptExtra?: string; targetLanguage: string },
): { system: string; user: string } {
  const baseSystem = [
    '你是一个严谨的 Markdown 翻译助手。',
    `你的任务：把用户提供的 Markdown 片段翻译为${options.targetLanguage}。`,
    '重要规则：',
    '- 只翻译自然语言文本。',
    '- 必须保持 Markdown 结构与格式（标题、列表、引用、表格等）。',
    '- 代码块、行内代码、YAML frontmatter、HTML 必须原样保留，不能改动任何字符。',
    '- 链接 URL、图片路径必须原样保留；仅可翻译可见文字（如链接文本、图片 alt 文本）。',
    '- 输入中出现的占位符 token（形如 __MDT_xxx__）必须原样输出，不能改动、不能翻译、不能插入空格。',
    '输出格式（非常重要）：',
    '- 你必须只输出一个合法的 JSON 对象（不要解释、不要代码块）。',
    '- JSON 的 key 是 block id。',
    '- JSON 的 value 是字符串数组，每个元素表示一行 Markdown，不包含换行符（空行用空字符串）。',
  ].join('\n');

  const systemPromptExtra = (options.systemPromptExtra ?? '').trim();
  const system = systemPromptExtra ? [baseSystem, '', '用户附加 system prompt：', systemPromptExtra].join('\n') : baseSystem;

  const user = ['请翻译下面这些 Markdown blocks：', '---', JSON.stringify(input)].join('\n');
  return { system, user };
}

const TARGET_LANGUAGE_SELECTED_KEY = 'markdownTranslator.translation.targetLanguageSelected';
const CUSTOM_TARGET_LANGUAGE_LABEL = '自定义...';
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
    const maxBlocksPerRequest = Math.max(1, cfg.get<number>('translation.maxBlocksPerRequest') ?? 12);
    const systemPromptExtra = (cfg.get<string>('translation.systemPrompt') ?? '').trim();
    const deletionFallback = cfg.get<boolean>('translation.deletionFallback') ?? true;
    const similarityThreshold = cfg.get<number>('translation.similarityThreshold') ?? 0.6;

    const segments = segmentMarkdownDocument(doc);
    const translatableBase = segments.filter((s) => s.translatable && s.text.trim());
    if (translatableBase.length === 0) {
      await vscode.window.showInformationMessage('Markdown Translator: 未找到可翻译内容。');
      return;
    }

    const translatedUri = getTranslatedFileUri(doc.uri);
    const metaUri = getMetaFileUri(doc.uri);
    const legacyMetaUri = getLegacyMetaFileUri(doc.uri);

    const { markdown: translatedMarkdown, meta: nextMeta } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Markdown Translator: 正在翻译…',
        cancellable: false,
      },
      async () => {
        // 为块计算 hash，用于增量复用
        const translatable = translatableBase.map((s) => ({ ...s, srcHash: sha256(s.text) }));
        const hashById = new Map(translatable.map((s) => [s.id, s.srcHash]));

        // 读取上次的 meta（若存在）
        const prevMeta = (await loadTranslationMeta(metaUri)) ?? (metaUri.fsPath !== legacyMetaUri.fsPath ? await loadTranslationMeta(legacyMetaUri) : null);
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
        const chunks = chunkArray(toTranslate, maxBlocksPerRequest);
        for (const chunk of chunks) {
          const protectedBlocks: Array<{ id: string; markdown: string }> = [];
          const placeholdersById = new Map<string, ReturnType<typeof protectMarkdown>>();

          for (const seg of chunk) {
            const protectedResult = protectMarkdown(seg.text, seg.id);
            protectedBlocks.push({ id: seg.id, markdown: protectedResult.text });
            placeholdersById.set(seg.id, protectedResult);
          }

          const prompt = buildBlocksTranslatePrompt({ blocks: protectedBlocks }, { systemPromptExtra, targetLanguage });
          const raw = await openRouterChatCompletion(
            settings,
            [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            { timeoutMs: 120_000, temperature: 0 },
          );

          const obj = tryParseJsonObject(raw);
          for (const seg of chunk) {
            const value = obj?.[seg.id];
            if (!Array.isArray(value) || !value.every((x) => typeof x === 'string' && !x.includes('\n'))) {
              throw new Error(`模型输出格式错误：block ${seg.id} 不符合“字符串数组(按行)”要求。`);
            }
            const protectedTranslated = value.join('\n');
            const protectedResult = placeholdersById.get(seg.id);
            if (!protectedResult) {
              throw new Error(`内部错误：缺少占位符映射（${seg.id}）。`);
            }
            const restored = restoreMarkdown(protectedTranslated, protectedResult.placeholders);
            translatedByHash.set(seg.srcHash, restored);
          }
        }

        // 用“按 offset 替换”的方式合成最终译文，最大程度保留原始格式与不可翻译片段
        let out = '';
        let cursor = 0;
        const sorted = [...segments].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
        for (const seg of sorted) {
          out += sourceText.slice(cursor, seg.startOffset);
          const h = seg.translatable ? hashById.get(seg.id) : undefined;
          const replacement = seg.translatable && h ? translatedByHash.get(h) ?? seg.text : seg.text;
          out += replacement;
          cursor = seg.endOffset;
        }
        out += sourceText.slice(cursor);

        // 生成并保存本次 meta（只保留当前文档相关的 translations）
        const meta = createEmptyMeta(doc.uri);
        meta.targetLanguage = targetLanguage;
        meta.updatedAt = new Date().toISOString();
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

    await vscode.workspace.fs.writeFile(translatedUri, Buffer.from(translatedMarkdown, 'utf8'));
    await saveTranslationMeta(metaUri, nextMeta);

    await vscode.commands.executeCommand('markdown.showPreviewToSide', translatedUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`Markdown Translator: 翻译失败。${msg}`);
  }
}
