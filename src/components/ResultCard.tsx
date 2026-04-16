import { Search, Volume2, VolumeX, Loader2, AlertCircle, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import type { Translations } from '../translations';
import type { ApiKeys, InvestigationResult } from '../services/geminiService';

interface ResultCardProps {
  t: Translations;
  summary: string | null;
  articleTitle: string | null;
  url: string;
  error: string | null;
  isLoading: boolean;
  loadingMessage: string;
  loadingProgress: number;
  currentLength: 'short' | 'medium' | 'long' | 'child';
  isSpeaking: boolean;
  speechRate: number;
  investigationResult: InvestigationResult | null;
  apiKeys: ApiKeys;
  isValidatingKeys?: boolean;
  resultsRef: React.RefObject<HTMLDivElement>;
  onSpeak: () => void;
  onSpeechRateChange: (rate: number) => void;
  onExpand: (length: 'medium' | 'long' | 'child') => void;
  onShare: (summary: string, url?: string) => void;
}

function FormattedText({ text }: { text: string }) {
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
  t, summary, articleTitle, url, error, isLoading, loadingMessage, loadingProgress, currentLength,
  isSpeaking, speechRate, investigationResult,
  resultsRef, onSpeak, onSpeechRateChange, onExpand, onShare,
}: ResultCardProps) {
  const isLocalPdf = url.startsWith('pdf:');
  const isYouTube = /(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/)/.test(url);
  const displayUrl = isLocalPdf ? url.replace('pdf:', '') : url;

  return (
    <div ref={resultsRef}>
      <AnimatePresence mode="wait">
        {isLoading && !summary && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-zinc-200 bg-white p-8 flex flex-col items-center gap-4"
          >
            <Loader2 className="animate-spin text-emerald-600" size={32} />
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingMessage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="text-sm font-medium text-zinc-500"
              >
                {loadingMessage}
              </motion.p>
            </AnimatePresence>
            <div className="w-full max-w-sm space-y-1">
              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.max(4, Math.min(100, loadingProgress))}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 text-center">{Math.round(loadingProgress)}%</p>
            </div>
          </motion.div>
        )}

        {!isLoading && error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-sm">{error}</p>
              {isYouTube && (error.includes('subtitles') || error.includes('subtítulos') || error.includes('content') || error.includes('contenido')) && (
                <p className="text-xs text-red-500">{t.youtubeNoSubtitles}</p>
              )}
            </div>
          </motion.div>
        )}

        {summary && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5"
          >
            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                {t.realSummary}
              </span>
              <button
                onClick={onSpeak}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border',
                  isSpeaking
                    ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                )}
              >
                {isSpeaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                {isSpeaking ? t.stop : t.listen}
              </button>
              <button
                onClick={() => onShare(summary, url)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all border bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
              >
                <Share2 size={13} />{t.share}
              </button>
              <div className="flex items-center gap-0.5 rounded-full bg-zinc-100 p-0.5 border border-zinc-200">
                {[0.85, 1, 1.2].map(rate => (
                  <button
                    key={rate}
                    onClick={() => onSpeechRateChange(rate)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors',
                      speechRate === rate ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                    )}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Original title */}
            {articleTitle && (
              <div className="pb-4 border-b border-zinc-100 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t.originalTitle}</p>
                <p className="text-base font-semibold text-zinc-700 leading-snug break-words">{articleTitle}</p>
              </div>
            )}

            {/* Summary text */}
            <div className="relative">
              {isLoading && currentLength !== 'short' && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                  <Loader2 className="animate-spin text-emerald-600" size={28} />
                </div>
              )}
              <div className="text-lg sm:text-xl font-normal leading-relaxed text-zinc-700 space-y-3">
                {summary.split('\n').filter(p => p.trim()).map((paragraph, i) => (
                  <p key={i}><FormattedText text={paragraph} /></p>
                ))}
              </div>
            </div>

            {/* Expand buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {currentLength !== 'medium' && (
                <button
                  onClick={() => onExpand('medium')}
                  disabled={isLoading}
                  className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50 border border-emerald-100"
                >
                  {t.expandMedium}
                </button>
              )}
              {currentLength !== 'long' && (
                <button
                  onClick={() => onExpand('long')}
                  disabled={isLoading}
                  className="px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100"
                >
                  {t.expandLong}
                </button>
              )}
              {currentLength !== 'child' && (
                <button
                  onClick={() => onExpand('child')}
                  disabled={isLoading}
                  className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors disabled:opacity-50 border border-purple-100"
                >
                  {t.explainChild}
                </button>
              )}
            </div>

            {/* Source link */}
            <div className="pt-3 border-t border-zinc-100 flex items-center gap-2 text-zinc-400 text-xs min-w-0">
              <Search size={12} />
              {isLocalPdf ? (
                <span className="truncate max-w-[280px] sm:max-w-md min-w-0">{displayUrl}</span>
              ) : (
                <a
                  href={url}
                  target="_blank" rel="noopener noreferrer"
                  className="truncate max-w-[280px] sm:max-w-md hover:text-emerald-600 hover:underline transition-colors min-w-0"
                >
                  {displayUrl}
                </a>
              )}
            </div>

            {/* Investigation result */}
            {investigationResult && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t.deepResearchTitle || 'Investigación'}</p>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-white text-zinc-700 border border-zinc-200">
                    {t.confidenceLabel} {investigationResult.confidence}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-800">{investigationResult.verdict}</p>
                {investigationResult.findings.length > 0 && (
                  <div className="space-y-1.5">
                    {investigationResult.findings.map((finding, index) => (
                      <p key={`${finding}-${index}`} className="text-xs text-zinc-600">{finding}</p>
                    ))}
                  </div>
                )}
                {investigationResult.relatedSources.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200">
                    {investigationResult.relatedSources.map((source) => (
                      <a
                        key={source.url} href={source.url}
                        target="_blank" rel="noopener noreferrer"
                        className="block rounded-xl bg-white px-3 py-2.5 border border-zinc-200 hover:border-emerald-300 transition-colors"
                      >
                        <p className="text-xs font-semibold text-zinc-700">{source.source}</p>
                        <p className="text-xs text-zinc-600">{source.title}</p>
                        <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{source.snippet}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* YouTube reminder */}
      {isYouTube && !summary && !error && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs border border-blue-100">
          <AlertCircle size={12} className="shrink-0" />
          <span>{t.youtubeNoSubtitles}</span>
        </div>
      )}
    </div>
  );
}
