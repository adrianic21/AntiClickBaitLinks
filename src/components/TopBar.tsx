import { ShieldCheck, Languages, Info, UserRound, X, Rss } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { LANGUAGES } from '../translations';
import type { Translations } from '../translations';

interface TopBarProps {
  t: Translations;
  isPremium: boolean;
  remainingSearches: number;
  // FIX Bug 3: explicit loading flag so the counter shows '—/10' instead of
  // briefly flashing a stale value while the server limit is being fetched.
  isLimitsLoading: boolean;
  showInfo: boolean;
  showLangMenu: boolean;
  showProfile: boolean;
  showFeed: boolean;
  showStatusPopover: boolean;
  uiLanguage: string;
  timeLeft: string;
  nextResetTime: number | null;
  togglePopup: (p: string) => void;
  setShowStatusPopover: (v: boolean) => void;
  setShowLangMenu: (v: boolean) => void;
  openLockModal: () => void;
  changeUiLanguage: (lang: string) => void;
  currentUser: {
    email: string;
    displayName: string;
  } | null;
}

const BACKDROP = "fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]";
const MODAL = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[46]";

// The server-side free limit — must match server.ts FREE_LIMIT
const FREE_LIMIT = 10;

export function TopBar({
  t, isPremium, remainingSearches, isLimitsLoading,
  showInfo, showLangMenu, showProfile, showFeed, showStatusPopover,
  uiLanguage, timeLeft, nextResetTime,
  togglePopup, setShowStatusPopover, setShowLangMenu,
  openLockModal, changeUiLanguage, currentUser,
}: TopBarProps) {
  const isLimitReached = !isPremium && !isLimitsLoading && remainingSearches <= 0;
  const shouldShowCountdown = !isPremium && Boolean(nextResetTime);
  const guestLabel = uiLanguage === 'Spanish' ? 'Invitado' : 'Guest';

  // FIX Bug 3: While limits are loading, show a neutral placeholder instead of a
  // stale/incorrect value. Once loaded, show the real remaining/total.
  const remainingLabel = isLimitsLoading
    ? '—/10'
    : `${Math.max(0, remainingSearches)}/${FREE_LIMIT}`;

  return (
    <>
      {/* Button bar */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center gap-2 px-3 py-3">
        {/* Account status */}
        <button
          onClick={() => togglePopup('status')}
          className={cn(
            "px-4 py-3 rounded-2xl transition-all shadow-lg flex items-center gap-2 font-bold text-xs uppercase tracking-wider",
            isPremium
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
              : isLimitReached
                ? "bg-red-50 text-red-600 border border-red-200"
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
              <div className={cn(
                "w-2 h-2 rounded-full",
                isLimitsLoading ? "bg-zinc-300" : isLimitReached ? "bg-red-500 animate-pulse" : "bg-amber-400 animate-pulse"
              )} />
              <span className="hidden sm:inline">{t.statusFree}</span>
              <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md text-[10px]">
                {remainingLabel}
              </span>
            </>
          )}
        </button>

        {isLimitReached && shouldShowCountdown && (
          <button
            type="button"
            onClick={openLockModal}
            className="px-3 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 shadow-lg font-mono text-xs font-bold"
            title={t.limitReset}
          >
            {timeLeft || '--:--:--'}
          </button>
        )}

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

        {/* Feed */}
        <button
          onClick={() => togglePopup('feed')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg",
            showFeed ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
          title={t.feedTitle}
        >
          <Rss size={20} />
        </button>

        {/* Profile */}
        <button
          onClick={() => togglePopup('profile')}
          className={cn(
            "p-3 rounded-2xl transition-all shadow-lg flex items-center gap-2",
            showProfile ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
          )}
        >
          <UserRound size={20} />
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
                <div className="bg-zinc-50/50 p-2 rounded-xl border border-zinc-100">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{t.accountLabel}</div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {currentUser?.displayName || guestLabel}
                  </div>
                  {currentUser?.email && (
                    <div className="text-xs text-zinc-500 break-all">{currentUser.email}</div>
                  )}
                </div>
                <div className="flex justify-between items-center bg-zinc-50/50 p-2 rounded-xl border border-zinc-100">
                  <span className="text-xs text-zinc-500">{t.remainingSearches}</span>
                  <span className="text-sm font-bold text-zinc-900">
                    {isPremium ? t.unlimited : remainingLabel}
                  </span>
                </div>
                {!isPremium && nextResetTime && (
                  <div className={cn(
                    "flex justify-between items-center p-2 rounded-xl border",
                    isLimitReached ? "bg-red-50/50 border-red-100" : "bg-amber-50/60 border-amber-100"
                  )}>
                    <span className={cn("text-xs", isLimitReached ? "text-red-500" : "text-amber-700")}>{t.limitReset}</span>
                    <span className={cn("text-sm font-bold font-mono", isLimitReached ? "text-red-600" : "text-amber-700")}>{timeLeft || '--:--:--'}</span>
                  </div>
                )}
              </div>
              {!isPremium && (
                <a
                  href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowStatusPopover(false)}
                  className="w-full py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  {t.buyBtn}
                </a>
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
    </>
  );
}
