import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Key, LogOut, Sparkles, UserRound, X, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { InsightsPanel } from './InsightsPanel';
import type { Translations } from '../translations';
import type { ApiKeys, Provider } from '../services/geminiService';
import type { AppInsights } from '../lib/appInsights';
import { validateApiKey } from '../services/geminiService';

interface ProfilePanelProps {
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
  onSaveApiKey: (provider?: Provider, key?: string) => void;
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

// Límite gratuito: 5 búsquedas cada 24h
const FREE_LIMIT = 5;

function PremiumSection({
  t, unlockPass, lockError, deviceMismatchError, isLoading, onPassChange, onUnlock,
}: {
  t: Translations; unlockPass: string; lockError: boolean; deviceMismatchError: boolean;
  isLoading: boolean; onPassChange: (v: string) => void; onUnlock: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl overflow-hidden border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-800">¡Hazte Premium!</p>
            <p className="text-xs text-emerald-600">Búsquedas ilimitadas · Pago único</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-emerald-600 shrink-0" /> : <ChevronDown size={16} className="text-emerald-600 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              <ul className="space-y-1.5">
                {['Búsquedas ilimitadas sin esperar', 'Acceso en todos tus dispositivos', 'Pago único — sin suscripciones'].map((b) => (
                  <li key={b} className="flex items-center gap-2 text-xs text-emerald-800">
                    <Check size={12} className="text-emerald-500 shrink-0" />{b}
                  </li>
                ))}
              </ul>
              <a
                href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700"
              >
                {t.buyBtn} <ArrowRight size={15} />
              </a>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-emerald-200" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">{t.alreadyPremium}</span>
                <div className="flex-1 h-px bg-emerald-200" />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={t.unlockPlaceholder}
                    value={unlockPass}
                    onChange={(e) => onPassChange(e.target.value)}
                    autoComplete="off" data-form-type="other" data-lpignore="true"
                    className={cn(
                      'flex-1 rounded-xl border bg-white px-3 py-2.5 text-xs font-mono outline-none transition-all',
                      lockError ? 'border-red-300 ring-1 ring-red-400' : 'border-zinc-200 focus:border-emerald-400'
                    )}
                  />
                  <button
                    type="button" onClick={onUnlock} disabled={isLoading}
                    className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-zinc-800 disabled:opacity-60"
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

function ApiKeyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <input
        type={revealed ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off" data-form-type="other" data-lpignore="true" spellCheck={false}
        className="w-full rounded-xl border border-zinc-200 bg-white pl-4 pr-11 py-3 text-sm text-zinc-800 outline-none focus:border-emerald-400 font-mono transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors p-1"
          tabIndex={-1}
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

export function ProfilePanel({
  t, show, onClose, currentUser, isPremium,
  provider, setProvider, userApiKey, setUserApiKey, apiKeys, isKeySaved, onSaveApiKey,
  onLogout, appInsights, onUpdateName,
  remainingSearches, nextResetTime, timeLeft,
  unlockPass, lockError, deviceMismatchError, isLoading, onPassChange, onUnlock,
}: ProfilePanelProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(currentUser.displayName);
  const [localProvider, setLocalProvider] = useState<Provider>(provider);
  const [localKeyInput, setLocalKeyInput] = useState('');

  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveKeyError, setSaveKeyError] = useState<string | null>(null);
  const [saveKeySuccess, setSaveKeySuccess] = useState(false);

  const prevShowRef = useRef(show);

  useEffect(() => {
    const wasOpen = prevShowRef.current;
    prevShowRef.current = show;
    if (show && !wasOpen) {
      setLocalProvider(provider);
      setLocalKeyInput(apiKeys[provider] || '');
      setSaveKeyError(null);
      setSaveKeySuccess(false);
    }
  }, [show, provider, apiKeys]);

  useEffect(() => {
    if (!saveKeySuccess) return;
    const id = setTimeout(() => setSaveKeySuccess(false), 3000);
    return () => clearTimeout(id);
  }, [saveKeySuccess]);

  const isLimitReached = !isPremium && remainingSearches <= 0;
  // Clamp displayed value to FREE_LIMIT (5)
  const displayRemaining = Math.max(0, Math.min(typeof remainingSearches === 'number' ? remainingSearches : 0, FREE_LIMIT));

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (!trimmed || trimmed === currentUser.displayName) { setIsEditingName(false); setTempName(currentUser.displayName); return; }
    onUpdateName(trimmed);
    setIsEditingName(false);
  };

  const handleProviderClick = (p: Provider) => {
    setLocalProvider(p);
    setLocalKeyInput(apiKeys[p] || '');
    setProvider(p);
    setUserApiKey(apiKeys[p] || '');
    setSaveKeyError(null);
    setSaveKeySuccess(false);
  };

  const handleSaveKey = async () => {
    if (isSavingKey) return;
    setSaveKeyError(null);
    setSaveKeySuccess(false);
    setIsSavingKey(true);

    try {
      const trimmedKey = localKeyInput.trim();

      if (!trimmedKey) {
        onSaveApiKey(localProvider, '');
        setSaveKeySuccess(true);
        setIsSavingKey(false);
        return;
      }

      let isValid = false;
      try {
        isValid = await validateApiKey(localProvider, trimmedKey);
      } catch {
        isValid = true;
      }

      if (!isValid) {
        setSaveKeyError(t.apiKeyInvalidError || 'La clave parece inválida o caducada. Compruébala e inténtalo de nuevo.');
        setIsSavingKey(false);
        return;
      }

      setUserApiKey(trimmedKey);
      onSaveApiKey(localProvider, trimmedKey);
      setSaveKeySuccess(true);
    } catch (err: any) {
      setSaveKeyError(err?.message || 'Error al guardar la clave. Inténtalo de nuevo.');
    } finally {
      setIsSavingKey(false);
    }
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
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 top-20 bottom-6 z-[46] mx-auto w-auto max-w-4xl rounded-2xl border border-zinc-200/80 bg-white/95 backdrop-blur-xl shadow-2xl overflow-y-auto"
          >
            {/* Header strip */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t.profileTitle || 'Perfil'}</p>
                  <p className="text-sm font-semibold text-zinc-900 leading-none mt-0.5">{currentUser.email}</p>
                </div>
              </div>
              <button
                type="button" onClick={onClose}
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Account card */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Name */}
                <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Nombre</p>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text" value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') { setIsEditingName(false); setTempName(currentUser.displayName); }
                        }}
                        autoComplete="name"
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-400"
                      />
                      <button type="button" onClick={handleSaveName} className="text-emerald-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-emerald-50">
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{currentUser.displayName}</p>
                      <button
                        type="button"
                        onClick={() => { setIsEditingName(true); setTempName(currentUser.displayName); }}
                        className="text-zinc-400 hover:text-emerald-600 text-xs transition-colors"
                      >✏️</button>
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">{t.accountLabel || 'Cuenta'}</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">{isPremium ? t.statusPremium : t.statusFree}</p>
                      {!isPremium && (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {t.remainingSearches}: {displayRemaining}/{FREE_LIMIT}
                        </p>
                      )}
                    </div>
                    {isPremium && <span className="text-emerald-500"><Check size={18} /></span>}
                  </div>
                  {isLimitReached && nextResetTime && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 border border-red-100">
                      <span className="text-[10px] font-bold uppercase text-red-400">{t.limitReset}</span>
                      <span className="font-mono text-xs font-bold text-red-600">{timeLeft || '--:--:--'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Logout */}
              <button
                type="button" onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-all hover:bg-zinc-50 hover:text-zinc-900"
              >
                <LogOut size={13} />{t.authLogout || 'Cerrar sesión'}
              </button>

              {/* API Keys section */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t.settingsTitle}</p>
                  <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{t.settingsDesc}</p>
                  <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-2 border border-emerald-100">
                    🔐 Tus claves se guardan cifradas en tu cuenta y se sincronizan entre dispositivos.
                  </p>
                </div>

                {/* Provider selector */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">{t.apiProvider}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p} type="button" onClick={() => handleProviderClick(p)}
                        className={cn(
                          'px-3 py-2 text-xs font-bold rounded-xl border transition-all',
                          localProvider === p
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                            : 'bg-white border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:text-emerald-700'
                        )}
                      >
                        <span className="flex items-center justify-between gap-1">
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                          {apiKeys[p] && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Key input */}
                <div className="space-y-3">
                  <ApiKeyInput
                    value={localKeyInput}
                    onChange={(v) => { setLocalKeyInput(v); setSaveKeyError(null); setSaveKeySuccess(false); }}
                    placeholder={PROVIDER_PLACEHOLDERS[localProvider]}
                  />

                  <AnimatePresence mode="wait">
                    {saveKeyError && (
                      <motion.div
                        key="error"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-700"
                      >
                        <AlertCircle size={13} className="shrink-0 mt-0.5" />
                        <span>{saveKeyError}</span>
                      </motion.div>
                    )}
                    {saveKeySuccess && (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-emerald-700 font-semibold"
                      >
                        <Check size={13} className="shrink-0" />
                        Clave guardada correctamente
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleSaveKey}
                      disabled={isSavingKey}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-all",
                        isSavingKey
                          ? "bg-emerald-400 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
                      )}
                    >
                      {isSavingKey ? (
                        <><Loader2 size={15} className="animate-spin" /> Validando...</>
                      ) : (
                        <><Key size={15} />{t.saveBtn}</>
                      )}
                    </button>
                    <a
                      href={PROVIDER_LINKS[localProvider]}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      {t.noKeyLink}
                    </a>
                  </div>
                </div>
              </section>

              {/* Insights */}
              <InsightsPanel t={t} insights={appInsights} />

              {/* Premium section — only for free users */}
              {!isPremium && (
                <PremiumSection
                  t={t} unlockPass={unlockPass} lockError={lockError}
                  deviceMismatchError={deviceMismatchError} isLoading={isLoading}
                  onPassChange={onPassChange} onUnlock={onUnlock}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
