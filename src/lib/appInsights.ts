import type { Provider } from '../services/geminiService';

export interface CachedSummaryEntry {
  key: string;
  summary: string;
  title: string;
  createdAt: number;
}

export interface SummaryHistoryEntry {
  id: string;
  url: string;
  title: string;
  summary: string;
  sourceHost: string;
  createdAt: number;
  language: string;
  length: 'short' | 'medium' | 'long' | 'child';
  provider: Provider;
  minutesSaved: number;
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
  topSources: Array<{ host: string; count: number }>;
}

const HISTORY_KEY = 'summary_history_v1';
const CACHE_KEY = 'summary_cache_v1';
const PROVIDER_METRICS_KEY = 'provider_metrics_v1';
const MAX_HISTORY_ITEMS = 30;
const MAX_CACHE_ITEMS = 40;

const PROVIDER_COST_UNITS: Record<Provider, number> = {
  gemini: 1,
  openrouter: 2,
  mistral: 2,
  deepseek: 1,
};

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getCachedSummaries(): CachedSummaryEntry[] {
  return safeJsonParse<CachedSummaryEntry[]>(localStorage.getItem(CACHE_KEY), []);
}

export function findCachedSummary(key: string): CachedSummaryEntry | undefined {
  return getCachedSummaries().find((entry) => entry.key === key);
}

export function saveCachedSummary(entry: CachedSummaryEntry): void {
  const next = [
    entry,
    ...getCachedSummaries().filter((item) => item.key !== entry.key),
  ].slice(0, MAX_CACHE_ITEMS);

  localStorage.setItem(CACHE_KEY, JSON.stringify(next));
}

export function getSummaryHistory(): SummaryHistoryEntry[] {
  return safeJsonParse<SummaryHistoryEntry[]>(localStorage.getItem(HISTORY_KEY), []);
}

export function saveSummaryHistoryEntry(entry: SummaryHistoryEntry): SummaryHistoryEntry[] {
  const next = [
    entry,
    ...getSummaryHistory().filter((item) => item.id !== entry.id),
  ].slice(0, MAX_HISTORY_ITEMS);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function getProviderMetrics(): Record<Provider, ProviderMetrics> {
  const fallback = {
    gemini: createEmptyProviderMetrics('gemini'),
    openrouter: createEmptyProviderMetrics('openrouter'),
    mistral: createEmptyProviderMetrics('mistral'),
    deepseek: createEmptyProviderMetrics('deepseek'),
  };

  return safeJsonParse<Record<Provider, ProviderMetrics>>(
    localStorage.getItem(PROVIDER_METRICS_KEY),
    fallback
  );
}

export function saveProviderMetrics(metrics: Record<Provider, ProviderMetrics>): void {
  localStorage.setItem(PROVIDER_METRICS_KEY, JSON.stringify(metrics));
}

export function recordProviderMetric(
  provider: Provider,
  outcome: 'attempt' | 'success' | 'fallback' | 'auth_failure' | 'transient_failure'
): Record<Provider, ProviderMetrics> {
  const metrics = getProviderMetrics();
  const current = metrics[provider] || createEmptyProviderMetrics(provider);

  current.lastUsedAt = Date.now();

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

export function extractSourceHost(url: string): string {
  if (!url || url.startsWith('pdf:')) return 'PDF';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

export function deriveInsights(history: SummaryHistoryEntry[]): AppInsights {
  const sourceCounts = new Map<string, number>();
  let totalMinutesSaved = 0;

  for (const entry of history) {
    totalMinutesSaved += entry.minutesSaved;
    sourceCounts.set(entry.sourceHost, (sourceCounts.get(entry.sourceHost) || 0) + 1);
  }

  const topSources = Array.from(sourceCounts.entries())
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    savedSummaries: history.length,
    totalMinutesSaved: Math.round(totalMinutesSaved * 10) / 10,
    topSources,
  };
}
