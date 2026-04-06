import { ShieldCheck, Languages, Info, UserRound, X, Rss } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import { LANGUAGES } from '../translations';
import type { Translations } from '../translations';

interface TopBarProps {
  t: Translations;
  isPremium: boolean;
  remainingSearches: number;
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

const BACKDROP = "fixed inset-0 bg-black/30 backdrop-blur-sm z-[45]";
const MODAL = "fixed top-14 right-4 z-[46]";

export function TopBar({
  t, isPremium, remainingSearches,
  showInfo, showLangMenu, showProfile, showFeed, showStatusPopover,
  uiLanguage, timeLeft, nextResetTime,
  togglePopup, setShowStatusPopover, setShowLangMenu,
  openLockModal, changeUiLanguage, currentUser,
}: TopBarProps) {
  const isLimitReached = !isPremium && remainingSearches <= 0;
  const shouldShowCountdown = !isPremium && Boolean(nextResetTime);
  const guestLabel = uiLanguage === 'Spanish' ? 'Invitado' : 'Guest';
  // Límite gratuito: 5 búsquedas cada 24h
  const remaining = !isPremium && remainingSearches < 0 ? '--/5' : `${Math.max(0, remainingSearches)}/5`;

  return (
    <>
      {/* Compact nav buttons */}
      <div className="flex items-center gap-1">
        {/* Status chip */}
        <button
          onClick={() => togglePopup('status')}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
            isPremium
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : isLimitReached
                ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200"
          )}
        >
          {isPremium ? (
            <><ShieldCheck size={13} /><span className="hidden sm:inline">{t.statusPremium}</span></>
          ) : (
            <>
              <span className={cn("w-1.5 h-1.5 rounded-full", isLimitReached ? "bg-red-500" : "bg-amber-400")} />
              <span className="hidden sm:inline">{t.statusFree}</span>
              <span className="text-[10px] font-bold opacity-70">{remaining}</span>
            </>
          )}
        </button>

        {/* Countdown pill */}
        {isLimitReached && shouldShowCountdown && (
          <button
            type="button" onClick={openLockModal}
            className="px-2.5 py-1.5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-mono text-[10px] font-bold"
          >
            {timeLeft || '--:--:--'}
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-5 bg-zinc-200 mx-1" />

        {/* Language */}
        <button
          onClick={() => togglePopup('lang')}
          className={cn(
            "p-2 rounded-xl text-sm transition-all",
            showLangMenu ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
          )}
        >
          <Languages size={16} />
        </button>

        {/* Info */}
        <button
          onClick={() => togglePopup('info')}
          className={cn(
            "p-2 rounded-xl transition-all",
            showInfo ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
          )}
        >
          <Info size={16} />
        </button>

        {/* Feed */}
        <button
          onClick={() => togglePopup('feed')}
          className={cn(
            "p-2 rounded-xl transition-all",
            showFeed ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
          )}
          title={t.feedTitle}
        >
          <Rss size={16} />
        </button>

        {/* Profile */}
        <button
          onClick={() => togglePopup('profile')}
          className={cn(
            "p-2 rounded-xl transition-all",
            showProfile ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
          )}
        >
          <UserRound size={16} />
        </button>
      </div>

      {/* ── Status popover ── */}
      <AnimatePresence>
        {showStatusPopover && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={BACKDROP} onClick={() => setShowStatusPopover(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.15 }}
              className={cn(MODAL, "w-72 rounded-2xl border border-zinc-200 bg-white shadow-xl p-4 space-y-3")}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {isPremium ? t.statusPremium : t.statusFree}
                </p>
                <button onClick={() => setShowStatusPopover(false)} className="text-zinc-400 hover:text-zinc-600 p-1">
                  <X size={13} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-0.5">{t.accountLabel}</p>
                  <p className="text-sm font-semibold text-zinc-900">{currentUser?.displayName || guestLabel}</p>
                  {currentUser?.email && <p className="text-xs text-zinc-500 break-all">{currentUser.email}</p>}
                </div>
                <div className="flex justify-between items-center rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2.5">
                  <span className="text-xs text-zinc-500">{t.remainingSearches}</span>
                  <span className="text-sm font-bold text-zinc-900">{isPremium ? t.unlimited : remaining}</span>
                </div>
                {!isPremium && nextResetTime && (
                  <div className={cn(
                    "flex justify-between items-center px-3 py-2.5 rounded-xl border",
                    isLimitReached ? "bg-red-50 border-red-100" : "bg-amber-50/60 border-amber-100"
                  )}>
                    <span className={cn("text-xs", isLimitReached ? "text-red-500" : "text-amber-700")}>{t.limitReset}</span>
                    <span className={cn("text-xs font-bold font-mono", isLimitReached ? "text-red-600" : "text-amber-700")}>{timeLeft || '--:--:--'}</span>
                  </div>
                )}
              </div>
              {!isPremium && (
                <a
                  href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                  target="_blank" rel="noopener noreferrer"
                  onClick={() => setShowStatusPopover(false)}
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center"
                >
                  {t.buyBtn}
                </a>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Language menu ── */}
      <AnimatePresence>
        {showLangMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={BACKDROP} onClick={() => setShowLangMenu(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }} transition={{ duration: 0.15 }}
              className={cn(MODAL, "w-52 rounded-2xl border border-zinc-200 bg-white shadow-xl p-2")}
            >
              <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{t.uiLang}</p>
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => changeUiLanguage(lang.code)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
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
