import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import {
  openRouterChatCompletion,
  type ChatMessage,
  type OpenRouterSettings,
} from './openRouterClient.js';
import { parseTranslatedBlockMap, type TranslationAdapterMode } from '../translation/translationAdapters.js';
import type { TranslationRequestBlock } from '../translation/requestPlanner.js';

export type ProviderVerificationResult = {
  adapterMode: TranslationAdapterMode;
  message: string;
};

const MODEL_CAPABILITY_PREFIX = 'marklingo.modelCapability.v1.';
const PROBE_PLACEHOLDER = '__MDT_PROBE_0__';

function getCapabilityKey(settings: Pick<OpenRouterSettings, 'providerType' | 'baseUrl' | 'modelId'>): string {
  const digest = createHash('sha256')
    .update(`${settings.providerType}\n${settings.baseUrl}\n${settings.modelId}`)
    .digest('hex');
  return `${MODEL_CAPABILITY_PREFIX}${digest}`;
}

function isTranslationAdapterMode(value: unknown): value is TranslationAdapterMode {
  return value === 'chatJson' || value === 'translationModel';
}

export async function readVerifiedTranslationAdapterMode(
  context: vscode.ExtensionContext,
  settings: Pick<OpenRouterSettings, 'providerType' | 'baseUrl' | 'modelId'>,
): Promise<TranslationAdapterMode | undefined> {
  const cached = context.globalState.get<unknown>(getCapabilityKey(settings));
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return undefined;
  const adapterMode = (cached as Record<string, unknown>).adapterMode;
  return isTranslationAdapterMode(adapterMode) ? adapterMode : undefined;
}

export async function storeVerifiedTranslationAdapterMode(
  context: vscode.ExtensionContext,
  settings: Pick<OpenRouterSettings, 'providerType' | 'baseUrl' | 'modelId'>,
  adapterMode: TranslationAdapterMode,
): Promise<void> {
  await context.globalState.update(getCapabilityKey(settings), {
    adapterMode,
    providerType: settings.providerType,
    baseUrlHash: createHash('sha256').update(settings.baseUrl).digest('hex'),
    modelId: settings.modelId,
    verifiedAt: new Date().toISOString(),
  });
}

function getChatJsonProbeMessages(): ChatMessage[] {
  const input = {
    b0: 'Hello **world**.',
    b1: `Keep ${PROBE_PLACEHOLDER} unchanged.`,
  };
  return [
    {
      role: 'system',
      content: [
        'Return only valid JSON.',
        'Translate each input Markdown string into Simplified Chinese.',
        'The response must be a JSON object with exactly the same keys as the input.',
        'Preserve Markdown syntax and placeholder tokens exactly.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Input JSON: ${JSON.stringify(input)}`,
    },
  ];
}

function validateChatJsonProbeResponse(raw: string): void {
  const requestedBlocks: TranslationRequestBlock[] = [
    { id: 'b0', markdown: 'Hello **world**.' },
    { id: 'b1', markdown: `Keep ${PROBE_PLACEHOLDER} unchanged.` },
  ];
  const parsed = parseTranslatedBlockMap(raw, requestedBlocks);
  for (const block of requestedBlocks) {
    if (typeof parsed[block.id] !== 'string' || !String(parsed[block.id]).trim()) {
      throw new Error(`Probe response is missing ${block.id}.`);
    }
  }
  if (!String(parsed.b1).includes(PROBE_PLACEHOLDER)) {
    throw new Error('Probe response changed placeholder tokens.');
  }
}

export async function verifyProviderConnectionAndCapability(
  context: vscode.ExtensionContext,
  settings: OpenRouterSettings,
): Promise<ProviderVerificationResult> {
  let raw: string;
  try {
    raw = await openRouterChatCompletion(settings, getChatJsonProbeMessages(), {
      temperature: 0,
      maxTokens: 256,
      timeoutMs: 15_000,
      responseFormat: { type: 'json_object' },
      reasoning: { effort: 'none', exclude: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Verification failed. ${message}`);
  }

  let adapterMode: TranslationAdapterMode = 'chatJson';
  try {
    validateChatJsonProbeResponse(raw);
  } catch {
    adapterMode = 'translationModel';
  }

  await storeVerifiedTranslationAdapterMode(context, settings, adapterMode);
  return {
    adapterMode,
    message: adapterMode === 'chatJson' ? 'Verified as Chat JSON.' : 'Verified as Translation Model.',
  };
}
