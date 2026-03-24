import { BarChart3, Clock3, History, Globe2 } from 'lucide-react';
import type { SummaryHistoryEntry, AppInsights } from '../lib/appInsights';

interface InsightsPanelProps {
  t: {
    insightsTitle: string;
    savedSummariesLabel: string;
    timeSavedLabel: string;
    topSourcesLabel: string;
    recentHistoryLabel: string;
    summaryLanguageLabel: string;
    noHistoryLabel: string;
    openOriginalLabel: string;
  };
  summaryLanguage: string;
  onSummaryLanguageChange: (language: string) => void;
  languages: Array<{ code: string; name: string; flag: string }>;
  insights: AppInsights;
  history: SummaryHistoryEntry[];
}

export function InsightsPanel({
  t,
  summaryLanguage,
  onSummaryLanguageChange,
  languages,
  insights,
  history,
}: InsightsPanelProps) {
  return (
    <section className="glass rounded-3xl p-5 sm:p-6 space-y-5 shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
            {t.insightsTitle}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <Globe2 size={16} className="text-emerald-600" />
          <span className="font-medium">{t.summaryLanguageLabel}</span>
          <select
            value={summaryLanguage}
            onChange={(event) => onSummaryLanguageChange(event.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-400"
          >
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wide">
            <History size={14} />
            {t.savedSummariesLabel}
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{insights.savedSummaries}</p>
        </div>

        <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wide">
            <Clock3 size={14} />
            {t.timeSavedLabel}
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{insights.totalMinutesSaved} min</p>
        </div>

        <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold uppercase tracking-wide">
            <BarChart3 size={14} />
            {t.topSourcesLabel}
          </div>
          <div className="mt-2 space-y-1 text-sm text-zinc-700">
            {insights.topSources.length > 0 ? insights.topSources.map((source) => (
              <div key={source.host} className="flex items-center justify-between gap-3">
                <span className="truncate">{source.host}</span>
                <span className="font-semibold">{source.count}</span>
              </div>
            )) : (
              <p className="text-zinc-400">{t.noHistoryLabel}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
          {t.recentHistoryLabel}
        </p>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.slice(0, 5).map((entry) => (
              <div key={entry.id} className="rounded-2xl bg-white/80 p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800 break-words">{entry.title || entry.sourceHost}</p>
                    <p className="text-xs text-zinc-500">
                      {entry.sourceHost} · {entry.minutesSaved} min
                    </p>
                  </div>
                  {entry.url && !entry.url.startsWith('pdf:') && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-700 hover:underline shrink-0"
                    >
                      {t.openOriginalLabel}
                    </a>
                  )}
                </div>
                <p className="text-sm text-zinc-600 line-clamp-3">{entry.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white/80 p-4 text-sm text-zinc-400 shadow-sm">
            {t.noHistoryLabel}
          </div>
        )}
      </div>
    </section>
  );
}
