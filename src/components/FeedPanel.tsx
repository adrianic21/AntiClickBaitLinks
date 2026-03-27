import { CheckSquare, ChevronDown, ChevronUp, Newspaper, Plus, RefreshCw, Rss, Sparkles, Square, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FEED_SOURCE_TYPES, type DailyFeedItem, type FeedSource, type FeedSourceType } from '../lib/feedSources';

interface FeedPanelProps {
  t: {
    feedTitle: string;
    feedDescription: string;
    feedNamePlaceholder: string;
    feedUrlPlaceholder: string;
    feedTypeLabel: string;
    feedAddSource: string;
    feedRefresh: string;
    feedEmpty: string;
    feedNoSources: string;
    feedSummarizeNow: string;
    feedSummarizeAll?: string;
    feedDailySelected: string;
    feedConnectorHint: string;
  };
  sources: FeedSource[];
  items: DailyFeedItem[];
  isLoading: boolean;
  error: string | null;
  onAddSource: (name: string, url: string, type: FeedSourceType) => void;
  onToggleSource: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onRefresh: () => void;
  onUpdateSourceItemsPerLoad: (id: string, itemsPerLoad: number) => void;
  onSummarizeMany: (urls: string[]) => void;
  forceOpen?: boolean;
}

export function FeedPanel({
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
  forceOpen,
}: FeedPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<FeedSourceType>('rss');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const enabledCount = useMemo(
    () => sources.filter((source) => source.enabled).length,
    [sources]
  );

  const handleSubmit = () => {
    if (!url.trim()) return;
    onAddSource(name.trim(), url.trim(), type);
    setName('');
    setUrl('');
    setType('rss');
  };

  const selectedUrls = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([url]) => url),
    [selected]
  );

  return (
    <section className="glass rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
      <button
        type="button"
        onClick={() => !forceOpen && setIsOpen((current) => !current)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
            {t.feedTitle}
          </p>
          <p className="text-sm text-zinc-600">
            {enabledCount > 0 ? `${enabledCount} ${t.feedDailySelected.toLowerCase()}` : t.feedDescription}
          </p>
        </div>
        {!forceOpen && (isOpen ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />)}
      </button>

      {(forceOpen || isOpen) && (
        <div className="space-y-5 pt-1">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-700">Cómo añadir tus webs favoritas</p>
              <ul className="text-xs text-zinc-500 list-disc pl-4 space-y-1">
                <li>Copia el enlace RSS de la web (normalmente termina en <span className="font-mono">/rss</span> o <span className="font-mono">/feed</span>).</li>
                <li>Pégalo aquí, ponle un nombre y pulsa “Añadir fuente”.</li>
                <li>Activa la fuente y pulsa “Actualizar feed”.</li>
              </ul>
              <p className="text-xs text-zinc-500">{t.feedConnectorHint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto]">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.feedNamePlaceholder}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t.feedUrlPlaceholder}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none focus:border-emerald-400"
              />
              <select
                value={type}
                onChange={(event) => setType(event.target.value as FeedSourceType)}
                aria-label={t.feedTypeLabel}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-400"
              >
                {FEED_SOURCE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]"
            >
              <Plus size={16} />
              {t.feedAddSource}
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.feedDailySelected}
              </p>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading || enabledCount === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition-all hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                {t.feedRefresh}
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-4 text-sm text-zinc-500">
                {t.feedNoSources}
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((source) => (
                  <div key={source.id} className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 shadow-sm">
                    <button
                      type="button"
                      onClick={() => onToggleSource(source.id)}
                      className={`h-5 w-9 rounded-full transition-all ${source.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                      aria-label={source.enabled ? 'Disable source' : 'Enable source'}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${source.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">{source.name || source.url}</p>
                      <p className="truncate text-xs text-zinc-500">{source.url}</p>
                    </div>
                    <select
                      value={String(source.itemsPerLoad || 6)}
                      onChange={(e) => onUpdateSourceItemsPerLoad(source.id, Number(e.target.value))}
                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 outline-none"
                      title="Noticias a cargar"
                    >
                      {[3, 6, 10, 15, 20, 25].map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      {source.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveSource(source.id)}
                      className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-5 text-sm text-zinc-500">
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
                    {t.feedSummarizeAll || 'Resumir seleccionados'}
                  </button>
                )}
                {items.map((item) => (
                  <article key={item.id} className="rounded-2xl bg-white/85 p-4 shadow-sm space-y-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setSelected((prev) => ({ ...prev, [item.url]: !prev[item.url] }))}
                        className="mt-0.5 rounded-2xl bg-zinc-50 p-2 text-zinc-700 hover:bg-zinc-100"
                        aria-label="Seleccionar"
                        title="Seleccionar"
                      >
                        {selected[item.url] ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <div className="mt-0.5 rounded-2xl bg-emerald-50 p-2 text-emerald-700">
                        <Newspaper size={16} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span className="inline-flex items-center gap-1">
                            {(() => {
                              try {
                                const host = new URL(item.url).hostname;
                                return (
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
                                    alt=""
                                    className="h-4 w-4 rounded"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                  />
                                );
                              } catch {
                                return null;
                              }
                            })()}
                            <Rss size={12} />
                            <span className="truncate max-w-[14rem]">{item.sourceName}</span>
                          </span>
                          {item.publishedAt && <span>{new Date(item.publishedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      )}
    </section>
  );
}
