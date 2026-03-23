import { ShieldCheck, Languages, Info, Key, Settings, Check, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { LANGUAGES } from '../translations';
import type { Translations } from '../translations';
import type { Provider, ApiKeys } from '../services/geminiService';

interface TopBarProps {
  t: Translations;
  isPremium: boolean;
  remainingSearches: number;
  isKeySaved: boolean;
  showSettings: boolean;
  showInfo: boolean;
  showLangMenu: boolean;
  showStatusPopover: boolean;
  uiLanguage: string;
  timeLeft: string;
  nextResetTime: number | null;
  provider: Provider;
  setProvider: (p: Provider) => void;
  userApiKey: string;
  setUserApiKey: (k: string) => void;
  apiKeys: ApiKeys;
  togglePopup: (p: string) => void;
  setShowStatusPopover: (v: boolean) => void;
  setShowLangMenu: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  openLockModal: () => void;
  changeUiLanguage: (lang: string) => void;
  saveApiKey: () => void;
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

const BACKDROP = "fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]";
const MODAL = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[46]";

export function TopBar({
  t, isPremium, remainingSearches, isKeySaved,
  showSettings, showInfo, showLangMenu, showStatusPopover,
  uiLanguage, timeLeft, nextResetTime, provider, setProvider,
  userApiKey, setUserApiKey, apiKeys,
  togglePopup, setShowStatusPopover, setShowLangMenu, setShowSettings,
  openLockModal, changeUiLanguage, saveApiKey,
}: TopBarProps) {
  return (
    <>
      {/* Button bar */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        {/* Account status */}
        <button
          onClick={() => togglePopup('status')}
          className={cn(
            "px-4 py-3 rounded-2xl transition-all shadow-lg flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
            isPremium
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-100"
          )}
        >
          {isPremium ? (
            <>
              <ShieldCheck size={16} />
              <span className="hidden sm:inline">{t.statusPremium}</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="hidden sm:inline">{t.statusFree}</span>
              <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md text-[10px]">
                {remainingSearches}/10
              </span>
            </>
          )}
        </button>

        {/* Language */}
        <button
          onClick={() => togglePopup('lang')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
            showLangMenu ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          <Languages size={20} />
          <span className="text-sm font-bold hidden sm:inline">
            {LANGUAGES.find(l => l.code === uiLanguage)?.flag}
          </span>
        </button>

        {/* Info */}
        <button
          onClick={() => togglePopup('info')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg",
            showInfo ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          <Info size={20} />
        </button>

        {/* Settings */}
        <button
          onClick={() => togglePopup('settings')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
            showSettings ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          {isKeySaved && <Check size={20} className="text-emerald-500" />}
          <Settings size={20} className={cn(showSettings && "animate-spin-slow")} />
        </button>
      </div>

      {/* Status popover */}
      <AnimatePresence>
        {showStatusPopover && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={BACKDROP} onClick={() => setShowStatusPopover(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(MODAL, "w-[90%] max-w-xs glass rounded-2xl p-4 shadow-2xl space-y-3")}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {isPremium ? t.statusPremium : t.statusFree}
                </h4>
                <button onClick={() => setShowStatusPopover(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-zinc-50/50 p-2 rounded-xl border border-zinc-100">
                  <span className="text-xs text-zinc-500">{t.remainingSearches}</span>
                  <span className="text-sm font-bold text-zinc-900">
                    {isPremium ? t.unlimited : `${remainingSearches}/10`}
                  </span>
                </div>
                {!isPremium && nextResetTime && (
                  <div className="flex justify-between items-center bg-red-50/50 p-2 rounded-xl border border-red-100">
                    <span className="text-xs text-red-500">{t.limitReset}</span>
                    <span className="text-sm font-bold text-red-600 font-mono">{timeLeft || '--:--:--'}</span>
                  </div>
                )}
              </div>
              {!isPremium && (
                <button onClick={() => { setShowStatusPopover(false); openLockModal(); }}
                  className="w-full py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all active:scale-[0.98]"
                >
                  {t.buyBtn}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Language menu */}
      <AnimatePresence>
        {showLangMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={BACKDROP} onClick={() => setShowLangMenu(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(MODAL, "w-[90%] max-w-xs glass rounded-2xl p-4 shadow-2xl space-y-1")}
            >
              <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">{t.uiLang}</p>
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => changeUiLanguage(lang.code)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                    uiLanguage === lang.code ? "bg-emerald-50 text-emerald-700 font-bold" : "text-zinc-600 hover:bg-zinc-50"
                  )}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={BACKDROP} onClick={() => setShowSettings(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(MODAL, "w-[90%] max-w-sm glass rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto")}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                  <Key size={18} /> {t.settingsTitle}
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-zinc-500">{t.settingsDesc}</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    {t.apiProvider}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PROVIDERS.map(p => (
                      <button key={p}
                        onClick={() => { setProvider(p); setUserApiKey(apiKeys[p] || ''); }}
                        className={cn(
                          "px-2 py-2 text-[10px] font-bold rounded-lg border transition-all",
                          provider === p
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : "bg-white border-zinc-200 text-zinc-600 hover:border-emerald-200"
                        )}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder={PROVIDER_PLACEHOLDERS[provider]}
                    value={userApiKey}
                    onChange={e => setUserApiKey(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  <button onClick={saveApiKey}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                  >
                    {t.saveBtn}
                  </button>
                </div>
              </div>

              <a href={PROVIDER_LINKS[provider]} target="_blank" rel="noopener noreferrer"
                className="block text-center text-[10px] text-emerald-600 hover:underline"
              >
                {t.noKeyLink}
              </a>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
