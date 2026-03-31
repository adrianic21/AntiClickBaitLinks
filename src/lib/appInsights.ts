import type { Provider } from '../services/geminiService';

export interface CachedSummaryEntry {
  key: string;
  summary: string;
  title: string;
  createdAt: number;
}

export interface ProviderMetrics {
  provider: Provider;
  attempts: number;
  successes: number;
  fallbacks: number;
  authFailures: number;
  transientFailures: number;
  estimatedCostUnits: number;
  lastUsedAt: number | null;
}

export interface AppInsights {
  savedSummaries: number;
  totalMinutesSaved: number;
}

const CACHE_KEY = 'summary_cache_v1';
const APP_INSIGHTS_KEY = 'app_insights_v2';
const PROVIDER_METRICS_KEY = 'provider_metrics_v1';
const MAX_CACHE_ITEMS = 40;

const PROVIDER_COST_UNITS: Record<Provider, number> = {
  gemini: 1,
  openrouter: 2,
  mistral: 2,
  deepseek: 1,
};

const EMPTY_INSIGHTS: AppInsights = {
  savedSummaries: 0,
  totalMinutesSaved: 0,
};

const EMPTY_PROVIDER_METRICS: Record<Provider, ProviderMetrics> = {
  gemini: createEmptyProviderMetrics('gemini'),
  openrouter: createEmptyProviderMetrics('openrouter'),
  mistral: createEmptyProviderMetrics('mistral'),
  deepseek: createEmptyProviderMetrics('deepseek'),
};

let cachedSummariesMemory: CachedSummaryEntry[] | null = null;
let appInsightsMemory: AppInsights | null = null;
let providerMetricsMemory: Record<Provider, ProviderMetrics> | null = null;

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getCachedSummaries(): CachedSummaryEntry[] {
  if (cachedSummariesMemory) return cachedSummariesMemory;
  cachedSummariesMemory = safeJsonParse<CachedSummaryEntry[]>(localStorage.getItem(CACHE_KEY), []);
  return cachedSummariesMemory;
}

export function findCachedSummary(key: string): CachedSummaryEntry | undefined {
  return getCachedSummaries().find((entry) => entry.key === key);
}

export function saveCachedSummary(entry: CachedSummaryEntry): void {
  const next = [
    entry,
    ...getCachedSummaries().filter((item) => item.key !== entry.key),
  ].slice(0, MAX_CACHE_ITEMS);

  cachedSummariesMemory = next;
  localStorage.setItem(CACHE_KEY, JSON.stringify(next));
}

export function getAppInsights(): AppInsights {
  if (appInsightsMemory) return appInsightsMemory;
  appInsightsMemory = safeJsonParse<AppInsights>(localStorage.getItem(APP_INSIGHTS_KEY), EMPTY_INSIGHTS);
  return appInsightsMemory;
}

export function saveAppInsights(insights: AppInsights): void {
  appInsightsMemory = insights;
  localStorage.setItem(APP_INSIGHTS_KEY, JSON.stringify(insights));
}

export function recordSavedSummary(minutesSaved: number): AppInsights {
  const current = getAppInsights();
  const next: AppInsights = {
    savedSummaries: current.savedSummaries + 1,
    totalMinutesSaved: Math.max(0, Math.round((current.totalMinutesSaved + minutesSaved) * 10) / 10),
  };
  saveAppInsights(next);
  return next;
}

export function getProviderMetrics(): Record<Provider, ProviderMetrics> {
  if (providerMetricsMemory) return providerMetricsMemory;
  providerMetricsMemory = safeJsonParse<Record<Provider, ProviderMetrics>>(
    localStorage.getItem(PROVIDER_METRICS_KEY),
    EMPTY_PROVIDER_METRICS
  );
  return providerMetricsMemory;
}

export function saveProviderMetrics(metrics: Record<Provider, ProviderMetrics>): void {
  providerMetricsMemory = metrics;
  localStorage.setItem(PROVIDER_METRICS_KEY, JSON.stringify(metrics));
}

export function recordProviderMetric(
  provider: Provider,
  outcome: 'attempt' | 'success' | 'fallback' | 'auth_failure' | 'transient_failure'
): Record<Provider, ProviderMetrics> {
  return recordProviderMetrics([[provider, outcome]]);
}

export function recordProviderMetrics(
  operations: Array<[Provider, 'attempt' | 'success' | 'fallback' | 'auth_failure' | 'transient_failure']>
): Record<Provider, ProviderMetrics> {
  const metrics = {
    ...getProviderMetrics(),
  };
  const now = Date.now();

  for (const [provider, outcome] of operations) {
    const current = metrics[provider] || createEmptyProviderMetrics(provider);
    current.lastUsedAt = now;

    switch (outcome) {
      case 'attempt':
        current.attempts += 1;
        current.estimatedCostUnits += PROVIDER_COST_UNITS[provider];
        break;
      case 'success':
        current.successes += 1;
        break;
      case 'fallback':
        current.fallbacks += 1;
        break;
      case 'auth_failure':
        current.authFailures += 1;
        break;
      case 'transient_failure':
        current.transientFailures += 1;
        break;
    }

    metrics[provider] = current;
  }

  saveProviderMetrics(metrics);
  return metrics;
}

export function createEmptyProviderMetrics(provider: Provider): ProviderMetrics {
  return {
    provider,
    attempts: 0,
    successes: 0,
    fallbacks: 0,
    authFailures: 0,
    transientFailures: 0,
    estimatedCostUnits: 0,
    lastUsedAt: null,
  };
}

export function estimateMinutesSaved(articleLength: number, summaryLength: number): number {
  const articleWords = Math.max(1, Math.round(articleLength / 5));
  const summaryWords = Math.max(1, Math.round(summaryLength / 5));
  const articleMinutes = articleWords / 220;
  const summaryMinutes = summaryWords / 220;
  return Math.max(1, Math.round((articleMinutes - summaryMinutes) * 10) / 10);
}
