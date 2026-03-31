import { CheckSquare, Globe, Newspaper, Plus, RefreshCw, Sparkles, Square, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DailyFeedItem, FeedSource, FeedSourceType } from '../lib/feedSources';

interface FeedPanelProps {
  uiLanguage: string;
  t: {
    feedTitle: string;
    feedEmpty: string;
    feedNoSources: string;
    feedSummarizeNow: string;
    feedSummarizeAll?: string;
    feedDailySelected: string;
  };
  sources: FeedSource[];
  items: DailyFeedItem[];
  isLoading: boolean;
  error: string | null;
  onAddSource: (name: string, url: string, type: FeedSourceType) => Promise<boolean>;
  onToggleSource: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onRefresh: () => void;
  onUpdateSourceItemsPerLoad: (id: string, itemsPerLoad: number) => void;
  onSummarizeMany: (urls: string[]) => void;
  forceOpen?: boolean;
}

export function FeedPanel({
  uiLanguage,
  t,
  sources,
  items,
  isLoading,
  error,
  onAddSource,
  onToggleSource,
  onRemoveSource,
  onRefresh,
  onUpdateSourceItemsPerLoad,
  onSummarizeMany,
}: FeedPanelProps) {
  const [siteUrl, setSiteUrl] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState(false);

  const copy = uiLanguage === 'Spanish'
    ? {
        heroTitle: 'Tu feed diario, sin configurar RSS a mano',
        heroDesc:
          'Pega la web principal de un periodico, revista o blog y la app intentara detectar su feed automaticamente.',
        inputPlaceholder: 'https://ejemplo.com',
        addBtn: 'Anadir medio',
        sourceListTitle: 'Medios conectados',
        sourceListDesc: 'Activa o pausa cada medio y decide cuantas noticias cargar.',
        itemsTitle: 'Noticias disponibles',
        itemsDesc: 'Selecciona varias o resume una sola al instante.',
        loadCount: 'Noticias',
        enabled: 'Activo',
        disabled: 'Pausado',
        refreshBtn: 'Actualizar',
        selectedCount: 'medios activos',
        selectLabel: 'Seleccionar noticia',
      }
    : {
        heroTitle: 'Your daily feed, without manual RSS setup',
        heroDesc:
          'Paste the main website of a newspaper, magazine or blog and the app will try to detect its feed automatically.',
        inputPlaceholder: 'https://example.com',
        addBtn: 'Add source',
        sourceListTitle: 'Connected sources',
        sourceListDesc: 'Enable or pause each source and choose how many stories to load.',
        itemsTitle: 'Available stories',
        itemsDesc: 'Select several or summarize one instantly.',
        loadCount: 'Stories',
        enabled: 'Enabled',
        disabled: 'Paused',
        refreshBtn: 'Refresh',
        selectedCount: 'active sources',
        selectLabel: 'Select story',
      };

  const enabledCount = useMemo(
    () => sources.filter((source) => source.enabled).length,
    [sources]
  );

  const selectedUrls = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([itemUrl]) => itemUrl),
    [selected]
  );

  const handleSubmit = async () => {
    if (!siteUrl.trim() || isAdding) return;
    setIsAdding(true);
    const wasAdded = await onAddSource('', siteUrl.trim(), 'rss');
    if (wasAdded) setSiteUrl('');
    setIsAdding(false);
  };

  return (
    <section className="space-y-5 text-zinc-900">
      <div className="rounded-[2rem] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-[0_18px_60px_rgba(5,150,105,0.08)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
            <Globe size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-700/80">
              {t.feedTitle}
            </p>
            <h4 className="mt-1 text-xl font-extrabold tracking-tight text-zinc-900">
              {copy.heroTitle}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              {copy.heroDesc}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder={copy.inputPlaceholder}
            className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none transition-colors focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isAdding || !siteUrl.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAdding ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
            {copy.addBtn}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.35fr]">
        <section className="rounded-[1.75rem] border border-zinc-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
              {copy.sourceListTitle}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              {enabledCount > 0 ? `${enabledCount} ${copy.selectedCount}` : copy.sourceListDesc}
            </p>
          </div>

          {sources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
              {t.feedNoSources}
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div key={source.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleSource(source.id)}
                      className={`mt-0.5 h-6 w-10 rounded-full transition-all ${source.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                      aria-label={source.enabled ? copy.enabled : copy.disabled}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-white transition-transform ${source.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-zinc-900">{source.name || source.url}</p>
                      <p className="truncate text-xs text-zinc-500">{source.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(source.id)}
                      className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove source"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${source.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                      {source.enabled ? copy.enabled : copy.disabled}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        {copy.loadCount}
                      </span>
                      <select
                        value={String(source.itemsPerLoad || 6)}
                        onChange={(event) => onUpdateSourceItemsPerLoad(source.id, Number(event.target.value))}
                        className="rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-bold text-zinc-700 outline-none"
                      >
                        {[3, 6, 10, 15, 20, 25].map((count) => (
                          <option key={count} value={count}>{count}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[1.75rem] border border-zinc-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                {copy.itemsTitle}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{copy.itemsDesc}</p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading || enabledCount === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition-all hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              {copy.refreshBtn}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-500">
              {t.feedEmpty}
            </div>
          ) : (
            <div className="space-y-3">
              {selectedUrls.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSummarizeMany(selectedUrls)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700"
                >
                  <Sparkles size={16} />
                  {t.feedSummarizeAll || 'Summarize selected'}
                </button>
              )}

              {items.map((item) => (
                <article key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setSelected((prev) => ({ ...prev, [item.url]: !prev[item.url] }))}
                      className="rounded-2xl bg-white p-2 text-zinc-700 shadow-sm hover:bg-zinc-100"
                      aria-label={copy.selectLabel}
                    >
                      {selected[item.url] ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
                      <Newspaper size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-bold text-zinc-900">{item.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span className="truncate">{item.sourceName}</span>
                        {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSummarizeMany([item.url])}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-700"
                    >
                      <Sparkles size={14} />
                      {t.feedSummarizeNow}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
