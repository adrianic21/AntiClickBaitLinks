import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Key, LogOut, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { InsightsPanel } from './InsightsPanel';
import type { Translations } from '../translations';
import type { ApiKeys, Provider } from '../services/geminiService';
import type { AppInsights } from '../lib/appInsights';

interface ProfilePanelProps {
  uiLanguage: string;
  t: Translations;
  show: boolean;
  onClose: () => void;
  currentUser: { email: string; displayName: string };
  isPremium: boolean;
  provider: Provider;
  setProvider: (provider: Provider) => void;
  userApiKey: string;
  setUserApiKey: (value: string) => void;
  apiKeys: ApiKeys;
  isKeySaved: boolean;
  apiKeySaveError: string | null;
  onSaveApiKey: () => void;
  onLogout: () => void;
  appInsights: AppInsights;
  onUpdateName: (name: string) => void;
  remainingSearches: number;
  nextResetTime: number | null;
  timeLeft: string;
  unlockPass: string;
  lockError: boolean;
  deviceMismatchError: boolean;
  isLoading: boolean;
  onPassChange: (v: string) => void;
  onUnlock: () => void;
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

function PremiumSection({
  uiLanguage,
  t,
  unlockPass,
  lockError,
  deviceMismatchError,
  isLoading,
  onPassChange,
  onUnlock,
}: {
  uiLanguage: string;
  t: Translations;
  unlockPass: string;
  lockError: boolean;
  deviceMismatchError: boolean;
  isLoading: boolean;
  onPassChange: (v: string) => void;
  onUnlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const copy = uiLanguage === 'Spanish'
    ? {
        title: 'Hazte Premium',
        subtitle: 'Resúmenes ilimitados · Pago único',
        benefits: [
          'Resúmenes ilimitados sin esperas',
          'Acceso en todos tus dispositivos',
          'Pago único sin suscripción',
        ],
      }
    : {
        title: 'Go Premium',
        subtitle: 'Unlimited summaries · One-time payment',
        benefits: [
          'Unlimited summaries without waiting',
          'Access on all your devices',
          'One-time payment with no subscription',
        ],
      };

  return (
    <section className="rounded-3xl overflow-hidden border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-extrabold text-emerald-800">{copy.title}</p>
            <p className="text-xs text-emerald-600">{copy.subtitle}</p>
          </div>
        </div>
        {open
          ? <ChevronUp size={18} className="text-emerald-600 shrink-0" />
          : <ChevronDown size={18} className="text-emerald-600 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              <ul className="space-y-1.5">
                {copy.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-xs text-emerald-800">
                    <Check size={13} className="text-emerald-500 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              <a
                href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[0.98]"
              >
                {t.buyBtn} <ArrowRight size={16} />
              </a>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-emerald-200" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {t.alreadyPremium}
                </span>
                <div className="flex-1 h-px bg-emerald-200" />
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={t.unlockPlaceholder}
                    value={unlockPass}
                    onChange={(e) => onPassChange(e.target.value)}
                    className={cn(
                      'flex-1 rounded-xl border bg-white px-3 py-2.5 text-xs font-mono outline-none transition-all',
                      lockError
                        ? 'border-red-300 ring-1 ring-red-400'
                        : 'border-zinc-200 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'
                    )}
                  />
                  <button
                    type="button"
                    onClick={onUnlock}
                    disabled={isLoading}
                    className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 active:scale-[0.95] disabled:opacity-60"
                  >
                    {t.unlockBtn}
                  </button>
                </div>
                {lockError && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">
                    {deviceMismatchError ? t.deviceMismatchError : t.invalidPass}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function ProfilePanel({
  uiLanguage,
  t, show, onClose, currentUser, isPremium,
  provider, setProvider, userApiKey, setUserApiKey, apiKeys, isKeySaved, apiKeySaveError, onSaveApiKey,
  onLogout, appInsights, onUpdateName,
  remainingSearches, nextResetTime, timeLeft,
  unlockPass, lockError, deviceMismatchError, isLoading, onPassChange, onUnlock,
}: ProfilePanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [tempName, setTempName] = useState(currentUser.displayName);

  const isLimitReached = !isPremium && remainingSearches <= 0;
  const remainingLabel = remainingSearches < 0
    ? '--/5'
    : `${Math.max(0, Math.min(typeof remainingSearches === 'number' ? remainingSearches : 0, 5))}/5`;

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (!trimmed || trimmed === currentUser.displayName) {
      setIsEditingName(false);
      setTempName(currentUser.displayName);
      return;
    }
    onUpdateName(trimmed);
    setIsEditingName(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="fixed inset-x-4 top-24 bottom-6 z-[46] mx-auto w-auto max-w-4xl glass rounded-[2rem] p-5 sm:p-6 shadow-2xl overflow-y-auto text-zinc-900 dark:text-zinc-100"
          >
            <div className="space-y-6">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <UserRound size={22} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      {t.profileTitle || 'Profile'}
                    </p>
                    <div className="flex items-center gap-2">
                      {isEditingName ? (
                        <>
                          <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') { setIsEditingName(false); setTempName(currentUser.displayName); }
                            }}
                            className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-400"
                            placeholder={t.authNamePlaceholder || 'Your name or alias'}
                          />
                          <button type="button" onClick={handleSaveName} className="text-emerald-600 text-xs font-bold">
                            {uiLanguage === 'Spanish' ? 'Guardar' : 'Save'}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-bold text-zinc-900">{currentUser.displayName}</p>
                          <button
                            type="button"
                            onClick={() => { setIsEditingName(true); setTempName(currentUser.displayName); }}
                            className="text-zinc-400 hover:text-emerald-600 text-xs"
                            title={uiLanguage === 'Spanish' ? 'Editar nombre visible' : 'Edit display name'}
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 break-all">{currentUser.email}</p>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 transition-all hover:bg-zinc-50"
                    >
                      <LogOut size={14} />
                      {t.authLogout || 'Log out'}
                    </button>
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

              {/* Account status */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-white/85 p-4 shadow-sm border border-white/70">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                    {t.accountLabel || 'Account'}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-zinc-900">
                    {isPremium ? t.statusPremium : t.statusFree}
                  </p>
                  {!isPremium && (
                    <div className="mt-1 space-y-2">
                      <p className="text-sm text-zinc-500">
                        {t.remainingSearches}: {remainingLabel}
                      </p>
                      {nextResetTime && (
                        <div className={cn(
                          "flex items-center justify-between gap-2 rounded-xl px-3 py-2 border",
                          isLimitReached ? "bg-red-50 border-red-100" : "bg-amber-50/70 border-amber-100"
                        )}>
                          <span className={cn("text-[10px] font-bold uppercase tracking-wide", isLimitReached ? "text-red-400" : "text-amber-700")}>
                            {t.limitReset || 'Resets in'}
                          </span>
                          <span className={cn("font-mono text-sm font-bold", isLimitReached ? "text-red-600" : "text-amber-700")}>
                            {timeLeft || '--:--:--'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* API settings */}
              <section className="rounded-3xl bg-white/80 p-5 sm:p-6 shadow-sm space-y-4 border border-white/70">
                <button
                  type="button"
                  onClick={() => setShowApiSettings((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400 flex items-center gap-2">
                      <Wrench size={14} />
                      {t.settingsTitle}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      {uiLanguage === 'Spanish'
                        ? 'Gestiona tus proveedores y claves API solo cuando lo necesites.'
                        : 'Manage your API providers and keys only when you need to.'}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                    {isKeySaved && (
                      <div className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                        <Check size={14} />
                        <span className="min-w-0 break-words text-left leading-tight">
                          {t.apiKeysActive || t.apiKeyActive}
                        </span>
                      </div>
                    )}
                    {showApiSettings ? <ChevronUp size={18} className="text-zinc-500" /> : <ChevronDown size={18} className="text-zinc-500" />}
                  </div>
                </button>

                {showApiSettings && (
                  <>
                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 border border-emerald-100">
                      {uiLanguage === 'Spanish'
                        ? 'Tus API Keys se guardan cifradas en tu cuenta, se sincronizan entre dispositivos y nunca se comparten con terceros.'
                        : 'Your API keys are encrypted in your account, synced across devices, and never shared with third parties.'}
                    </p>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                        {t.apiProvider}
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {PROVIDERS.map((providerName) => (
                          <button
                            key={providerName}
                            type="button"
                            onClick={() => { setProvider(providerName); setUserApiKey(apiKeys[providerName] || ''); }}
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
                        onChange={(e) => setUserApiKey(e.target.value)}
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
                      {apiKeySaveError && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5 border border-red-100">
                          {apiKeySaveError}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </section>

              {/* Activity insights */}
              <InsightsPanel t={t} insights={appInsights} />

              {/* Premium section for free users */}
              {!isPremium && (
                <PremiumSection
                  uiLanguage={uiLanguage}
                  t={t}
                  unlockPass={unlockPass}
                  lockError={lockError}
                  deviceMismatchError={deviceMismatchError}
                  isLoading={isLoading}
                  onPassChange={onPassChange}
                  onUnlock={onUnlock}
                />
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
