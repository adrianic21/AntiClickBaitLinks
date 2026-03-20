import { Search, Volume2, VolumeX, Copy, CopyCheck, Loader2, AlertCircle, Check, Share2, History, Clock, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import type { Translations, SummaryHistoryEntry } from '../translations';
import type { ApiKeys } from '../services/geminiService';

interface ResultCardProps {
  t: Translations;
  summary: string | null;
  articleTitle: string | null;
  url: string;
  error: string | null;
  isLoading: boolean;
  loadingMessage: string;
  currentLength: 'short' | 'medium' | 'long' | 'child';
  isSpeaking: boolean;
  isCopied: boolean;
  apiKeys: ApiKeys;
  resultsRef: React.RefObject<HTMLDivElement>;
  summaryHistory: SummaryHistoryEntry[];
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  onSpeak: () => void;
  onCopy: () => void;
  onExpand: (length: 'medium' | 'long' | 'child') => void;
  onShare: (summary: string, url: string, title: string) => void;
  onSelectHistory: (entry: SummaryHistoryEntry) => void;
}
function FormattedText({ text }: { text: string }) {
  // Convert **bold** and *bold* to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
export function ResultCard({
  t, summary, articleTitle, url, error, isLoading, loadingMessage, currentLength,
  isSpeaking, isCopied, apiKeys, resultsRef,
  summaryHistory, showHistory, setShowHistory,
  onSpeak, onCopy, onExpand, onShare, onSelectHistory,
}: ResultCardProps) {
  const hasAnyKey = Object.values(apiKeys).some(k => k && k !== 'undefined');

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div ref={resultsRef}>
      <AnimatePresence mode="wait">
        {/* Loading state with animated message */}
        {isLoading && !summary && (
          <motion.div key="loading"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass rounded-3xl p-8 flex flex-col items-center gap-4"
          >
            <Loader2 className="animate-spin text-emerald-600" size={36} />
            <AnimatePresence mode="wait">
              <motion.p key={loadingMessage}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="text-sm font-medium text-zinc-500"
              >
                {loadingMessage}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <motion.div key="error"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-3"
          >
            <AlertCircle size={20} />
            <p className="font-medium">{error}</p>
          </motion.div>
        )}

        {/* Summary card */}
        {summary && (
          <motion.div key="summary"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass rounded-3xl p-8 space-y-4"
          >
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {t.realSummary}
              </span>
              <button onClick={onSpeak}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                  isSpeaking ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                )}
              >
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {isSpeaking ? t.stop : t.listen}
              </button>
              <button onClick={onCopy}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                  isCopied ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                )}
              >
                {isCopied ? <CopyCheck size={14} /> : <Copy size={14} />}
                {isCopied ? t.copied : t.copy}
              </button>
              <button onClick={() => onShare(summary, url, articleTitle || url)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              >
                <Share2 size={14} />
                {t.share}
              </button>
            </div>

            {/* Original headline — only show if we have a real title, not the URL */}
            {articleTitle && (
  <div className="pb-3 border-b border-zinc-100">
    <p className="text-sm font-semibold text-zinc-600 leading-snug">{articleTitle}</p>
  </div>
)}

            {/* Summary text */}
            <div className="relative">
              {isLoading && currentLength !== 'short' && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                  <Loader2 className="animate-spin text-emerald-600" size={32} />
                </div>
              )}
              <div className="text-lg sm:text-xl font-normal leading-relaxed text-zinc-700 space-y-3">
  {summary.split('\n').filter(p => p.trim()).map((paragraph, i) => (
    <p key={i}><FormattedText text={paragraph} /></p>
  ))}
</div>
            </div>

            {/* Expansion buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {currentLength !== 'medium' && (
                <button onClick={() => onExpand('medium')} disabled={isLoading}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {t.expandMedium}
                </button>
              )}
              {currentLength !== 'long' && (
                <button onClick={() => onExpand('long')} disabled={isLoading}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {t.expandLong}
                </button>
              )}
              {currentLength !== 'child' && (
                <button onClick={() => onExpand('child')} disabled={isLoading}
                  className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {t.explainChild}
                </button>
              )}
            </div>

            {/* Source link */}
            <div className="pt-4 border-t border-zinc-100 flex items-center gap-2 text-zinc-400 text-sm">
              <Search size={14} />
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="truncate max-w-[250px] sm:max-w-md hover:text-emerald-600 hover:underline transition-colors"
              >
                {url}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary history */}
      {summaryHistory.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-600 transition-colors w-full px-1 py-1"
          >
            <History size={14} />
            {t.historyTitle}
            <ChevronRight size={14} className={cn("ml-auto transition-transform", showHistory && "rotate-90")} />
          </button>
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
              >
                <div className="mt-1 space-y-1">
                  {summaryHistory.map((entry, i) => (
                    <button key={i} onClick={() => onSelectHistory(entry)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors group flex items-start gap-2"
                    >
                      <Clock size={12} className="text-zinc-300 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-600 truncate group-hover:text-emerald-600 transition-colors">
                          {entry.title.length > 60 ? entry.title.slice(0, 60) + '…' : entry.title}
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(entry.date)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* API Key status */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium mt-2",
        hasAnyKey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      )}>
        {hasAnyKey ? (
          <>
            <Check size={14} className="shrink-0" />
            <span>
              {Object.entries(apiKeys)
                .filter(([, v]) => v && v !== 'undefined')
                .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
                .join(' · ')} — {t.apiKeyActive}
            </span>
          </>
        ) : (
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{t.apiKeyMissing}</span>
            </div>
            <div className="text-[10px] text-amber-600 space-y-1 pl-5">
              <p>
                1. {t.apiKeyGuide1}{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold">Gemini</a>
                {' '}{t.apiKeyOr}{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline font-bold">OpenRouter</a>
                {' '}{t.apiKeyOr}{' '}
                <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener noreferrer" className="underline font-bold">Mistral</a>
                {' '}{t.apiKeyOr}{' '}
                <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="underline font-bold">DeepSeek</a>
              </p>
              <p>2. {t.apiKeyGuide2}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
