export type FeedSourceType =
  | 'rss'
  | 'raindrop'
  | 'wallabag'
  | 'readwise'
  | 'matter'
  | 'inoreader'
  | 'other';

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  type: FeedSourceType;
  enabled: boolean;
  itemsPerLoad?: number;
  createdAt: number;
}

export interface DailyFeedItem {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: FeedSourceType;
  publishedAt: string | null;
}

const FEED_SOURCES_KEY = 'custom_feed_sources_v1';

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getFeedSources(): FeedSource[] {
  return safeJsonParse<FeedSource[]>(localStorage.getItem(FEED_SOURCES_KEY), []);
}

export function saveFeedSources(sources: FeedSource[]): void {
  localStorage.setItem(FEED_SOURCES_KEY, JSON.stringify(sources));
}

export function addFeedSource(source: Omit<FeedSource, 'id' | 'createdAt'>): FeedSource[] {
  const next: FeedSource[] = [
    {
      ...source,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    },
    ...getFeedSources(),
  ];
  saveFeedSources(next);
  return next;
}

export function removeFeedSource(id: string): FeedSource[] {
  const next = getFeedSources().filter((source) => source.id !== id);
  saveFeedSources(next);
  return next;
}

export function toggleFeedSource(id: string): FeedSource[] {
  const next = getFeedSources().map((source) =>
    source.id === id ? { ...source, enabled: !source.enabled } : source
  );
  saveFeedSources(next);
  return next;
}

export const FEED_SOURCE_TYPES: Array<{ value: FeedSourceType; label: string }> = [
  { value: 'rss', label: 'RSS' },
  { value: 'raindrop', label: 'Raindrop' },
  { value: 'wallabag', label: 'Wallabag' },
  { value: 'readwise', label: 'Readwise' },
  { value: 'matter', label: 'Matter' },
  { value: 'inoreader', label: 'Inoreader' },
  { value: 'other', label: 'Other' },
];
