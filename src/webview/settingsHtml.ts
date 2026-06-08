import {
  coerceProviderType,
  getProviderModelTags,
  getProviderPreset,
  KNOWN_LOCAL_MODEL_TAG_RULES,
  PROVIDER_PRESETS,
  providerRequiresApiKey,
  providerSupportsApiKey,
  type ModelTag,
  type ProviderType,
} from '../services/providerPresets.js';
import type { UsageView } from '../usage/usageAggregate.js';

export const CUSTOM_TARGET_LANGUAGE_LABEL = 'Custom...';

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

export type SettingsProviderState = {
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
  verifiedAdapterMode?: string;
  promptInstructions: string;
  promptInstructionsEnhanced: boolean;
  promptInstructionsEnhancementNote?: string;
};

export type SettingsState = {
  shortcutLabel: string;
  shortcutStatus: string;
  shortcutWarning: string;
  providerType: string;
  baseUrl: string;
  openRouterBaseUrl: string;
  openRouterModelId: string;
  openRouterHasApiKey: boolean;
  openRouterVerifiedAdapterMode?: string;
  openRouterPromptInstructions: string;
  openRouterPromptInstructionsEnhanced: boolean;
  openRouterPromptInstructionsEnhancementNote?: string;
  openAiCompatibleBaseUrl: string;
  openAiCompatibleModelId: string;
  openAiCompatibleHasApiKey: boolean;
  openAiCompatibleVerifiedAdapterMode?: string;
  openAiCompatiblePromptInstructions: string;
  openAiCompatiblePromptInstructionsEnhanced: boolean;
  openAiCompatiblePromptInstructionsEnhancementNote?: string;
  providerStates: Record<string, SettingsProviderState>;
  hasApiKey: boolean;
  modelId: string;
  verifiedAdapterMode?: string;
  requestMode: string;
  translationModelMaxBlocksPerRequest: number;
  translationModelConcurrency: number;
  translationModelMaxOutputTokens: number;
  targetLanguage: string;
  targetLanguageCustom: string;
  promptInstructions: string;
  promptInstructionsEnhanced: boolean;
  promptInstructionsEnhancementNote?: string;
  chatPromptInstructions: string;
  customPrompt: string;
  storageRoot: string;
  currentProjectPath?: string;
  storageStats: {
    totalBytes: number;
    quotaBytes: number;
    projectCount: number;
    metaFileCount: number;
    activeCacheCount: number;
    evictedCacheCount: number;
    cachePayloadBytes: number;
  };
  usage: UsageView;
};

export type RenderSettingsHtmlOptions = {
  cspSource: string;
  nonce: string;
  state: SettingsState;
  extraHead?: string;
  beforeMainScript?: string;
};

export function createSettingsHtmlNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderOptions(selected: string): string {
  return TARGET_LANGUAGE_OPTIONS.map((option) => {
    const selectedAttr = option === selected ? ' selected' : '';
    return `<option value="${escapeHtml(option)}"${selectedAttr}>${escapeHtml(option)}</option>`;
  }).join('');
}

function renderProviderOptions(selected: string): string {
  return PROVIDER_PRESETS.map((option) => {
    const selectedAttr = option.id === selected ? ' selected' : '';
    return `<option value="${escapeHtml(option.id)}"${selectedAttr}>${escapeHtml(option.label)}</option>`;
  }).join('');
}

const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  quality: 'Quality',
  fast: 'Fast',
  slow: 'Slow',
  local: 'Local',
};

// Inline glyphs shown inside model tag badges. Tags without an icon render text only.
const MODEL_TAG_ICONS: Partial<Record<ModelTag, string>> = {
  fast: '<svg class="model-tag-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 9H21L11 24V15H4L13 0V9ZM11 11V7.22063L7.53238 13H13V17.3944L17.263 11H11Z"></path></svg>',
};

// The dropdown intentionally lists the raw model id (no display name, no tags). Curated
// tags are surfaced separately as badges below the control.
function renderModelIdSelectOptions(providerType: ProviderType, modelId: string): string {
  const preset = getProviderPreset(providerType);
  const normalizedModelId = modelId.trim();
  const concreteOptions = preset.modelOptions.filter((option) => option.modelId);
  const hasSelectedOption = concreteOptions.some((option) => option.modelId === normalizedModelId);
  const optionsHtml = concreteOptions.map((option) => {
    const selectedAttr = option.modelId === normalizedModelId ? ' selected' : '';
    return `<option value="${escapeHtml(option.modelId)}"${selectedAttr}>${escapeHtml(option.modelId)}</option>`;
  }).join('');
  if (!preset.modelIdEditable) return optionsHtml;

  const customSelectedAttr = hasSelectedOption ? '' : ' selected';
  return `${optionsHtml}<option value=""${customSelectedAttr}>Custom...</option>`;
}

function renderModelTagBadges(tags: readonly ModelTag[]): string {
  return tags.map((tag) => {
    const icon = MODEL_TAG_ICONS[tag] ?? '';
    return `<span class="model-tag model-tag-${escapeHtml(tag)}">${icon}${escapeHtml(MODEL_TAG_LABELS[tag])}</span>`;
  }).join('');
}

function getShortcutWarningText(warning: string): string {
  if (!warning) return '';
  if (warning.includes('another command')) {
    return 'Shortcut may be unavailable because another command uses it.';
  }
  if (warning.includes('assign')) {
    return 'No active shortcut. Edit keyboard shortcuts to assign one.';
  }
  return warning;
}

const API_KEY_MASK_VALUE = '•'.repeat(32);
const PROVIDER_SMALL_BATCH_STATUS = 'Verified - using smaller batches for reliability.';
const PROVIDER_SMALL_BATCH_TOOLTIP = 'Some models need smaller Markdown batches to keep output reliable, so large files may run a bit slower.';

type ProviderClientPreset = {
  label: string;
  defaultBaseUrl: string;
  defaultModelId: string;
  supportsApiKey: boolean;
  requiresApiKey: boolean;
  baseUrlEditable: boolean;
  modelIdEditable: boolean;
  modelOptions: { label: string; modelId: string; tags?: readonly ModelTag[] }[];
};

function getFallbackProviderState(state: SettingsState, providerType: ProviderType): SettingsProviderState {
  const preset = getProviderPreset(providerType);
  if (providerType === 'openrouter') {
    return {
      baseUrl: state.openRouterBaseUrl,
      modelId: state.openRouterModelId,
      hasApiKey: state.openRouterHasApiKey,
      verifiedAdapterMode: state.openRouterHasApiKey ? state.openRouterVerifiedAdapterMode : undefined,
      promptInstructions: state.openRouterPromptInstructions,
      promptInstructionsEnhanced: state.openRouterPromptInstructionsEnhanced,
      promptInstructionsEnhancementNote: state.openRouterPromptInstructionsEnhancementNote,
    };
  }
  if (providerType === 'openaiCompatible') {
    return {
      baseUrl: state.openAiCompatibleBaseUrl,
      modelId: state.openAiCompatibleModelId,
      hasApiKey: state.openAiCompatibleHasApiKey,
      verifiedAdapterMode: state.openAiCompatibleHasApiKey ? state.openAiCompatibleVerifiedAdapterMode : undefined,
      promptInstructions: state.openAiCompatiblePromptInstructions,
      promptInstructionsEnhanced: state.openAiCompatiblePromptInstructionsEnhanced,
      promptInstructionsEnhancementNote: state.openAiCompatiblePromptInstructionsEnhancementNote,
    };
  }
  return {
    baseUrl: preset.defaultBaseUrl,
    modelId: preset.defaultModelId,
    hasApiKey: false,
    promptInstructions: state.chatPromptInstructions,
    promptInstructionsEnhanced: false,
  };
}

function buildProviderStateMap(state: SettingsState): Record<string, SettingsProviderState> {
  const providerStates = { ...state.providerStates };
  for (const preset of PROVIDER_PRESETS) {
    const current = providerStates[preset.id] ?? getFallbackProviderState(state, preset.id);
    providerStates[preset.id] = {
      baseUrl: current.baseUrl,
      modelId: current.modelId,
      hasApiKey: providerSupportsApiKey(preset.id) ? current.hasApiKey : false,
      verifiedAdapterMode: (!providerRequiresApiKey(preset.id) || current.hasApiKey) ? current.verifiedAdapterMode : undefined,
      promptInstructions: current.promptInstructions || state.chatPromptInstructions,
      promptInstructionsEnhanced: current.promptInstructionsEnhanced,
      promptInstructionsEnhancementNote: current.promptInstructionsEnhancementNote,
    };
  }
  return providerStates;
}

function buildProviderClientPresets(): Record<string, ProviderClientPreset> {
  return Object.fromEntries(PROVIDER_PRESETS.map((preset) => [
    preset.id,
    {
      label: preset.label,
      defaultBaseUrl: preset.defaultBaseUrl,
      defaultModelId: preset.defaultModelId,
      supportsApiKey: providerSupportsApiKey(preset.id),
      requiresApiKey: providerRequiresApiKey(preset.id),
      baseUrlEditable: preset.baseUrlEditable,
      modelIdEditable: preset.modelIdEditable,
      modelOptions: preset.modelOptions,
    },
  ]));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

const USAGE_RANGE_OPTIONS = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];
const USAGE_SCOPE_OPTIONS = [
  { value: 'allProjects', label: 'All Projects' },
  { value: 'currentProject', label: 'Current Project' },
];
const USAGE_BREAKDOWN_OPTIONS = [
  { value: 'provider', label: 'Provider' },
  { value: 'model', label: 'Model' },
  { value: 'project', label: 'Project' },
  { value: 'targetLanguage', label: 'Language' },
];
const USAGE_GROUPBY_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
const USAGE_BREAKDOWN_LABELS: Record<string, string> = {
  provider: 'provider',
  model: 'model',
  project: 'project',
  targetLanguage: 'language',
};

function formatUsageCount(value: number): string {
  return value.toLocaleString('en-US');
}

function formatUsageTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}

function formatUsageCost(value: number | undefined, currency: string | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  const amount = value >= 1
    ? value.toFixed(2)
    : value >= 0.01
      ? value.toFixed(4)
      : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (!currency || currency === 'credits') return `${amount} credits`;
  return `${amount} ${currency}`;
}

function formatUsageDuration(ms?: number): string {
  if (typeof ms !== 'number' || ms <= 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function formatUsageTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderUsageSegmentControl(
  control: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  active: string,
): string {
  const buttons = options
    .map((option) => {
      const activeClass = option.value === active ? ' active' : '';
      return `<button type="button" class="usage-seg-btn${activeClass}" data-usage-control="${control}" data-value="${option.value}">${escapeHtml(option.label)}</button>`;
    })
    .join('');
  return `<div class="usage-seg" role="group">${buttons}</div>`;
}

function renderUsageControls(query: UsageView['query']): string {
  const groupByOptions = USAGE_GROUPBY_OPTIONS
    .map((option) => `<option value="${option.value}"${option.value === query.groupBy ? ' selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
  return `<div class="usage-controls">
            <div class="usage-control-group">
              <div class="usage-control-label">Range</div>
              ${renderUsageSegmentControl('range', USAGE_RANGE_OPTIONS, query.range)}
            </div>
            <div class="usage-control-group">
              <div class="usage-control-label">Scope</div>
              ${renderUsageSegmentControl('scope', USAGE_SCOPE_OPTIONS, query.scope)}
            </div>
            <div class="usage-control-group">
              <div class="usage-control-label">Breakdown</div>
              ${renderUsageSegmentControl('breakdown', USAGE_BREAKDOWN_OPTIONS, query.breakdown)}
            </div>
            <label class="usage-control-group usage-groupby">
              <span class="usage-control-label">Group by</span>
              <select data-usage-control="groupBy">${groupByOptions}</select>
            </label>
          </div>`;
}

function usageSegmentClass(index: number, key: string): string {
  return key === 'Other' ? 'usage-seg-other' : `usage-seg-c${index % 6}`;
}

function renderUsageBars(view: UsageView): string {
  const buckets = view.buckets ?? [];
  const dimensionKeys = view.dimensionKeys ?? [];
  if (buckets.length === 0) {
    return '<div class="usage-empty">No runs in this range.</div>';
  }
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.totalRuns));
  const count = buckets.length;
  const slotWidth = 100 / count;
  const barWidth = slotWidth * 0.7;
  const barOffset = (slotWidth - barWidth) / 2;
  const rects: string[] = [];
  buckets.forEach((bucket, bucketIndex) => {
    let yTop = 100;
    bucket.segments.forEach((segment) => {
      if (segment.runs <= 0) return;
      const height = (segment.runs / maxTotal) * 100;
      yTop -= height;
      const dimIndex = dimensionKeys.indexOf(segment.key);
      const x = bucketIndex * slotWidth + barOffset;
      rects.push(`<rect class="${usageSegmentClass(dimIndex, segment.key)}" x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}"><title>${escapeHtml(bucket.label)}: ${escapeHtml(segment.key)} ${segment.runs}</title></rect>`);
    });
  });
  const labelStep = Math.max(1, Math.ceil(count / 8));
  const axisLabels = buckets
    .map((bucket, index) => {
      if (index % labelStep !== 0 && index !== count - 1) return '';
      const x = index * slotWidth + slotWidth / 2;
      return `<span class="usage-axis-label" style="left: ${x.toFixed(2)}%">${escapeHtml(bucket.label)}</span>`;
    })
    .join('');
  const legend = dimensionKeys
    .map((key, index) => `<span class="usage-legend-item"><span class="usage-legend-swatch ${usageSegmentClass(index, key)}"></span>${escapeHtml(key)}</span>`)
    .join('');
  const totalRuns = buckets.reduce((sum, bucket) => sum + bucket.totalRuns, 0);
  const breakdownLabel = USAGE_BREAKDOWN_LABELS[view.query.breakdown] ?? view.query.breakdown;
  return `<div class="usage-chart-head"><span class="usage-chart-title">Runs by ${escapeHtml(breakdownLabel)}</span><span class="usage-chart-total">${formatUsageCount(totalRuns)} runs</span></div>
          <div class="usage-bars-wrap">
            <svg class="usage-bars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${rects.join('')}</svg>
            <div class="usage-axis">${axisLabels}</div>
          </div>
          <div class="usage-legend">${legend}</div>`;
}

function renderUsageTops(view: UsageView): string {
  const tops = view.tops ?? [];
  const breakdownLabel = USAGE_BREAKDOWN_LABELS[view.query.breakdown] ?? view.query.breakdown;
  if (tops.length === 0) {
    return `<div class="usage-chart-head"><span class="usage-chart-title">Top ${escapeHtml(breakdownLabel)}</span></div><div class="usage-empty">No data.</div>`;
  }
  const maxRuns = Math.max(1, ...tops.map((entry) => entry.runs));
  const rows = tops
    .map((entry) => {
      const width = (entry.runs / maxRuns) * 100;
      return `<div class="usage-top-row">
                <span class="usage-top-label" title="${escapeHtml(entry.key)}">${escapeHtml(entry.key)}</span>
                <span class="usage-top-bar"><span class="usage-top-fill" style="width: ${width.toFixed(1)}%"></span></span>
                <span class="usage-top-value">${formatUsageCount(entry.runs)}</span>
              </div>`;
    })
    .join('');
  return `<div class="usage-chart-head"><span class="usage-chart-title">Top ${escapeHtml(breakdownLabel)}</span></div>
          <div class="usage-tops">${rows}</div>`;
}

function renderUsageReuse(view: UsageView): string {
  const reuse = view.reuse ?? { translated: 0, reused: 0, fallback: 0 };
  const total = reuse.translated + reuse.reused + reuse.fallback;
  const reusePctText = view.reusePercent === undefined ? '—' : `${Math.round(view.reusePercent)}%`;
  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const strip = total > 0
    ? `<div class="usage-reuse-strip">
              <span class="usage-reuse-seg reused" style="width: ${pct(reuse.reused).toFixed(1)}%"></span>
              <span class="usage-reuse-seg translated" style="width: ${pct(reuse.translated).toFixed(1)}%"></span>
              <span class="usage-reuse-seg fallback" style="width: ${pct(reuse.fallback).toFixed(1)}%"></span>
            </div>`
    : '<div class="usage-reuse-strip empty"></div>';
  return `<div class="usage-chart-head"><span class="usage-chart-title">Cache reuse</span><span class="usage-chart-total">${reusePctText} reused</span></div>
          ${strip}
          <div class="usage-reuse-legend">
            <span class="usage-legend-item"><span class="usage-legend-swatch reused"></span>${formatUsageCount(reuse.reused)} reused</span>
            <span class="usage-legend-item"><span class="usage-legend-swatch translated"></span>${formatUsageCount(reuse.translated)} new</span>
            <span class="usage-legend-item"><span class="usage-legend-swatch fallback"></span>${formatUsageCount(reuse.fallback)} fallback</span>
          </div>`;
}

