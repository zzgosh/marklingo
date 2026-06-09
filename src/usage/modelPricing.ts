import {
  getProviderGatewayModelId,
  type ProviderType,
} from '../services/providerPresets.js';
import { MODEL_PRICING } from './modelPricing.generated.js';

export type ModelPricing = {
  input: number;
  output: number;
  contextWindow?: number;
  maxTokens?: number;
};

export type CostEstimateTokens = {
  input?: number;
  output?: number;
  total?: number;
};

export type CostEstimate = {
  amount: number;
  currency: 'USD';
};

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeOutputTokens(tokens: CostEstimateTokens): number | undefined {
  if (isNonNegativeFinite(tokens.output)) return tokens.output;
  if (isNonNegativeFinite(tokens.total) && isNonNegativeFinite(tokens.input)) {
    return Math.max(0, tokens.total - tokens.input);
  }
  return undefined;
}

export function getModelPricing(gatewayModelId: string): ModelPricing | undefined {
  const value = (MODEL_PRICING.models as Record<string, ModelPricing | undefined>)[gatewayModelId.trim()];
  if (!value || !isNonNegativeFinite(value.input) || !isNonNegativeFinite(value.output)) return undefined;
  return value;
}

export function estimateCostFromTokens(
  pricing: ModelPricing,
  tokens: CostEstimateTokens,
): CostEstimate | undefined {
  if (!isNonNegativeFinite(tokens.input)) return undefined;
  const output = normalizeOutputTokens(tokens);
  if (output === undefined) return undefined;
  const amount = tokens.input * pricing.input + output * pricing.output;
  return Number.isFinite(amount) && amount >= 0
    ? { amount, currency: 'USD' }
    : undefined;
}

export function estimateProviderModelCost(
  providerType: ProviderType | string | undefined,
  modelId: string | undefined,
  tokens: CostEstimateTokens,
): CostEstimate | undefined {
  if (!providerType || !modelId) return undefined;
  const gatewayModelId = getProviderGatewayModelId(providerType as ProviderType, modelId);
  if (!gatewayModelId) return undefined;
  const pricing = getModelPricing(gatewayModelId);
  return pricing ? estimateCostFromTokens(pricing, tokens) : undefined;
}

export function getGatewayModelContextWindow(
  providerType: ProviderType,
  modelId: string,
): number | undefined {
  const gatewayModelId = getProviderGatewayModelId(providerType, modelId);
  if (!gatewayModelId) return undefined;
  const pricing = getModelPricing(gatewayModelId);
  return pricing?.contextWindow;
}

