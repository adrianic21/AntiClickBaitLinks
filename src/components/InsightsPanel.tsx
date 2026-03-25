import { ChevronDown, ChevronUp, Clock3, History, Globe2 } from 'lucide-react';
import { useState } from 'react';
import type { AppInsights } from '../lib/appInsights';

interface InsightsPanelProps {
  t: {
    insightsTitle: string;
    savedSummariesLabel: string;
    timeSavedLabel: string;
    summaryLanguageLabel: string;
  };
  summaryLanguage: string;
  onSummaryLanguageChange: (language: string) => void;
  languages: Array<{ code: string; name: string; flag: string }>;
  insights: AppInsights;
}

export function InsightsPanel({
  t,
  summaryLanguage,
  onSummaryLanguageChange,
  languages,
  insights,
}: InsightsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="glass rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
          {t.insightsTitle}
        </p>
        {isOpen ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />}
      </button>

      {isOpen && (
        <div className="space-y-4 pt-1">
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

          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </div>
      )}
    </section>
  );
}
