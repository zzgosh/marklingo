export type TranslationRequestBlock = {
  id: string;
  markdown: string;
};

export type TranslationRequestChunk = {
  blocks: TranslationRequestBlock[];
  estimatedPromptTokens: number;
};

export type TranslationRequestPlan = {
  chunks: TranslationRequestChunk[];
  strategy: 'contextWindow' | 'fallbackBlocks';
  contextBudgetTokens?: number;
};

export type PromptBuilder = (blocks: TranslationRequestBlock[]) => { system: string; user: string };

const DEFAULT_CONTEXT_USAGE_RATIO = 0.5;

export function clampContextUsageRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONTEXT_USAGE_RATIO;
  return Math.max(0.1, Math.min(0.9, value));
}

export function estimateTextTokens(text: string): number {
  const cjkChars = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjkChars = Math.max(0, text.length - cjkChars);
  return Math.max(1, Math.ceil(cjkChars + nonCjkChars / 3));
}

export function estimatePromptTokens(prompt: { system: string; user: string }): number {
  return estimateTextTokens(prompt.system) + estimateTextTokens(prompt.user) + 64;
}

function estimateBlockTokens(block: TranslationRequestBlock): number {
  return estimateTextTokens(JSON.stringify(block)) + 1;
}

function chunkByBlockCount(
  blocks: TranslationRequestBlock[],
  maxBlocksPerRequest: number,
  buildPrompt: PromptBuilder,
): TranslationRequestChunk[] {
  const size = Math.max(1, Math.floor(maxBlocksPerRequest));
  const chunks: TranslationRequestChunk[] = [];
  for (let i = 0; i < blocks.length; i += size) {
    const chunkBlocks = blocks.slice(i, i + size);
    chunks.push({
      blocks: chunkBlocks,
      estimatedPromptTokens: estimatePromptTokens(buildPrompt(chunkBlocks)),
    });
  }
  return chunks;
}

function chunkByContextBudget(
  blocks: TranslationRequestBlock[],
  budgetTokens: number,
  buildPrompt: PromptBuilder,
): TranslationRequestChunk[] {
  const chunks: TranslationRequestChunk[] = [];
  const basePromptTokens = estimatePromptTokens(buildPrompt([]));
  let current: TranslationRequestBlock[] = [];
  let currentTokens = basePromptTokens;

  for (const block of blocks) {
    const blockTokens = estimateBlockTokens(block);
    const trialTokens = currentTokens + blockTokens;
    if (current.length > 0 && trialTokens > budgetTokens) {
      chunks.push({ blocks: current, estimatedPromptTokens: currentTokens });
      current = [block];
      currentTokens = basePromptTokens + blockTokens;
      continue;
    }
    current.push(block);
    currentTokens = trialTokens;
  }

  if (current.length > 0) {
    chunks.push({ blocks: current, estimatedPromptTokens: currentTokens });
  }

  return chunks;
}

export function planTranslationRequests(
  blocks: TranslationRequestBlock[],
  options: {
    modelContextLength?: number;
    maxContextUsageRatio: number;
    fallbackMaxBlocksPerRequest: number;
    buildPrompt: PromptBuilder;
  },
): TranslationRequestPlan {
  if (blocks.length === 0) {
    return { chunks: [], strategy: 'fallbackBlocks' };
  }

  if (options.modelContextLength && options.modelContextLength > 0) {
    const contextBudgetTokens = Math.max(1, Math.floor(options.modelContextLength * clampContextUsageRatio(options.maxContextUsageRatio)));
    return {
      chunks: chunkByContextBudget(blocks, contextBudgetTokens, options.buildPrompt),
      strategy: 'contextWindow',
      contextBudgetTokens,
    };
  }

  return {
    chunks: chunkByBlockCount(blocks, options.fallbackMaxBlocksPerRequest, options.buildPrompt),
    strategy: 'fallbackBlocks',
  };
}
