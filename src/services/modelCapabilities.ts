import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import {
  openRouterChatCompletion,
  type OpenRouterSettings,
} from './openRouterClient.js';
import type { TranslationAdapterMode } from '../translation/translationAdapters.js';
import { getChatJsonProbeMessages, validateChatJsonProbeResponse } from './modelCapabilityProbe.js';

export type ProviderVerificationResult = {
  adapterMode: TranslationAdapterMode;
  message: string;
};

const MODEL_CAPABILITY_PREFIX = 'marklingo.modelCapability.v2.';

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

export async function verifyProviderConnectionAndCapability(
  context: vscode.ExtensionContext,
  settings: OpenRouterSettings,
): Promise<ProviderVerificationResult> {
  let raw: string;
  try {
    const result = await openRouterChatCompletion(settings, getChatJsonProbeMessages(), {
      temperature: 0,
      maxTokens: 256,
      timeoutMs: 15_000,
      responseFormat: { type: 'json_object' },
      reasoning: { effort: 'none', exclude: true },
    });
    raw = result.content;
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
    message: 'Verified.',
  };
}

export async function verifyProviderConnectionOnly(
  settings: OpenRouterSettings,
  adapterMode: TranslationAdapterMode,
): Promise<ProviderVerificationResult> {
  try {
    await openRouterChatCompletion(settings, [
      { role: 'user', content: 'Connection check. Return a short response.' },
    ], {
      temperature: 0,
      maxTokens: 8,
      timeoutMs: 10_000,
      reasoning: { effort: 'none', exclude: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Verification failed. ${message}`);
  }

  return {
    adapterMode,
    message: 'Connection verified.',
  };
}
