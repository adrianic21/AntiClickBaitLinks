import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Translations } from '../translations';
import type { DailyFeedItem, FeedSource, FeedSourceType } from '../lib/feedSources';
import { FeedPanel } from './FeedPanel';

interface FeedModalProps {
  uiLanguage: string;
  t: Translations;
  show: boolean;
  onClose: () => void;
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
}

export function FeedModal({
  uiLanguage,
  t,
  show,
  onClose,
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
}: FeedModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="fixed inset-x-4 top-16 bottom-4 z-[61] mx-auto w-auto max-w-5xl overflow-y-auto rounded-[2rem] border border-emerald-200/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,250,0.98)_100%)] p-5 shadow-[0_30px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:top-20 sm:bottom-6 sm:p-6"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700/70">
                  {t.feedTitle}
                </p>
                <p className="text-sm text-zinc-600">
                  {uiLanguage === 'Spanish'
                    ? 'Descubre y resume noticias de tus webs favoritas desde un solo sitio.'
                    : 'Discover and summarize stories from your favorite websites in one place.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={t.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <FeedPanel
              uiLanguage={uiLanguage}
              t={t}
              sources={sources}
              items={items}
              isLoading={isLoading}
              error={error}
              onAddSource={onAddSource}
              onToggleSource={onToggleSource}
              onRemoveSource={onRemoveSource}
              onRefresh={onRefresh}
              onUpdateSourceItemsPerLoad={onUpdateSourceItemsPerLoad}
              onSummarizeMany={onSummarizeMany}
              forceOpen
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
