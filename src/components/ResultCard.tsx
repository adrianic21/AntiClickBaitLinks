import { Search, Volume2, VolumeX, Loader2, AlertCircle, Check, Share2 } from 'lucide-react';
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
  lieScore: number;
  investigationResult: InvestigationResult | null;
  apiKeys: ApiKeys;
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
  isSpeaking, speechRate, lieScore, investigationResult, apiKeys, resultsRef,
  onSpeak, onSpeechRateChange, onExpand, onShare,
}: ResultCardProps) {
  const hasAnyKey = Object.values(apiKeys).some(k => k && k !== 'undefined');
  const configuredProviders = Object.entries(apiKeys)
    .filter(([, value]) => value && value !== 'undefined')
    .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1));
  const hasMultipleKeys = configuredProviders.length > 1;

  // No mostrar el link de fuente cuando es un PDF subido localmente.
  const isLocalPdf = url.startsWith('pdf:');
  const isYouTube = /(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/)/.test(url);
  const displayUrl = isLocalPdf ? url.replace('pdf:', '') : url;
  const lieMeterColor = lieScore < 26
    ? 'from-emerald-500 to-lime-400'
    : lieScore < 51
      ? 'from-yellow-400 to-amber-500'
      : lieScore < 76
        ? 'from-orange-500 to-red-500'
        : 'from-red-600 to-red-800';
  const lieMeterLabel = lieScore < 26
    ? 'Low'
    : lieScore < 51
      ? 'Medium'
      : lieScore < 76
        ? 'High'
        : 'Very high';

  return (
    <div ref={resultsRef}>
      <AnimatePresence mode="wait">
        {isLoading && !summary && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-3xl p-8 flex flex-col items-center gap-4"
          >
            <Loader2 className="animate-spin text-emerald-600" size={36} />
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingMessage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="text-sm font-medium text-zinc-500"
              >
                {loadingMessage}
              </motion.p>
            </AnimatePresence>
            <div className="w-full max-w-md space-y-1">
              <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3"
          >
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{error}</p>
              {/* Extra hint for YouTube errors */}
              {isYouTube && (error.includes('subtitles') || error.includes('subtítulos') || error.includes('content') || error.includes('contenido')) && (
                <p className="text-xs text-red-500">
                  {t.youtubeNoSubtitles || 'This video may not have subtitles enabled. Subtitles are required to generate a summary.'}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {summary && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass rounded-3xl p-8 space-y-4 text-zinc-900 dark:text-zinc-100"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                {t.realSummary}
              </span>
              <button
                onClick={onSpeak}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all',
                  isSpeaking ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                )}
              >
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                {isSpeaking ? t.stop : t.listen}
              </button>
              <button
                onClick={() => onShare(summary, url)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              >
                <Share2 size={14} />
                {t.share}
              </button>
              <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1">
                {[0.85, 1, 1.2].map(rate => (
                  <button
                    key={rate}
                    onClick={() => onSpeechRateChange(rate)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors',
                      speechRate === rate
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    )}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {articleTitle && (
              <div className="pb-3 border-b border-zinc-100 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                  {t.originalTitle}
                </p>
                <p className="text-base font-semibold text-zinc-700 dark:text-zinc-200 leading-snug break-words">{articleTitle}</p>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-100 bg-white/80 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                  {t.lieMeterTitle || 'Lie meter'}
                </p>
                <span className="text-sm font-bold text-zinc-700">{lieScore}/100 · {lieMeterLabel}</span>
              </div>
              <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${lieMeterColor} transition-all duration-500`}
                  style={{ width: `${lieScore}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">{t.lieMeterHelp || 'Estimates how much the headline exaggerates or distorts the actual content.'}</p>
            </div>

            <div className="relative">
              {isLoading && currentLength !== 'short' && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl">
                  <Loader2 className="animate-spin text-emerald-600" size={32} />
                </div>
              )}
              <div className="text-lg sm:text-xl font-normal leading-relaxed text-zinc-700 dark:text-zinc-200 space-y-3">
                {summary.split('\n').filter(p => p.trim()).map((paragraph, i) => (
                  <p key={i}><FormattedText text={paragraph} /></p>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {currentLength !== 'medium' && (
                <button
                  onClick={() => onExpand('medium')}
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {t.expandMedium}
                </button>
              )}
              {currentLength !== 'long' && (
                <button
                  onClick={() => onExpand('long')}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {t.expandLong}
                </button>
              )}
              {currentLength !== 'child' && (
                <button
                  onClick={() => onExpand('child')}
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {t.explainChild}
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-100 flex items-center gap-2 text-zinc-400 text-sm min-w-0">
              <Search size={14} />
              {isLocalPdf ? (
                <span className="truncate max-w-[250px] sm:max-w-md text-zinc-400 min-w-0">
                  {displayUrl}
                </span>
              ) : (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate max-w-[250px] sm:max-w-md hover:text-emerald-600 hover:underline transition-colors min-w-0"
                >
                  {displayUrl}
                </a>
              )}
            </div>

            {investigationResult && (
              <div className="rounded-2xl border border-zinc-100 bg-white/80 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                    {t.deepResearchTitle || 'Deep research'}
                  </p>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    {(t.confidenceLabel || 'Confidence')} {investigationResult.confidence}
                  </span>
                </div>
                <p className="text-base font-semibold text-zinc-800">{investigationResult.verdict}</p>
                {investigationResult.findings.length > 0 && (
                  <div className="space-y-2">
                    {investigationResult.findings.map((finding, index) => (
                      <p key={`${finding}-${index}`} className="text-sm text-zinc-600">
                        {finding}
                      </p>
                    ))}
                  </div>
                )}
                {investigationResult.relatedSources.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                    {investigationResult.relatedSources.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-xl bg-zinc-50 px-3 py-3 hover:bg-zinc-100 transition-colors"
                      >
                        <p className="text-sm font-semibold text-zinc-800">{source.source}</p>
                        <p className="text-sm text-zinc-700">{source.title}</p>
                        <p className="text-xs text-zinc-500 mt-1">{source.snippet}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium mt-2 text-center',
          hasAnyKey ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        )}
      >
        {hasAnyKey ? (
          <div className="w-full flex items-center justify-center gap-2 text-center">
            <Check size={14} className="shrink-0" />
            <span>
              {configuredProviders.join(' · ')} — {hasMultipleKeys ? (t.apiKeysActive || t.apiKeyActive) : t.apiKeyActive}
            </span>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-2 text-center">
            <div className="flex items-center justify-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{t.apiKeyMissing}</span>
            </div>
            <div className="mx-auto max-w-xl text-[10px] text-amber-600 space-y-1">
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

      {/* YouTube subtitle reminder — shown whenever a YouTube URL is present */}
      {isYouTube && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium">
          <AlertCircle size={13} className="shrink-0" />
          <span>{t.youtubeNoSubtitles || 'YouTube videos require subtitles to be enabled for summarization.'}</span>
        </div>
      )}
    </div>
  );
}
