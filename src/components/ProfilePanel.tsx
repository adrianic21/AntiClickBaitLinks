import { Check, Key, LogOut, Rss, UserRound, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { FeedPanel } from './FeedPanel';
import { InsightsPanel } from './InsightsPanel';
import type { Translations } from '../translations';
import type { ApiKeys, Provider } from '../services/geminiService';
import type { AppInsights } from '../lib/appInsights';
import type { DailyFeedItem, FeedSource, FeedSourceType } from '../lib/feedSources';

interface ProfilePanelProps {
  t: Translations;
  show: boolean;
  onClose: () => void;
  currentUser: {
    email: string;
    displayName: string;
  };
  isPremium: boolean;
  provider: Provider;
  setProvider: (provider: Provider) => void;
  userApiKey: string;
  setUserApiKey: (value: string) => void;
  apiKeys: ApiKeys;
  isKeySaved: boolean;
  onSaveApiKey: () => void;
  onLogout: () => void;
  feedSources: FeedSource[];
  dailyFeedItems: DailyFeedItem[];
  isFeedLoading: boolean;
  feedError: string | null;
  onAddFeedSource: (name: string, url: string, type: FeedSourceType) => void;
  onToggleFeedSource: (id: string) => void;
  onRemoveFeedSource: (id: string) => void;
  onRefreshFeed: () => void;
  onUseFeedItem: (url: string) => void;
  onSummarizeFeedItem: (url: string) => void;
  appInsights: AppInsights;
}

const PROVIDERS: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];

const PROVIDER_LINKS: Record<Provider, string> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openrouter: 'https://openrouter.ai/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

const PROVIDER_PLACEHOLDERS: Record<Provider, string> = {
  gemini: 'AIzaSy...',
  openrouter: 'sk-or-...',
  mistral: 'sk-...',
  deepseek: 'sk-...',
};

export function ProfilePanel({
  t,
  show,
  onClose,
  currentUser,
  isPremium,
  provider,
  setProvider,
  userApiKey,
  setUserApiKey,
  apiKeys,
  isKeySaved,
  onSaveApiKey,
  onLogout,
  feedSources,
  dailyFeedItems,
  isFeedLoading,
  feedError,
  onAddFeedSource,
  onToggleFeedSource,
  onRemoveFeedSource,
  onRefreshFeed,
  onUseFeedItem,
  onSummarizeFeedItem,
  appInsights,
}: ProfilePanelProps) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="fixed inset-x-4 top-24 bottom-6 z-[46] mx-auto w-auto max-w-4xl glass rounded-[2rem] p-5 sm:p-6 shadow-2xl overflow-y-auto"
          >
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <UserRound size={22} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      {t.profileTitle || 'Profile'}
                    </p>
                    <p className="text-lg font-bold text-zinc-900">{currentUser.displayName}</p>
                    <p className="text-sm text-zinc-500 break-all">{currentUser.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-white/85 p-4 shadow-sm border border-white/70">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                    {t.accountLabel || 'Account'}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-zinc-900">
                    {isPremium ? t.statusPremium : t.statusFree}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">{t.authSyncCaption}</p>
                </div>
                <div className="rounded-3xl bg-white/85 p-4 shadow-sm border border-white/70 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      {t.sessionLabel || 'Session'}
                    </p>
                    <p className="mt-2 text-sm text-zinc-500">
                      {t.profileHelper || 'Manage your APIs, daily feed and activity from one place.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition-all hover:bg-zinc-50"
                  >
                    <LogOut size={16} />
                    {t.authLogout || 'Log out'}
                  </button>
                </div>
              </div>

              <section className="rounded-3xl bg-white/80 p-5 sm:p-6 shadow-sm space-y-4 border border-white/70">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      {t.settingsTitle}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">{t.settingsDesc}</p>
                  </div>
                  {isKeySaved && (
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                      <Check size={14} />
                      {t.apiKeysActive || t.apiKeyActive}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    {t.apiProvider}
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PROVIDERS.map((providerName) => (
                      <button
                        key={providerName}
                        type="button"
                        onClick={() => {
                          setProvider(providerName);
                          setUserApiKey(apiKeys[providerName] || '');
                        }}
                        className={cn(
                          'px-3 py-2 text-xs font-bold rounded-xl border transition-all',
                          provider === providerName
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:border-emerald-200'
                        )}
                      >
                        {providerName.charAt(0).toUpperCase() + providerName.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder={PROVIDER_PLACEHOLDERS[provider]}
                    value={userApiKey}
                    onChange={(event) => setUserApiKey(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none focus:border-emerald-400"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={onSaveApiKey}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700"
                    >
                      <Key size={16} />
                      {t.saveBtn}
                    </button>
                    <a
                      href={PROVIDER_LINKS[provider]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      {t.noKeyLink}
                    </a>
                  </div>
                </div>
              </section>

              <FeedPanel
                t={t}
                sources={feedSources}
                items={dailyFeedItems}
                isLoading={isFeedLoading}
                error={feedError}
                onAddSource={onAddFeedSource}
                onToggleSource={onToggleFeedSource}
                onRemoveSource={onRemoveFeedSource}
                onRefresh={onRefreshFeed}
                onUseLink={(url) => {
                  onUseFeedItem(url);
                  onClose();
                }}
                onSummarizeNow={(url) => {
                  onSummarizeFeedItem(url);
                  onClose();
                }}
              />

              <InsightsPanel
                t={t}
                insights={appInsights}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