function renderUsageRecentTable(view: UsageView): string {
  const rows = (view.recentRuns ?? [])
    .map((run) => {
      const blocks = run.status === 'success'
        ? `${run.translatedBlocks ?? 0} new / ${run.reusedBlocks ?? 0} reused`
        : '—';
      const tokenTotal = run.tokensSource === 'reported'
        ? run.tokensTotal ?? ((run.tokensInput ?? 0) + (run.tokensOutput ?? 0))
        : run.tokensInput;
      const tokenLabel = typeof tokenTotal === 'number'
        ? `${formatUsageTokens(tokenTotal)} ${run.tokensSource === 'reported' ? 'tokens' : 'est. input'}`
        : '—';
      const costLabel = formatUsageCost(run.costAmount, run.costCurrency);
      const statusLabel = run.status === 'success' ? 'Success' : 'Failed';
      return `<tr>
                <td><span class="usage-cell-stack"><span>${escapeHtml(formatUsageTime(run.finishedAt ?? run.startedAt))}</span><span class="usage-cell-sub">${escapeHtml(formatUsageDuration(run.durationMs))}</span></span></td>
                <td class="usage-file" title="${escapeHtml(`${run.projectName} / ${run.sourceFileName}`)}"><span class="usage-cell-stack"><span>${escapeHtml(run.sourceFileName)}</span><span class="usage-cell-sub">${escapeHtml(run.projectName)}</span></span></td>
                <td>${escapeHtml(run.targetLanguage ?? '—')}</td>
                <td class="usage-file" title="${escapeHtml(run.modelId ?? '')}">${escapeHtml(run.modelId ?? '—')}</td>
                <td>${escapeHtml(blocks)}</td>
                <td><span class="usage-cell-stack"><span>${escapeHtml(tokenLabel)}</span><span class="usage-cell-sub">${escapeHtml(costLabel)}</span></span></td>
                <td><span class="usage-status" data-status="${run.status}">${statusLabel}</span></td>
              </tr>`;
    })
    .join('');
  return `<div class="usage-table-wrap">
            <table class="usage-table">
              <thead><tr><th>Time</th><th>File</th><th>Target</th><th>Model</th><th>Work</th><th>Usage</th><th>Status</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
}

/**
 * Render the inner Usage body (summary cards, charts, recent runs) for a usage view. Exported so the
 * Settings panel can re-render just this fragment on control changes without a full webview reload;
 * the persistent control shell stays outside this fragment.
 */
export function renderUsageSection(view: UsageView): string {
  if (!view || view.totalRuns === 0) {
    return '<div class="usage-empty">No translations in this range yet. Translate a Markdown file, or widen the range, to see files, models, token estimates, and cache reuse here.</div>';
  }
  const reuseText = view.reusePercent === undefined ? '—' : `${Math.round(view.reusePercent)}%`;
  const tokenTotal = view.hasReportedTokens
    ? view.reportedTotalTokens || (view.reportedInputTokens + view.reportedOutputTokens)
    : view.estimatedInputTokens;
  const tokenCaption = view.hasReportedTokens
    ? `${formatUsageTokens(view.reportedInputTokens)} input / ${formatUsageTokens(view.reportedOutputTokens)} output`
    : 'Input tokens · estimated';
  const costText = formatUsageCost(view.reportedCost, view.costCurrency);
  const costCaption = view.hasReportedCost ? 'Cost · reported' : 'Cost unavailable';
  const cards = `<div class="usage-cards">
            <div class="usage-card"><div class="usage-value">${formatUsageCount(view.filesTranslated)}</div><div class="usage-caption">Files translated</div></div>
            <div class="usage-card"><div class="usage-value">${formatUsageCount(view.totalRuns)}</div><div class="usage-caption">Runs · ${formatUsageCount(view.successRuns)} ok / ${formatUsageCount(view.failedRuns)} failed</div></div>
            <div class="usage-card"><div class="usage-value">${escapeHtml(formatUsageTokens(tokenTotal))}</div><div class="usage-caption">${escapeHtml(tokenCaption)}</div></div>
            <div class="usage-card"><div class="usage-value">${escapeHtml(costText)}</div><div class="usage-caption">${escapeHtml(costCaption)}</div></div>
            <div class="usage-card"><div class="usage-value">${escapeHtml(reuseText)}</div><div class="usage-caption">Cache reuse · ${formatUsageCount(view.reusedBlocks)} reused / ${formatUsageCount(view.translatedBlocks)} new</div></div>
          </div>`;
  return `${cards}
          <div class="usage-charts">
            <div class="usage-chart usage-chart-bars">${renderUsageBars(view)}</div>
            <div class="usage-chart">${renderUsageTops(view)}</div>
            <div class="usage-chart">${renderUsageReuse(view)}</div>
          </div>
          ${renderUsageRecentTable(view)}`;
}

export function renderSettingsHtml(options: RenderSettingsHtmlOptions): string {
  const { beforeMainScript = '', cspSource, extraHead = '', nonce, state } = options;
  const providerStates = buildProviderStateMap(state);
  const activeProviderType = coerceProviderType(state.providerType);
  const activeProviderState = providerStates[activeProviderType] ?? providerStates.openrouter;
  const activeProviderPreset = getProviderPreset(activeProviderType);
  const activeProviderSupportsApiKey = providerSupportsApiKey(activeProviderType);
  const apiKeyInitialAttrs = activeProviderSupportsApiKey && activeProviderState.hasApiKey
    ? ` value="${escapeHtml(API_KEY_MASK_VALUE)}" data-masked="true"`
    : '';
  const providerBaseUrlHidden = activeProviderPreset.baseUrlEditable ? '' : ' hidden';
  const activeProviderConcreteModelOptions = activeProviderPreset.modelOptions.filter((option) => option.modelId);
  const activeProviderHasModelSelect = activeProviderConcreteModelOptions.length > 0;
  const activeModelIsPresetOption = activeProviderConcreteModelOptions.some(
    (option) => option.modelId === activeProviderState.modelId.trim(),
  );
  // The free-text input is reserved for custom model ids: editable providers either with no
  // preset list, or whose current model is not one of the presets.
  const activeModelCustomMode = activeProviderPreset.modelIdEditable
    && (!activeProviderHasModelSelect || !activeModelIsPresetOption);
  const providerModelInputHidden = activeModelCustomMode ? '' : ' hidden';
  const providerModelSelectHidden = activeProviderHasModelSelect ? '' : ' hidden';
  const activeProviderModelTags = getProviderModelTags(
    activeProviderType,
    activeProviderState.baseUrl,
    activeProviderState.modelId,
  );
  const providerModelTagsHidden = activeProviderModelTags.length > 0 ? '' : ' hidden';
  const apiKeyRowHidden = activeProviderSupportsApiKey ? '' : ' hidden';
  const verifiedAdapterMode = activeProviderState.hasApiKey ? activeProviderState.verifiedAdapterMode : undefined;
  const customPromptRowHidden = verifiedAdapterMode === 'translationModel' ? ' hidden' : '';
  const promptInstructions = activeProviderState.promptInstructions || state.promptInstructions;
  const promptInstructionsEnhanced = activeProviderState.promptInstructionsEnhanced || state.promptInstructionsEnhanced;
  const promptInstructionsEnhancementNote = activeProviderState.promptInstructionsEnhancementNote || state.promptInstructionsEnhancementNote || 'MarkLingo uses a model-specific optimized prompt for this translation model.';
  const promptInstructionsBadge = promptInstructionsEnhanced
    ? `<span class="prompt-enhanced-badge" title="${escapeHtml(promptInstructionsEnhancementNote)}" aria-label="${escapeHtml(promptInstructionsEnhancementNote)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5l2.4 5.2 5.6.7-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5-4.1-3.8 5.6-.7L12 3.5z"></path>
        </svg>
      </span>`
    : '';
  const customLanguageHidden = state.targetLanguage === CUSTOM_TARGET_LANGUAGE_LABEL ? '' : ' hidden';
  const shortcutWarningText = getShortcutWarningText(state.shortcutWarning);
  const pluralize = (count: number, singular: string, plural: string): string =>
    `${count} ${count === 1 ? singular : plural}`;
  const storageStatsTextParts = [
    pluralize(state.storageStats.projectCount, 'project', 'projects'),
    pluralize(state.storageStats.metaFileCount, 'metadata file', 'metadata files'),
  ];
  if (state.storageStats.evictedCacheCount > 0) {
    storageStatsTextParts.push(pluralize(
      state.storageStats.evictedCacheCount,
      'small tracking record',
      'small tracking records',
    ));
  }
  const storageStatsText = storageStatsTextParts.join(' · ');
  const storagePercent = state.storageStats.quotaBytes > 0
    ? Math.min(100, Math.max(0, Math.round((state.storageStats.totalBytes / state.storageStats.quotaBytes) * 100)))
    : 0;
  const storageMeterState = storagePercent >= 90 ? 'warning' : 'normal';
  const currentProjectPath = state.currentProjectPath?.trim();
  const currentProjectDataDisabled = currentProjectPath ? '' : ' disabled';
  const currentProjectDataDescription = currentProjectPath
    ? currentProjectPath
    : 'Open a file or single workspace folder to select a current project.';
  const providerClientPresets = buildProviderClientPresets();
  const providerBaselines = Object.fromEntries(Object.entries(providerStates).map(([providerType, providerState]) => [
    providerType,
    {
      baseUrl: providerState.baseUrl,
      modelId: providerState.modelId,
      hasApiKey: providerState.hasApiKey,
      verifiedAdapterMode: (!providerRequiresApiKey(coerceProviderType(providerType)) || providerState.hasApiKey)
        ? providerState.verifiedAdapterMode ?? ''
        : '',
      promptInstructions: providerState.promptInstructions,
      promptInstructionsEnhanced: providerState.promptInstructionsEnhanced,
      promptInstructionsEnhancementNote: providerState.promptInstructionsEnhancementNote ?? '',
    },
  ]));
  const providerDrafts = Object.fromEntries(Object.entries(providerStates).map(([providerType, providerState]) => [
    providerType,
    {
      baseUrl: providerState.baseUrl,
      modelId: providerState.modelId,
      hasApiKey: providerState.hasApiKey,
      apiKeyInput: '',
    },
  ]));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarkLingo Settings</title>
  ${extraHead}
  <style>
    :root {
      color-scheme: dark light;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --panel: var(--vscode-sideBar-background);
      --border: var(--vscode-widget-border);
      --input: var(--vscode-input-background);
      --button: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --accent: var(--vscode-focusBorder);
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 13px/1.45 var(--vscode-font-family);
    }
    .shell {
      min-height: 100vh;
    }
    main {
      width: min(100%, 920px);
      padding: 48px 32px 72px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 28px;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
    }
    h2 {
      margin: 34px 0 8px;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: 0;
    }
    h2.danger-title { color: var(--danger); }
    p {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--panel) 80%, transparent);
    }
    .card.danger { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
    .provider-card .row {
      border-bottom: 0;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
      gap: 24px;
      align-items: center;
      padding: 14px 20px;
      border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    }
    .row:last-child { border-bottom: 0; }
    .row.top-align { align-items: start; }
    .label {
      font-weight: 400;
      margin-bottom: 0;
    }
    .label-inline {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .prompt-enhanced-badge {
      display: inline-grid;
      width: 15px;
      height: 15px;
      place-items: center;
      color: var(--button);
    }
    .prompt-enhanced-badge svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }
    .help {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .help.path {
      margin-top: 6px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    input, select, textarea {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input);
      color: var(--fg);
      padding: 7px 10px;
      font: inherit;
    }
    select {
      appearance: none;
      color: var(--fg);
      padding-right: 42px;
    }
    select option {
      background: var(--input);
      color: var(--fg);
    }
    textarea {
      height: 104px;
      min-height: 104px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }
    .readonly-field {
      height: 200px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: color-mix(in srgb, var(--input) 72%, transparent);
      color: var(--muted);
      padding: 7px 42px 7px 10px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .readonly-wrap {
      position: relative;
      min-width: 0;
    }
    .copy-icon {
      position: absolute;
      right: 28px;
      top: 8px;
      display: inline-grid;
      width: 26px;
      min-width: 26px;
      min-height: 26px;
      place-items: center;
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0;
      background: color-mix(in srgb, var(--input) 90%, transparent);
      color: var(--muted);
      opacity: 0;
      transition: opacity 120ms ease, color 120ms ease;
    }
    .readonly-wrap:hover .copy-icon,
    .copy-icon:focus-visible,
    .copy-icon.copied {
      opacity: 1;
    }
    .copy-icon:hover,
    .copy-icon.copied {
      color: var(--fg);
    }
    .copy-icon svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
    }
    .copy-icon .success-glyph {
      display: none;
    }
    .copy-icon.copied .copy-glyph {
      display: none;
    }
    .copy-icon.copied .success-glyph {
      display: block;
    }
    .inline {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      min-width: 0;
    }
    .control-full {
      min-width: 0;
    }
    .field-stack {
      display: grid;
      gap: 8px;
    }
    /* Rows whose control stacks derived elements (e.g. a Custom input) below the
       primary control: keep the left label centered with the first control, and let
       the derived elements flow downward instead of recentering the label. */
    .row.stacked-row {
      align-items: start;
    }
    .row.stacked-row > div:first-child {
      min-height: 34px;
      display: flex;
      align-items: center;
    }
    .model-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 22px;
      align-items: center;
    }
    .model-tag {
      display: inline-flex;
      min-height: 20px;
      align-items: center;
      gap: 3px;
      border: 1px solid color-mix(in srgb, var(--fg) 14%, transparent);
      border-radius: 4px;
      padding: 1px 7px;
      background: color-mix(in srgb, var(--fg) 6%, transparent);
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .model-tag-icon {
      width: 11px;
      height: 11px;
      flex: none;
      fill: currentColor;
    }
    .model-tag-quality {
      border-color: color-mix(in srgb, var(--button) 38%, var(--border));
      color: color-mix(in srgb, var(--button) 75%, var(--fg));
    }
    .model-tag-fast {
      border-color: color-mix(in srgb, #2ea043 38%, var(--border));
      color: color-mix(in srgb, #2ea043 78%, var(--fg));
    }
    .model-tag-slow {
      border-color: color-mix(in srgb, #d29922 42%, var(--border));
      color: color-mix(in srgb, #d29922 78%, var(--fg));
    }
    .model-tag-local {
      border-color: color-mix(in srgb, #8b949e 48%, var(--border));
      color: color-mix(in srgb, #8b949e 82%, var(--fg));
    }
    .select-wrap {
      display: block;
      position: relative;
      width: 100%;
      min-width: 0;
    }
    .select-wrap select {
      display: block;
    }
    .select-wrap::after {
      content: "";
      position: absolute;
      right: 16px;
      top: 50%;
      width: 7px;
      height: 7px;
      border-right: 1.5px solid var(--muted);
      border-bottom: 1.5px solid var(--muted);
      pointer-events: none;
      transform: translateY(-62%) rotate(45deg);
    }
    .stack {
      display: grid;
      gap: 10px;
    }
    .field-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 10px;
    }
    .field-note {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .provider-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      min-width: 0;
    }
    .provider-feedback {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 2px;
      min-width: 0;
    }
    .provider-status {
      min-width: 0;
      color: var(--muted);
      text-align: right;
      overflow-wrap: anywhere;
    }
    .provider-status.failed {
      color: var(--danger);
    }
    .provider-actions .save-btn {
      min-width: 150px;
      white-space: nowrap;
    }
    button {
      min-height: 34px;
      min-width: 100px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      background: var(--button);
      color: var(--button-fg);
      font: inherit;
      cursor: pointer;
    }
    button.secondary {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
    }
    button.danger {
      border: 1px solid var(--danger);
      background: transparent;
      color: var(--danger);
    }
    button:disabled { cursor: default; }
    button.save-btn:not(:disabled):hover {
      background: var(--vscode-button-hoverBackground, color-mix(in srgb, var(--button) 86%, var(--fg)));
    }
    button.secondary:not(:disabled):hover {
      background: color-mix(in srgb, var(--fg) 7%, transparent);
      border-color: color-mix(in srgb, var(--fg) 30%, transparent);
    }
    button.danger:not(:disabled):hover {
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }
    button.save-btn:disabled {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--muted);
    }
    button.save-btn.saved {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--fg);
    }
    button.danger:disabled {
      background: color-mix(in srgb, var(--fg) 12%, transparent);
      color: var(--muted);
    }
    .status-text { color: var(--muted); }
    .shortcut-row {
      align-items: center;
    }
    .shortcut-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .shortcut-pill {
      display: inline-flex;
      align-items: center;
      justify-self: start;
      min-height: 26px;
      max-width: 100%;
      padding: 3px 10px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--fg) 8%, transparent);
      color: var(--muted);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .section-warning {
      margin-top: 8px;
      color: var(--danger);
    }
    .section-warning:empty {
      display: none;
    }
    .path-field {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      color: var(--muted);
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .check-input {
      width: 16px;
      height: 16px;
      min-height: 16px;
      accent-color: var(--accent);
    }
    .switch {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .danger-action {
      display: flex;
      justify-content: flex-end;
      align-items: flex-start;
    }
    .danger-row {
      grid-template-columns: minmax(0, 1fr) max-content;
      gap: 32px;
    }
    .danger-copy {
      min-width: 0;
    }
    .danger-row button {
      white-space: nowrap;
    }
    .danger-list {
      margin-top: 4px;
      color: var(--muted);
      overflow-wrap: anywhere;
      max-width: 92ch;
    }
    .danger-list.path {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .storage-panel {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
    }
    .storage-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .storage-primary {
      color: var(--fg);
      font-weight: 500;
    }
    .storage-secondary {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .storage-meter {
      height: 4px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--fg) 10%, transparent);
      overflow: hidden;
    }
    .storage-meter-fill {
      display: block;
      height: 100%;
      background: var(--accent);
      border-radius: inherit;
      transition: width 200ms ease;
    }
    .storage-meter[data-state="warning"] .storage-meter-fill {
      background: var(--danger);
    }
    .info-tip {
      position: relative;
      display: inline-block;
      vertical-align: middle;
      margin-left: 6px;
      color: var(--muted);
      cursor: help;
      line-height: 0;
    }
    .info-tip:hover,
    .info-tip:focus-visible {
      color: var(--fg);
      outline: none;
    }
    .info-tip > svg {
      display: block;
      width: 14px;
      height: 14px;
    }
    .info-tip .tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: max-content;
      max-width: 280px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--fg);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.5;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
      opacity: 0;
      visibility: hidden;
      transition: opacity 120ms ease, visibility 120ms;
      pointer-events: none;
      z-index: 10;
      white-space: normal;
      text-align: left;
    }
    .info-tip:hover .tooltip,
    .info-tip:focus-visible .tooltip {
      opacity: 1;
      visibility: visible;
    }
    .row .label + .help {
      margin-top: 8px;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      color: var(--muted);
      background: color-mix(in srgb, var(--fg) 7%, transparent);
    }
    .notice.warning {
      border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
      color: var(--fg);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
    }
    @media (max-width: 760px) {
      main { padding: 28px 18px 54px; }
      .row { grid-template-columns: 1fr; gap: 12px; padding: 14px 16px; }
      .danger-row { grid-template-columns: 1fr; }
      .danger-action { justify-content: flex-start; }
      .shortcut-controls { justify-content: flex-start; }
      .provider-actions {
        grid-template-columns: 1fr;
        justify-content: flex-start;
      }
      .provider-status { text-align: left; }
      .provider-actions .save-btn { justify-self: start; }
    }
    .usage-section {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    #usage-body {
      min-width: 0;
    }
    .usage-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      min-width: 0;
    }
    .usage-card {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 13px 14px;
      background: var(--panel);
      min-width: 0;
    }
    .usage-value {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .usage-caption {
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
      min-height: 16px;
      overflow-wrap: anywhere;
    }
    .usage-table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: color-mix(in srgb, var(--panel) 70%, transparent);
    }
    .usage-table {
      width: 100%;
      min-width: 700px;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }
    .usage-table th,
    .usage-table td {
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .usage-table th {
      color: var(--muted);
      font-weight: 600;
    }
    .usage-table th:nth-child(1),
    .usage-table td:nth-child(1) { width: 16%; }
    .usage-table th:nth-child(2),
    .usage-table td:nth-child(2) { width: 16%; }
    .usage-table th:nth-child(3),
    .usage-table td:nth-child(3) { width: 8%; }
    .usage-table th:nth-child(4),
    .usage-table td:nth-child(4) { width: 22%; }
    .usage-table th:nth-child(5),
    .usage-table td:nth-child(5) { width: 14%; }
    .usage-table th:nth-child(6),
    .usage-table td:nth-child(6) { width: 14%; }
    .usage-table th:nth-child(7),
    .usage-table td:nth-child(7) { width: 10%; }
    .usage-table .usage-file {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .usage-cell-stack {
      display: grid;
      gap: 1px;
      line-height: 1.25;
      min-width: 0;
    }
    .usage-cell-stack > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .usage-cell-sub {
      color: var(--muted);
      font-size: 11px;
    }
    .usage-status {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 11px;
      border: 1px solid var(--border);
    }
    .usage-status[data-status="success"] { color: var(--vscode-testing-iconPassed, #3fb950); }
    .usage-status[data-status="error"] { color: var(--danger); }
    .usage-empty {
      color: var(--muted);
      padding: 12px 0;
    }
    .usage-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      align-items: end;
      min-width: 0;
    }
    .usage-control-group {
      display: grid;
      min-width: 0;
      gap: 6px;
    }
    .usage-control-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .usage-seg {
      display: inline-flex;
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .usage-seg-btn {
      appearance: none;
      flex: 1 1 0;
      min-width: 0;
      min-height: 30px;
      border: 0;
      border-right: 1px solid var(--border);
      background: var(--input);
      color: var(--fg);
      font: inherit;
      padding: 4px 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    .usage-seg-btn:last-child { border-right: 0; }
    .usage-seg-btn.active {
      background: var(--button);
      color: var(--button-fg);
    }
    .usage-groupby {
      color: var(--muted);
    }
    .usage-groupby select {
      font: inherit;
      color: var(--fg);
      background: var(--input);
      border: 1px solid var(--border);
      border-radius: 6px;
      min-height: 30px;
      padding: 4px 8px;
    }
    .usage-charts {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: 12px;
      min-width: 0;
    }
    .usage-chart-bars { grid-column: 1 / -1; }
    .usage-chart {
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 13px 14px;
      background: color-mix(in srgb, var(--panel) 70%, transparent);
    }
    .usage-chart-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
    }
    .usage-chart-title { font-weight: 600; font-size: 12px; }
    .usage-chart-total { color: var(--muted); font-size: 11px; }
    .usage-bars-wrap { position: relative; }
    .usage-bars {
      width: 100%;
      height: 150px;
      display: block;
      border-bottom: 1px solid var(--border);
    }
    .usage-axis {
      position: relative;
      height: 16px;
      margin-top: 2px;
    }
    .usage-axis-label {
      position: absolute;
      transform: translateX(-50%);
      color: var(--muted);
      font-size: 10px;
      white-space: nowrap;
    }
    .usage-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .usage-legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .usage-legend-swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      display: inline-block;
      background: var(--muted);
    }
    .usage-seg-c0 { fill: var(--vscode-charts-blue, #4e95d9); background: var(--vscode-charts-blue, #4e95d9); }
    .usage-seg-c1 { fill: var(--vscode-charts-green, #4caf50); background: var(--vscode-charts-green, #4caf50); }
    .usage-seg-c2 { fill: var(--vscode-charts-orange, #e08a00); background: var(--vscode-charts-orange, #e08a00); }
    .usage-seg-c3 { fill: var(--vscode-charts-purple, #b180d7); background: var(--vscode-charts-purple, #b180d7); }
    .usage-seg-c4 { fill: var(--vscode-charts-red, #e51400); background: var(--vscode-charts-red, #e51400); }
    .usage-seg-c5 { fill: var(--vscode-charts-yellow, #cca700); background: var(--vscode-charts-yellow, #cca700); }
    .usage-seg-other { fill: var(--muted); background: var(--muted); }
    .usage-tops { display: flex; flex-direction: column; gap: 6px; }
    .usage-top-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(72px, 34%) max-content;
      gap: 8px;
      align-items: center;
      font-size: 12px;
    }
    .usage-top-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .usage-top-bar { background: var(--input); border-radius: 3px; height: 10px; overflow: hidden; }
    .usage-top-fill { display: block; height: 100%; background: var(--vscode-charts-blue, #4e95d9); }
    .usage-top-value { color: var(--muted); text-align: right; }
    .usage-reuse-strip {
      display: flex;
      height: 14px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--input);
    }
    .usage-reuse-seg { height: 100%; }
    .usage-reuse-seg.reused { background: var(--vscode-charts-green, #4caf50); }
    .usage-reuse-seg.translated { background: var(--vscode-charts-blue, #4e95d9); }
    .usage-reuse-seg.fallback { background: var(--vscode-charts-red, #e51400); }
    .usage-reuse-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .usage-legend-swatch.reused { background: var(--vscode-charts-green, #4caf50); }
    .usage-legend-swatch.translated { background: var(--vscode-charts-blue, #4e95d9); }
    .usage-legend-swatch.fallback { background: var(--vscode-charts-red, #e51400); }
    @media (max-width: 760px) {
      .usage-controls { grid-template-columns: 1fr; }
      .usage-charts { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <main>
      <h1>Settings</h1>
      <div id="settings">
        <h2>Keyboard Shortcuts</h2>
        <section class="card">
          <div class="row shortcut-row">
            <div>
              <div class="label">Translate Current Markdown</div>
            </div>
            <div class="shortcut-controls">
              <span class="shortcut-pill" id="shortcut-label">${escapeHtml(state.shortcutLabel)}</span>
              <button class="secondary" id="open-keyboard-shortcuts" type="button">Edit</button>
            </div>
          </div>
        </section>
        <div class="section-warning" id="shortcut-warning">${escapeHtml(shortcutWarningText)}</div>

        <h2>Provider</h2>
        <section class="card provider-card">
          <div class="row">
            <div>
              <div class="label">Provider</div>
            </div>
            <div class="control-full">
              <span class="select-wrap"><select id="providerType">${renderProviderOptions(activeProviderType)}</select></span>
            </div>
          </div>
          <div class="row" id="baseUrlRow"${providerBaseUrlHidden}>
            <div>
              <div class="label">Base URL</div>
            </div>
            <div class="control-full">
              <input id="baseUrl" value="${escapeHtml(activeProviderState.baseUrl)}">
            </div>
          </div>
          <div class="row" id="apiKeyRow"${apiKeyRowHidden}>
            <div>
              <div class="label">API Key</div>
            </div>
            <div class="control-full">
              <input id="apiKey" type="password" autocomplete="off"${apiKeyInitialAttrs}>
            </div>
          </div>
          <div class="row stacked-row">
            <div>
              <div class="label">Model ID</div>
            </div>
            <div class="control-full field-stack">
              <span class="select-wrap" id="modelIdSelectWrap"${providerModelSelectHidden}>
                <select id="modelIdSelect">${renderModelIdSelectOptions(activeProviderType, activeProviderState.modelId)}</select>
              </span>
              <input id="modelId"${providerModelInputHidden} value="${escapeHtml(activeProviderState.modelId)}" placeholder="Enter model ID">
              <div class="model-tags" id="model-tags"${providerModelTagsHidden}>${renderModelTagBadges(activeProviderModelTags)}</div>
            </div>
          </div>
          <div class="row">
            <div></div>
            <div class="provider-actions">
              <div class="provider-feedback">
                <div class="provider-status" id="provider-status"></div>
                <span class="info-tip" id="provider-mode-tip" tabindex="0" aria-label="About smaller batches" hidden><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><line x1="8" y1="7.5" x2="8" y2="11.5"></line><circle cx="8" cy="5" r="0.75" fill="currentColor" stroke="none"></circle></svg><span class="tooltip" role="tooltip">${escapeHtml(PROVIDER_SMALL_BATCH_TOOLTIP)}</span></span>
              </div>
              <button class="save-btn" type="button" id="verify-provider">Save and Verify</button>
            </div>
          </div>
        </section>

        <h2>Translation</h2>
        <section class="card">
          <div class="row stacked-row">
            <div>
              <div class="label">Target Language</div>
            </div>
            <div class="control-full field-stack">
              <span class="select-wrap"><select id="targetLanguage">${renderOptions(state.targetLanguage)}</select></span>
              <input id="targetLanguageCustom"${customLanguageHidden} value="${escapeHtml(state.targetLanguageCustom)}" placeholder="Enter target language">
            </div>
          </div>
          <div class="row top-align">
            <div>
              <div class="label label-inline" id="promptInstructionsLabel">System Instructions${promptInstructionsBadge}</div>
            </div>
            <div class="readonly-wrap">
              <div class="readonly-field" id="promptInstructions" aria-label="System instructions">${escapeHtml(promptInstructions)}</div>
              <button class="copy-icon" id="copy-system-prompt" type="button" aria-label="Copy system instructions" title="Copy system instructions">
                <svg class="copy-glyph" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="success-glyph" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="row top-align" id="customPromptRow"${customPromptRowHidden}>
            <div>
              <div class="label">Custom Instructions</div>
            </div>
            <div class="stack">
              <textarea id="customPrompt">${escapeHtml(state.customPrompt)}</textarea>
              <div class="field-actions">
                <button class="save-btn" type="button" data-field="customPrompt" data-key="translation.customPrompt" disabled>Save</button>
              </div>
            </div>
          </div>
        </section>

        <h2>Output</h2>
        <section class="card">
          <div class="row top-align">
            <div>
              <div class="label">Translation Metadata Folder</div>
              <div class="help">Stores translation metadata and cached translations.</div>
            </div>
            <div class="inline">
              <input class="path-field" id="storageRoot" value="${escapeHtml(state.storageRoot)}" readonly>
              <button class="secondary" id="reveal-storage" type="button">Reveal</button>
            </div>
          </div>
          <div class="row top-align">
            <div>
              <div class="label">Metadata Storage</div>
              <div class="help">Optimize removes the oldest cache. Translated files stay.</div>
            </div>
            <div class="storage-panel">
              <div class="storage-content">
                <div class="storage-primary">${escapeHtml(formatBytes(state.storageStats.totalBytes))} of ${escapeHtml(formatBytes(state.storageStats.quotaBytes))} used<span class="info-tip" tabindex="0" aria-label="About the storage limit"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><line x1="8" y1="7.5" x2="8" y2="11.5"></line><circle cx="8" cy="5" r="0.75" fill="currentColor" stroke="none"></circle></svg><span class="tooltip" role="tooltip">When usage reaches ${escapeHtml(formatBytes(state.storageStats.quotaBytes))}, MarkLingo automatically removes the oldest cached translations to keep storage in check. Generated Markdown files are never touched.</span></span></div>
                <div class="storage-secondary">${escapeHtml(storageStatsText)}</div>
                <div class="storage-meter" data-state="${storageMeterState}" aria-hidden="true">
                  <span class="storage-meter-fill" style="width: ${storagePercent}%"></span>
                </div>
              </div>
              <button class="secondary" id="optimize-storage" type="button">Optimize</button>
            </div>
          </div>
        </section>

        <h2>Usage</h2>
        <section class="usage-section">
          ${renderUsageControls(state.usage.query)}
          <div id="usage-body">${renderUsageSection(state.usage)}</div>
        </section>

        <h2 class="danger-title">Danger Zone</h2>
        <section class="card danger">
          <div class="row top-align danger-row">
            <div class="danger-copy">
              <div class="label">Clear Current Project Data</div>
              <div class="danger-list path">${escapeHtml(currentProjectDataDescription)}</div>
            </div>
            <div class="danger-action">
              <button class="danger" type="button" id="clear-current-project-data"${currentProjectDataDisabled}>Clear current project data</button>
            </div>
          </div>
          <div class="row top-align danger-row">
            <div class="danger-copy">
              <div class="label">Clear All Data</div>
              <div class="danger-list">Delete the saved API key, settings, metadata/cache, and tracked translated files if selected.</div>
            </div>
            <div class="danger-action">
              <button class="danger" type="button" id="clear-all-data">Clear all data</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
  ${beforeMainScript}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const CUSTOM_LANGUAGE_LABEL = ${scriptJson(CUSTOM_TARGET_LANGUAGE_LABEL)};
    const CHAT_PROMPT_INSTRUCTIONS = ${scriptJson(state.chatPromptInstructions)};
    let currentPromptInstructions = ${scriptJson(promptInstructions)};

    function getShortcutWarningText(warning) {
      if (!warning) return '';
      if (warning.includes('another command')) {
        return 'Shortcut may be unavailable because another command uses it.';
      }
      if (warning.includes('assign')) {
        return 'No active shortcut. Edit keyboard shortcuts to assign one.';
      }
      return warning;
    }

    const textByKey = new Map();
    let nextSaveId = 1;

    document.querySelectorAll('.save-btn').forEach((button) => {
      const fieldId = button.getAttribute('data-field');
      const key = button.getAttribute('data-key');
      const input = fieldId ? document.getElementById(fieldId) : null;
      if (!input || !key) return;
      const state = { input, button, baseline: input.value, timer: undefined, pendingSaveId: undefined, pendingValue: undefined };
      textByKey.set(key, state);
      input.addEventListener('input', () => {
        if (state.timer) { clearTimeout(state.timer); state.timer = undefined; }
        button.classList.remove('saved');
        button.textContent = 'Save';
        button.disabled = input.value === state.baseline;
      });
      button.addEventListener('click', () => {
        if (input.value === state.baseline) return;
        const saveId = nextSaveId++;
        state.pendingSaveId = saveId;
        state.pendingValue = input.value;
        button.textContent = 'Saving...';
        button.disabled = true;
        vscode.postMessage({ type: 'updateSetting', key: key, value: input.value, saveId: saveId });
      });
    });

    function registerInstant(id, key) {
      const control = document.getElementById(id);
      if (!control) return;
      control.addEventListener('change', () => {
        vscode.postMessage({ type: 'updateSetting', key: key, value: control.value });
        if (id === 'targetLanguage') syncCustomLanguageVisibility(true);
      });
    }

    const targetLanguageSelect = document.getElementById('targetLanguage');
    const customLanguageInput = document.getElementById('targetLanguageCustom');
    function syncCustomLanguageVisibility(focus) {
      const isCustom = targetLanguageSelect && targetLanguageSelect.value === CUSTOM_LANGUAGE_LABEL;
      if (customLanguageInput) {
        customLanguageInput.hidden = !isCustom;
        if (isCustom && focus) customLanguageInput.focus();
      }
    }
    if (customLanguageInput) {
      customLanguageInput.addEventListener('change', () => {
        vscode.postMessage({ type: 'updateSetting', key: 'translation.targetLanguageCustom', value: customLanguageInput.value });
      });
    }

    registerInstant('targetLanguage', 'translation.targetLanguage');
    syncCustomLanguageVisibility(false);

    const API_KEY_MASK_VALUE = ${scriptJson(API_KEY_MASK_VALUE)};
    const PROVIDER_SMALL_BATCH_STATUS = ${scriptJson(PROVIDER_SMALL_BATCH_STATUS)};
    const PROVIDER_SMALL_BATCH_TOOLTIP = ${scriptJson(PROVIDER_SMALL_BATCH_TOOLTIP)};
    const MODEL_TAG_LABELS = ${scriptJson(MODEL_TAG_LABELS)};
    const MODEL_TAG_ICONS = ${scriptJson(MODEL_TAG_ICONS)};
    const KNOWN_LOCAL_MODEL_TAG_RULES = ${scriptJson(KNOWN_LOCAL_MODEL_TAG_RULES)};
    const providerTypeSelect = document.getElementById('providerType');
    const baseUrlRow = document.getElementById('baseUrlRow');
    const baseUrlInput = document.getElementById('baseUrl');
    const apiKeyRow = document.getElementById('apiKeyRow');
    const modelIdInput = document.getElementById('modelId');
    const modelIdSelectWrap = document.getElementById('modelIdSelectWrap');
    const modelIdSelect = document.getElementById('modelIdSelect');
    const modelTags = document.getElementById('model-tags');
    const apiKeyInput = document.getElementById('apiKey');
    const verifyProviderBtn = document.getElementById('verify-provider');
    const providerStatus = document.getElementById('provider-status');
    const providerModeTip = document.getElementById('provider-mode-tip');
    const promptInstructions = document.getElementById('promptInstructions');
    const promptInstructionsLabel = document.getElementById('promptInstructionsLabel');
    const customPromptRow = document.getElementById('customPromptRow');
    const customPromptInput = document.getElementById('customPrompt');
    let nextProviderSaveId = 1;
    let providerPending; // { saveId, providerType, baseUrl, modelId }
    let providerSuccessTimer;
    let providerSuccessVisible = false;
    const providerClientPresets = ${scriptJson(providerClientPresets)};
    const activeProvider = {
      providerType: ${scriptJson(activeProviderType)},
      baseUrl: ${scriptJson(activeProviderState.baseUrl)},
      modelId: ${scriptJson(activeProviderState.modelId)},
    };
    const providerBaselines = ${scriptJson(providerBaselines)};
    const providerDrafts = ${scriptJson(providerDrafts)};
    let selectedProviderType = activeProvider.providerType;
    let providerSelectionTouched = false;
    // True when the free-text model input drives the value instead of the preset dropdown.
    let modelCustomMode = false;

    function getProviderPreset(providerType) {
      return providerClientPresets[providerType] || providerClientPresets.openrouter;
    }

    function getProviderModelOptions(providerType) {
      return getProviderPreset(providerType).modelOptions || [];
    }

    function providerSupportsKey(providerType) {
      return Boolean(getProviderPreset(providerType).supportsApiKey);
    }

    function providerRequiresKey(providerType) {
      return Boolean(getProviderPreset(providerType).requiresApiKey);
    }

    function providerModelIdEditable(providerType) {
      return Boolean(getProviderPreset(providerType).modelIdEditable);
    }

    function providerHasModelOptions(providerType) {
      return getProviderModelOptions(providerType).some((option) => option.modelId);
    }

    function modelIdMatchesConcreteOption(providerType, modelId) {
      const trimmed = String(modelId || '').trim();
      if (!trimmed) return false;
      return getProviderModelOptions(providerType).some((option) => option.modelId && option.modelId === trimmed);
    }

    function computeModelCustomMode(providerType, modelId) {
      if (!providerModelIdEditable(providerType)) return false;
      if (!providerHasModelOptions(providerType)) return true;
      return !modelIdMatchesConcreteOption(providerType, modelId);
    }

    function uniqueModelTags(tags) {
      const seen = new Set();
      const result = [];
      for (const tag of tags) {
        if (seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
      }
      return result;
    }

    // Keep this endpoint heuristic in sync with providerPresets.ts.
    function parseIpv4Literal(hostname) {
      const parts = String(hostname || '').split('.');
      if (parts.length !== 4) return undefined;
      const octets = parts.map((part) => /^\\d{1,3}$/.test(part) ? Number(part) : Number.NaN);
      return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
        ? octets
        : undefined;
    }

    function isLocalIpv4Literal(hostname) {
      const octets = parseIpv4Literal(hostname);
      if (!octets) return false;
      const first = octets[0];
      const second = octets[1];
      return (
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      );
    }

    function isLocalEndpointValue(baseUrl) {
      let url;
      try {
        url = new URL(String(baseUrl || '').trim());
      } catch {
        return false;
      }
      const host = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, '');
      return (
        host === 'localhost' ||
        host === '::1' ||
        host.endsWith('.local') ||
        isLocalIpv4Literal(host)
      );
    }

    function getKnownLocalModelTags(modelId) {
      const trimmed = String(modelId || '').trim();
      if (!trimmed) return [];
      for (const rule of KNOWN_LOCAL_MODEL_TAG_RULES) {
        if (new RegExp(rule.pattern, rule.flags || '').test(trimmed)) return uniqueModelTags(rule.tags || []);
      }
      return [];
    }

    function getSelectedModelTags(providerType, baseUrl, modelId) {
      const trimmed = String(modelId || '').trim();
      const option = getProviderModelOptions(providerType).find((item) => item.modelId === trimmed);
      if (option && option.tags) return uniqueModelTags(option.tags);
      if (providerType === 'openaiCompatible' && isLocalEndpointValue(baseUrl)) {
        return uniqueModelTags(['local'].concat(getKnownLocalModelTags(trimmed)));
      }
      return [];
    }

    function renderSelectedModelTags() {
      if (!modelTags) return;
      const values = getProviderValues();
      const tags = getSelectedModelTags(values.providerType, values.baseUrl, values.modelId);
      modelTags.textContent = '';
      modelTags.hidden = tags.length === 0;
      for (const tag of tags) {
        const el = document.createElement('span');
        el.className = 'model-tag model-tag-' + tag;
        const icon = MODEL_TAG_ICONS[tag];
        if (icon) el.innerHTML = icon;
        el.appendChild(document.createTextNode(MODEL_TAG_LABELS[tag] || tag));
        modelTags.appendChild(el);
      }
    }

    function ensureProviderDraft(providerType) {
      if (providerDrafts[providerType]) return providerDrafts[providerType];
      const preset = getProviderPreset(providerType);
      providerDrafts[providerType] = {
        baseUrl: preset.defaultBaseUrl || '',
        modelId: preset.defaultModelId || '',
        hasApiKey: false,
        apiKeyInput: '',
      };
      return providerDrafts[providerType];
    }

    function isApiKeyMasked() {
      return apiKeyInput.dataset.masked === 'true';
    }

    function showApiKeyMask() {
      apiKeyInput.value = API_KEY_MASK_VALUE;
      apiKeyInput.dataset.masked = 'true';
      apiKeyInput.scrollLeft = 0;
    }

    function showEmptyApiKey() {
      apiKeyInput.value = '';
      apiKeyInput.dataset.masked = 'false';
      apiKeyInput.scrollLeft = 0;
    }

    function clearApiKeyMaskForEntry() {
      if (!isApiKeyMasked()) return;
      showEmptyApiKey();
      updateProviderVerificationState();
    }

    function getProviderValues() {
      const providerType = providerTypeSelect.value;
      return {
        providerType,
        baseUrl: baseUrlInput.value.trim(),
        modelId: providerModelIdEditable(providerType)
          ? modelIdInput.value.trim()
          : (modelIdSelect.value.trim() || modelIdInput.value.trim()),
      };
    }

    function renderSelectOptions(select, options, selectedValue, includeCustom) {
      if (!select) return;
      select.textContent = '';
      for (const option of options) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        el.selected = option.value === selectedValue;
        select.appendChild(el);
      }
      if (includeCustom) {
        const custom = document.createElement('option');
        custom.value = '';
        custom.textContent = 'Custom...';
        custom.selected = !options.some((option) => option.value === selectedValue);
        select.appendChild(custom);
      }
    }

    function syncModelIdSelection() {
      const providerType = providerTypeSelect.value;
      const modelId = modelIdInput.value.trim();
      const concreteOptions = getProviderModelOptions(providerType)
        .filter((option) => option.modelId)
        .map((option) => ({ label: option.modelId, value: option.modelId }));
      if (!providerModelIdEditable(providerType) && concreteOptions.length > 0 && !concreteOptions.some((option) => option.value === modelId)) {
        modelIdInput.value = concreteOptions[0].value;
      }
      const selectedModelId = modelIdInput.value.trim();
      const selectedSelectValue = modelCustomMode
        ? ''
        : (concreteOptions.some((option) => option.value === selectedModelId) ? selectedModelId : '');
      renderSelectOptions(modelIdSelect, concreteOptions, selectedSelectValue, providerModelIdEditable(providerType));
      renderSelectedModelTags();
    }

    function syncProviderBaseUrlVisibility() {
      const preset = getProviderPreset(providerTypeSelect.value);
      if (baseUrlRow) baseUrlRow.hidden = !preset.baseUrlEditable;
      if (baseUrlInput) baseUrlInput.disabled = !preset.baseUrlEditable;
    }

    function syncProviderModelVisibility() {
      const hasOptions = providerHasModelOptions(providerTypeSelect.value);
      // Render the dropdown first so its selected value reflects the current model id.
      syncModelIdSelection();
      if (modelIdSelectWrap) modelIdSelectWrap.hidden = !hasOptions;
      if (modelIdSelect) modelIdSelect.disabled = !hasOptions;
      // The free-text input only appears in custom mode and sits below the dropdown.
      if (modelIdInput) {
        modelIdInput.hidden = !modelCustomMode;
        modelIdInput.disabled = !modelCustomMode;
      }
    }

    function syncProviderApiKeyVisibility() {
      const supportsKey = providerSupportsKey(providerTypeSelect.value);
      if (apiKeyRow) apiKeyRow.hidden = !supportsKey;
      apiKeyInput.disabled = !supportsKey;
      if (!supportsKey) showEmptyApiKey();
    }

    function getProviderBaseline(providerType) {
      return providerBaselines[providerType] || providerBaselines.openrouter;
    }

    function hasVerifiedProvider(providerType, baseline) {
      return Boolean(
        baseline &&
        (!providerRequiresKey(providerType) || baseline.hasApiKey) &&
        baseline.verifiedAdapterMode
      );
    }

    function valuesMatchProvider(values, provider) {
      return values.baseUrl === provider.baseUrl && values.modelId === provider.modelId;
    }

    function valuesMatchActiveProvider(values) {
      return (
        values.providerType === activeProvider.providerType &&
        values.baseUrl === activeProvider.baseUrl &&
        values.modelId === activeProvider.modelId
      );
    }

    function saveProviderDraft(providerType) {
      const draft = ensureProviderDraft(providerType);
      draft.baseUrl = baseUrlInput.value.trim();
      draft.modelId = providerModelIdEditable(providerType)
        ? modelIdInput.value.trim()
        : (modelIdSelect.value.trim() || modelIdInput.value.trim());
      if (!providerSupportsKey(providerType)) {
        draft.hasApiKey = false;
        draft.apiKeyInput = '';
        return;
      }
      if (isApiKeyMasked()) {
        draft.apiKeyInput = '';
        return;
      }
      draft.apiKeyInput = apiKeyInput.value.trim();
      draft.hasApiKey = false;
    }

    function saveCurrentProviderDraft() {
      saveProviderDraft(selectedProviderType);
    }

    function loadProviderDraft(providerType) {
      const draft = ensureProviderDraft(providerType);
      selectedProviderType = providerType;
      providerTypeSelect.value = providerType;
      baseUrlInput.value = draft.baseUrl;
      modelIdInput.value = draft.modelId;
      modelCustomMode = computeModelCustomMode(providerType, draft.modelId);
      if (!providerSupportsKey(providerType)) {
        showEmptyApiKey();
      } else if (draft.hasApiKey) {
        showApiKeyMask();
      } else {
        showEmptyApiKey();
        apiKeyInput.value = draft.apiKeyInput || '';
      }
      syncProviderBaseUrlVisibility();
      syncProviderModelVisibility();
      syncProviderApiKeyVisibility();
    }

    function isProviderDirty() {
      const values = getProviderValues();
      const apiKeyChanged = providerSupportsKey(values.providerType) && !isApiKeyMasked() && apiKeyInput.value.trim().length > 0;
      const baseline = getProviderBaseline(values.providerType);
      return (
        apiKeyChanged ||
        providerSelectionTouched ||
        !hasVerifiedProvider(values.providerType, baseline) ||
        !valuesMatchProvider(values, baseline) ||
        !valuesMatchActiveProvider(values)
      );
    }

    function canVerifyProvider() {
      const values = getProviderValues();
      const hasRequiredBaseUrl = values.baseUrl.length > 0;
      const hasRequiredModelId = values.modelId.length > 0;
      const hasRequiredApiKey = !providerRequiresKey(values.providerType) || isApiKeyMasked() || apiKeyInput.value.trim().length > 0;
      return hasRequiredBaseUrl && hasRequiredModelId && hasRequiredApiKey;
    }

    function setProviderStatus(text, failed) {
      providerStatus.textContent = text || '';
      providerStatus.title = text === PROVIDER_SMALL_BATCH_STATUS ? PROVIDER_SMALL_BATCH_TOOLTIP : text || '';
      providerStatus.classList.toggle('failed', Boolean(failed));
    }

    function syncProviderModeTip(baseline) {
      if (!providerModeTip) return;
      providerModeTip.hidden = !(baseline && baseline.verifiedAdapterMode === 'translationModel');
    }

    function clearProviderSuccessFeedback() {
      providerSuccessVisible = false;
      if (providerSuccessTimer) {
        clearTimeout(providerSuccessTimer);
        providerSuccessTimer = undefined;
      }
    }

    function showProviderSuccessFeedback() {
      clearProviderSuccessFeedback();
      providerSuccessVisible = true;
      providerSuccessTimer = setTimeout(() => {
        providerSuccessVisible = false;
        providerSuccessTimer = undefined;
        updateProviderVerificationState();
      }, 2500);
    }

    function renderPromptEnhancedBadge(note) {
      const title = note || 'MarkLingo uses a model-specific optimized prompt for this translation model.';
      return '<span class="prompt-enhanced-badge" title="' + escapeAttr(title) + '" aria-label="' + escapeAttr(title) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.4 5.2 5.6.7-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5-4.1-3.8 5.6-.7L12 3.5z"></path></svg>' +
        '</span>';
    }

    function escapeAttr(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function syncTranslationPromptState(baseline) {
      const adapterMode = baseline && baseline.verifiedAdapterMode;
      const isTranslationModel = adapterMode === 'translationModel';
      const nextPrompt = isTranslationModel && baseline.promptInstructions
        ? baseline.promptInstructions
        : CHAT_PROMPT_INSTRUCTIONS;
      currentPromptInstructions = nextPrompt;
      if (promptInstructions) promptInstructions.textContent = nextPrompt;
      if (promptInstructionsLabel) {
        promptInstructionsLabel.innerHTML = 'System Instructions' +
          (isTranslationModel && baseline.promptInstructionsEnhanced
            ? renderPromptEnhancedBadge(baseline.promptInstructionsEnhancementNote)
            : '');
      }
      if (customPromptRow) customPromptRow.hidden = isTranslationModel;
    }

    function getProviderSuccessStatus(baseline) {
      if (!providerSuccessVisible || !baseline || baseline.verifiedAdapterMode !== 'translationModel') return '';
      return PROVIDER_SMALL_BATCH_STATUS;
    }

    function updateProviderVerificationState() {
      if (providerPending) return;
      const values = getProviderValues();
      const baseline = getProviderBaseline(values.providerType);
      const providerIsVerified = hasVerifiedProvider(values.providerType, baseline);
      const dirty = isProviderDirty();
      verifyProviderBtn.disabled = !dirty || !canVerifyProvider();
      verifyProviderBtn.textContent = !dirty && providerSuccessVisible ? 'Saved and Verified' : 'Save and Verify';
      verifyProviderBtn.classList.toggle('saved', !dirty && providerIsVerified && providerSuccessVisible);
      if (dirty) {
        setProviderStatus('', false);
        syncProviderModeTip(undefined);
        syncTranslationPromptState(undefined);
      } else if (providerIsVerified) {
        setProviderStatus(getProviderSuccessStatus(baseline), false);
        syncProviderModeTip(baseline);
        syncTranslationPromptState(baseline);
      } else {
        setProviderStatus('', false);
        syncProviderModeTip(undefined);
        syncTranslationPromptState(undefined);
      }
    }

    function handleProviderInput() {
      clearProviderSuccessFeedback();
      saveCurrentProviderDraft();
      syncProviderBaseUrlVisibility();
      syncProviderModelVisibility();
      syncProviderApiKeyVisibility();
      updateProviderVerificationState();
    }

    function handleModelIdSelectChange() {
      if (!modelIdSelect) return;
      clearProviderSuccessFeedback();
      const providerType = providerTypeSelect.value;
      const selectedModelId = modelIdSelect.value.trim();
      if (selectedModelId) {
        modelCustomMode = false;
        modelIdInput.value = selectedModelId;
      } else if (providerModelIdEditable(providerType)) {
        modelCustomMode = true;
        modelIdInput.value = '';
      }
      saveCurrentProviderDraft();
      syncProviderModelVisibility();
      if (modelCustomMode && modelIdInput && !modelIdInput.hidden) modelIdInput.focus();
      updateProviderVerificationState();
    }

    providerTypeSelect.addEventListener('change', () => {
      const nextProviderType = providerTypeSelect.value;
      clearProviderSuccessFeedback();
      saveCurrentProviderDraft();
      providerSelectionTouched = true;
      loadProviderDraft(nextProviderType);
      updateProviderVerificationState();
    });
    baseUrlInput.addEventListener('input', handleProviderInput);
    if (modelIdSelect) modelIdSelect.addEventListener('change', handleModelIdSelectChange);
    modelIdInput.addEventListener('input', handleProviderInput);
    apiKeyInput.addEventListener('beforeinput', clearApiKeyMaskForEntry);
    apiKeyInput.addEventListener('paste', clearApiKeyMaskForEntry);
    apiKeyInput.addEventListener('keydown', (event) => {
      if (!isApiKeyMasked()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        clearApiKeyMaskForEntry();
      }
    });
    apiKeyInput.addEventListener('input', handleProviderInput);
    verifyProviderBtn.addEventListener('click', () => {
      if (providerPending) return;
      clearProviderSuccessFeedback();
      saveCurrentProviderDraft();
      const values = getProviderValues();
      const saveId = nextProviderSaveId++;
      providerPending = {
        saveId,
        providerType: values.providerType,
        baseUrl: values.baseUrl,
        modelId: values.modelId,
      };
      verifyProviderBtn.textContent = 'Verifying...';
      verifyProviderBtn.disabled = true;
      verifyProviderBtn.classList.remove('saved');
      setProviderStatus('', false);
      vscode.postMessage({
        type: 'verifyProvider',
        providerType: values.providerType,
        baseUrl: values.baseUrl,
        apiKey: isApiKeyMasked() ? '' : apiKeyInput.value.trim(),
        modelId: values.modelId,
        saveId,
      });
    });
    loadProviderDraft(activeProvider.providerType);
    updateProviderVerificationState();

    function handleSaved(key, saveId, value) {
      const text = textByKey.get(key);
      if (text) {
        if (saveId !== undefined && text.pendingSaveId !== saveId) return;
        const pendingValue = text.pendingValue;
        const savedValue = value === undefined || value === null ? pendingValue : String(value);
        text.pendingSaveId = undefined;
        text.pendingValue = undefined;
        text.baseline = savedValue;
        if (text.timer) clearTimeout(text.timer);
        if (text.input.value === pendingValue) {
          text.input.value = savedValue;
          text.button.disabled = true;
          text.button.textContent = 'Saved';
          text.button.classList.add('saved');
          text.timer = setTimeout(() => {
            text.button.textContent = 'Save';
            text.button.classList.remove('saved');
            text.timer = undefined;
          }, 2500);
        } else {
          text.button.textContent = 'Save';
          text.button.classList.remove('saved');
          text.button.disabled = text.input.value === text.baseline;
          text.timer = undefined;
        }
        return;
      }
    }

    function handleSaveFailed(key, saveId) {
      const text = textByKey.get(key);
      if (!text || (saveId !== undefined && text.pendingSaveId !== saveId)) return;
      text.pendingSaveId = undefined;
      text.pendingValue = undefined;
      text.button.textContent = 'Save';
      text.button.classList.remove('saved');
      text.button.disabled = text.input.value === text.baseline;
    }

    const clearCurrentProjectDataBtn = document.getElementById('clear-current-project-data');
    clearCurrentProjectDataBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearCurrentProjectData' });
    });
    const clearAllDataBtn = document.getElementById('clear-all-data');
    clearAllDataBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearAllData' });
    });

    const copySystemPromptBtn = document.getElementById('copy-system-prompt');
    let copySystemPromptTimer;
    copySystemPromptBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copySystemPrompt', value: currentPromptInstructions });
      copySystemPromptBtn.classList.add('copied');
      copySystemPromptBtn.setAttribute('aria-label', 'System instructions copied');
      copySystemPromptBtn.setAttribute('title', 'Copied');
      if (copySystemPromptTimer) clearTimeout(copySystemPromptTimer);
      copySystemPromptTimer = setTimeout(() => {
        copySystemPromptBtn.classList.remove('copied');
        copySystemPromptBtn.setAttribute('aria-label', 'Copy system instructions');
        copySystemPromptBtn.setAttribute('title', 'Copy system instructions');
        copySystemPromptTimer = undefined;
      }, 1600);
    });

    document.getElementById('open-keyboard-shortcuts').addEventListener('click', () => vscode.postMessage({ type: 'openKeyboardShortcuts' }));
    document.getElementById('reveal-storage').addEventListener('click', () => vscode.postMessage({ type: 'revealStorage' }));
    document.getElementById('optimize-storage').addEventListener('click', () => vscode.postMessage({ type: 'optimizeStorage' }));

    const usageQuery = ${JSON.stringify(state.usage.query)};
    const usageBody = document.getElementById('usage-body');
    const usageControls = document.querySelector('.usage-controls');
    const requestUsage = () => vscode.postMessage({
      type: 'usageQuery',
      range: usageQuery.range,
      groupBy: usageQuery.groupBy,
      scope: usageQuery.scope,
      breakdown: usageQuery.breakdown,
    });
    if (usageControls) {
      usageControls.addEventListener('click', (event) => {
        const button = event.target.closest('.usage-seg-btn');
        if (!button || !usageControls.contains(button)) return;
        const control = button.getAttribute('data-usage-control');
        const value = button.getAttribute('data-value');
        if (!control || value === null || usageQuery[control] === value) return;
        usageQuery[control] = value;
        const group = button.parentElement;
        if (group) {
          group.querySelectorAll('.usage-seg-btn').forEach((sibling) => {
            sibling.classList.toggle('active', sibling === button);
          });
        }
        requestUsage();
      });
      usageControls.addEventListener('change', (event) => {
        const select = event.target.closest('select[data-usage-control]');
        if (!select) return;
        const control = select.getAttribute('data-usage-control');
        if (!control) return;
        usageQuery[control] = select.value;
        requestUsage();
      });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'usageSection') {
        if (usageBody && typeof msg.html === 'string') usageBody.innerHTML = msg.html;
        return;
      }
      if (msg.type === 'saved') {
        handleSaved(msg.key, msg.saveId, msg.value);
        return;
      }
      if (msg.type === 'saveFailed') {
        handleSaveFailed(msg.key, msg.saveId);
        return;
      }
      if (msg.type === 'providerVerification') {
        if (!providerPending || (msg.saveId !== undefined && providerPending.saveId !== msg.saveId)) return;
        const pending = providerPending;
        providerPending = undefined;
        if (msg.ok) {
          const verifiedProviderType = msg.providerType || pending.providerType;
          const verifiedBaseUrl = msg.baseUrl || pending.baseUrl;
          const verifiedModelId = msg.modelId || pending.modelId;
          activeProvider.providerType = verifiedProviderType;
          activeProvider.baseUrl = verifiedBaseUrl;
          activeProvider.modelId = verifiedModelId;
          providerBaselines[verifiedProviderType] = {
            baseUrl: verifiedBaseUrl,
            modelId: verifiedModelId,
            hasApiKey: Boolean(msg.hasKey),
            verifiedAdapterMode: msg.adapterMode || '',
            promptInstructions: msg.promptInstructions || CHAT_PROMPT_INSTRUCTIONS,
            promptInstructionsEnhanced: Boolean(msg.promptInstructionsEnhanced),
            promptInstructionsEnhancementNote: msg.promptInstructionsEnhancementNote || '',
          };
          providerDrafts[verifiedProviderType] = {
            baseUrl: verifiedBaseUrl,
            modelId: verifiedModelId,
            hasApiKey: Boolean(msg.hasKey),
            apiKeyInput: '',
          };
          providerSelectionTouched = false;
          if (providerTypeSelect.value === verifiedProviderType) {
            baseUrlInput.value = verifiedBaseUrl;
            modelIdInput.value = verifiedModelId;
            if (!providerSupportsKey(verifiedProviderType)) {
              showEmptyApiKey();
            } else if (msg.hasKey) {
              showApiKeyMask();
            } else {
              showEmptyApiKey();
            }
          }
          syncProviderBaseUrlVisibility();
          syncProviderModelVisibility();
          syncProviderApiKeyVisibility();
          showProviderSuccessFeedback();
          updateProviderVerificationState();
          return;
        }
        clearProviderSuccessFeedback();
        verifyProviderBtn.textContent = 'Save and Verify';
        verifyProviderBtn.disabled = false;
        verifyProviderBtn.classList.remove('saved');
        syncProviderModeTip(undefined);
        setProviderStatus(msg.message || 'Verification failed.', true);
        return;
      }
      if (msg.type === 'shortcutState') {
        const label = document.getElementById('shortcut-label');
        const statusEl = document.getElementById('shortcut-status');
        const warn = document.getElementById('shortcut-warning');
        if (label) label.textContent = msg.shortcutLabel || '';
        if (statusEl) statusEl.textContent = msg.shortcutStatus || '';
        if (warn) {
          warn.textContent = getShortcutWarningText(msg.shortcutWarning || '');
        }
        return;
      }
    });
  </script>
</body>
</html>`;
}
