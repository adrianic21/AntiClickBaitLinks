import { useState, useCallback } from 'react';
import {
  addFeedSource as persistFeedSource,
  removeFeedSource as deleteFeedSource,
  toggleFeedSource as persistFeedSourceToggle,
  getFeedSources,
  type DailyFeedItem,
  type FeedSource,
  type FeedSourceType,
} from '../lib/feedSources';

interface RssPreviewResponse {
  title: string;
  items: Array<{
    title: string;
    url: string;
    publishedAt?: string | null;
  }>;
}

export type SyncAccountFn = (payload: Record<string, unknown>) => Promise<void>;

export function useFeedState(syncAccount: SyncAccountFn) {
  const [feedSources, setFeedSources] = useState<FeedSource[]>(() => getFeedSources());
  const [dailyFeedItems, setDailyFeedItems] = useState<DailyFeedItem[]>([]);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const addFeedSource = useCallback(
    async (name: string, sourceUrl: string, type: FeedSourceType) => {
      const trimmedUrl = sourceUrl.trim();
      if (!trimmedUrl) return false;

      const nextSources = persistFeedSource({
        name: name.trim() || trimmedUrl,
        url: trimmedUrl,
        type,
        enabled: true,
      });
      setFeedSources(nextSources);
      setFeedError(null);
      syncAccount({ feedSources: nextSources }).catch(() => undefined);
      return true;
    },
    [syncAccount]
  );

  const removeFeedSource = useCallback(
    (id: string) => {
      const nextSources = deleteFeedSource(id);
      setFeedSources(nextSources);
      syncAccount({ feedSources: nextSources }).catch(() => undefined);
    },
    [syncAccount]
  );

  const toggleFeedSource = useCallback(
    (id: string) => {
      const nextSources = persistFeedSourceToggle(id);
      setFeedSources(nextSources);
      syncAccount({ feedSources: nextSources }).catch(() => undefined);
    },
    [syncAccount]
  );

  const refreshDailyFeed = useCallback(async () => {
    const enabledSources = feedSources.filter((source) => source.enabled);
    if (enabledSources.length === 0) {
      setDailyFeedItems([]);
      setFeedError(null);
      return;
    }

    setIsFeedLoading(true);
    setFeedError(null);

    try {
      const responses = await Promise.all(
        enabledSources.map(async (source) => {
          const response = await fetch('/api/rss-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: source.url }),
          });

          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error || `Could not load ${source.name}`);
          }

          const data = (await response.json()) as RssPreviewResponse;
          const perSourceLimit = Math.max(1, Math.min(25, Number(source.itemsPerLoad || 6)));
          return data.items
            .slice(0, perSourceLimit)
            .map<DailyFeedItem>((item, index) => ({
              id: `${source.id}-${index}-${item.url}`,
              title: item.title,
              url: item.url,
              sourceName: source.name || data.title || source.url,
              sourceType: source.type,
              publishedAt: item.publishedAt || null,
            }));
        })
      );

      const deduped = new Map<string, DailyFeedItem>();
      for (const items of responses.flat()) {
        if (!deduped.has(items.url)) deduped.set(items.url, items);
      }

      const nextItems = Array.from(deduped.values())
        .sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 60);

      setDailyFeedItems(nextItems);
    } catch (err: any) {
      setFeedError(err?.message || 'Could not load the selected feed.');
    } finally {
      setIsFeedLoading(false);
    }
  }, [feedSources]);

  const updateFeedSourceItemsPerLoad = useCallback(
    (id: string, itemsPerLoad: number) => {
      const safe = Math.max(1, Math.min(25, Math.round(itemsPerLoad)));
      const nextSources = feedSources.map((source) =>
        source.id === id ? { ...source, itemsPerLoad: safe } : source
      );
      setFeedSources(nextSources);
      try { localStorage.setItem('custom_feed_sources_v1', JSON.stringify(nextSources)); } catch { /* ignore */ }
      syncAccount({ feedSources: nextSources }).catch(() => undefined);
    },
    [feedSources, syncAccount]
  );

  return {
    feedSources,
    dailyFeedItems,
    isFeedLoading,
    feedError,
    addFeedSource,
    removeFeedSource,
    toggleFeedSource,
    refreshDailyFeed,
    updateFeedSourceItemsPerLoad,
    setFeedSources,
    setDailyFeedItems,
  };
}
