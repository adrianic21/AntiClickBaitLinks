import { Search, Volume2, VolumeX, Copy, CopyCheck, Loader2, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import type { Translations } from '../translations';
import type { ApiKeys } from '../services/geminiService';

interface ResultCardProps {
  t: Translations;
  summary: string | null;
  articleTitle: string | null;
  url: string;
  error: string | null;
  isLoading: boolean;
  currentLength: 'short' | 'medium' | 'long' | 'child';
  isSpeaking: boolean;
  isCopied: boolean;
  apiKeys: ApiKeys;
  resultsRef: React.RefObject<HTMLDivElement>;
  onSpeak: () => void;
  onCopy: () => void;
  onExpand: (length: 'medium' | 'long' | 'child') => void;
}

export function ResultCard({
  t, summary, articleTitle, url, error, isLoading, currentLength,
  isSpeaking, isCopied, apiKeys, resultsRef, onSpeak, onCopy, onExpand,
}: ResultCardProps) {
  const hasAnyKey = Object.values(apiKeys).some(k => k && k !== 'undefined');

  return (
    <div ref={resultsRef}>
      <AnimatePresence mode="wait">
        {/* Error */}
        {error && (
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
            <div className="flex items-center gap-2">
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
            </div>

            {/* Original headline */}
            <div className="pb-3 border-b border-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Original headline</p>
              <p className="text-sm font-semibold text-zinc-600 leading-snug italic">"{articleTitle || url}"</p>
            </div>

            {/* Summary text */}
            <div className="relative">
              {isLoading && currentLength !== 'short' && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                  <Loader2 className="animate-spin text-emerald-600" size={32} />
                </div>
              )}
              <div className="text-lg sm:text-xl font-normal leading-relaxed text-zinc-700 space-y-3">
                {summary.split('\n').filter(p => p.trim()).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
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
