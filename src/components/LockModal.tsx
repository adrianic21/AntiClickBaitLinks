import { Lock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import type { Translations } from '../translations';

interface LockModalProps {
  t: Translations;
  show: boolean;
  timeLeft: string;
  nextResetTime: number | null;
  unlockPass: string;
  lockError: boolean;
  deviceMismatchError: boolean;
  isLoading: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onPassChange: (v: string) => void;
  onErrorChange: (v: boolean) => void;
}

export function LockModal({
  t, show, timeLeft, nextResetTime, unlockPass, lockError, isLoading,
  onClose, onUnlock, onPassChange, onErrorChange, deviceMismatchError,
}: LockModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-900/80 backdrop-blur-md"
        >
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center shadow-inner">
                <Lock size={40} />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900">{t.lockTitle}</h2>
              <p className="text-zinc-500 leading-relaxed">{t.lockDesc}</p>
              {/* Always show countdown when there's a reset time */}
              {nextResetTime && (
                <div className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-mono font-bold text-sm flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider opacity-70">{t.resetIn}</span>
                  {timeLeft || '--:--:--'}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <a href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                target="_blank" rel="noopener noreferrer"
                className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-xl flex items-center justify-center gap-2"
              >
                {t.buyBtn} <ArrowRight size={18} />
              </a>

              <div className="space-y-2">
                <input
                  type="password"
                  placeholder={t.unlockPlaceholder}
                  value={unlockPass}
                  onChange={e => { onPassChange(e.target.value); onErrorChange(false); }}
                  className={cn(
                    "w-full px-6 py-4 bg-zinc-100 rounded-2xl outline-none transition-all text-center font-mono tracking-widest",
                    lockError ? "ring-2 ring-red-500/20" : "focus:ring-2 focus:ring-emerald-500/20"
                  )}
                />
                {lockError && (
                  <p className="text-[10px] text-red-500 font-bold text-center uppercase tracking-wider">
                    {deviceMismatchError ? t.deviceMismatchError : t.invalidPass}
                  </p>
                )}
                <button onClick={onUnlock} disabled={isLoading}
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all active:scale-[0.98] shadow-xl disabled:opacity-60"
                >
                  {t.unlockBtn}
                </button>
              </div>
            </div>

            <button onClick={onClose}
              className="w-full py-2 text-zinc-400 hover:text-zinc-600 text-sm font-medium transition-colors"
            >
              {t.clear}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
