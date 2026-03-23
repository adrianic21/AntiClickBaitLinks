import { Info, ShieldCheck, ArrowRight, X, HelpCircle, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../hooks/useAppState';
import type { Translations } from '../translations';
import { FAQ_CONTENT, USE_CASES } from '../translations';

interface InfoPanelProps {
  uiLanguage: string;
  t: Translations;
  show: boolean;
  dontShowAgain: boolean;
  showApiPrivacy: boolean;
  setShowApiPrivacy: (v: boolean) => void;
  isPremium: boolean;
  unlockPass: string;
  lockError: boolean;
  deviceMismatchError: boolean;
  isLoading: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onPassChange: (v: string) => void;
  onErrorChange: (v: boolean) => void;
}

const API_LINKS = [
  { label: 'Gemini', href: 'https://aistudio.google.com/app/apikey' },
  { label: 'OpenRouter', href: 'https://openrouter.ai/keys' },
  { label: 'Mistral', href: 'https://console.mistral.ai/api-keys' },
  { label: 'DeepSeek', href: 'https://platform.deepseek.com/api_keys' },
];

export function InfoPanel({
  t, show, dontShowAgain, showApiPrivacy, setShowApiPrivacy,
  isPremium, unlockPass, lockError, isLoading,
  onClose, onUnlock, onPassChange, onErrorChange, deviceMismatchError,
  uiLanguage,
}: InfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'faq' | 'usecases'>('info');
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]"
            onClick={onClose}
          />
          <motion.div
            initial={dontShowAgain ? { opacity: 0, y: -20, scale: 0.95 } : { opacity: 0, scale: 0.9, y: 20 }}
            animate={dontShowAgain ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={dontShowAgain ? { opacity: 0, y: -20, scale: 0.95 } : { opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[46] w-[90%] max-w-md glass rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2">
              <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                <Info size={18} /> {t.infoTitle}
              </h3>
              <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
                <X size={20} />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
              <button onClick={() => setActiveTab('info')}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'info' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}>
                <Info size={12} /> {t.infoTitle.split(' ')[0]}
              </button>
              <button onClick={() => setActiveTab('faq')}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'faq' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}>
                <HelpCircle size={12} /> FAQ
              </button>
              <button onClick={() => setActiveTab('usecases')}
                className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                  activeTab === 'usecases' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}>
                <Lightbulb size={12} /> Tips
              </button>
            </div>

            {/* Info tab */}
            {activeTab === 'info' && <div className="space-y-5">
              {/* Description */}
              <section>
                <p className="text-base text-zinc-600 leading-relaxed">{t.infoDesc}</p>
              </section>

              {/* How to use */}
              <section className="space-y-3">
                <h4 className="text-base font-extrabold text-zinc-800">{t.infoHowToTitle}</h4>
                <div className="space-y-4">
                  {/* Step 1 */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-zinc-800">{t.infoStep1Title}</p>
                      <p className="text-sm text-zinc-500 leading-relaxed">{t.infoStep1Desc}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {API_LINKS.map(link => (
                          <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                            className="text-xs bg-zinc-100 px-2 py-1 rounded-md hover:bg-zinc-200 transition-colors"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-zinc-800">{t.infoStep2Title}</p>
                      <p className="text-sm text-zinc-500 leading-relaxed">{t.infoStep2Desc}</p>
                      <button onClick={() => setShowApiPrivacy(!showApiPrivacy)}
                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors mt-2"
                      >
                        <ShieldCheck size={12} /> {t.infoApiPrivacyTitle}
                      </button>
                      <AnimatePresence>
                        {showApiPrivacy && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
                          >
                            <p className="text-xs text-zinc-500 bg-emerald-50/50 p-2 rounded-lg mt-1 border border-emerald-100">
                              {t.infoApiPrivacyDesc}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </section>

              {/* Free version */}
              <section className="space-y-2">
                <h4 className="text-base font-extrabold text-zinc-800">{t.infoLimitsTitle}</h4>
                <p className="text-base text-zinc-600 leading-relaxed">{t.infoLimitsDesc}</p>
              </section>

              {/* Premium */}
              <section className="space-y-3">
                <h4 className="text-base font-extrabold text-zinc-800">{t.infoPremiumTitle}</h4>
                <p className="text-base text-zinc-600 leading-relaxed">{t.infoPremiumDesc}</p>
                <a href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                  target="_blank" rel="noopener noreferrer"
                  className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 text-sm"
                >
                  {t.buyBtn} <ArrowRight size={16} />
                </a>

                {!isPremium && (
                  <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                    <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t.alreadyPremium}</h5>
                    <div className="flex gap-2">
                      <input type="password" placeholder={t.unlockPlaceholder} value={unlockPass}
                        onChange={e => { onPassChange(e.target.value); onErrorChange(false); }}
                        className={cn(
                          "flex-1 px-3 py-2 bg-zinc-100 rounded-xl outline-none transition-all text-xs font-mono",
                          lockError ? "ring-1 ring-red-500" : "focus:ring-1 focus:ring-emerald-500"
                        )}
                      />
                      <button onClick={onUnlock} disabled={isLoading}
                        className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all active:scale-[0.95] disabled:opacity-60"
                      >
                        {t.unlockBtn}
                      </button>
                    </div>
                    {lockError && (
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">
                        {deviceMismatchError ? t.deviceMismatchError : t.invalidPass}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* Close button */}
              <div className="pt-4 border-t border-zinc-100">
                <button onClick={onClose}
                  className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all active:scale-[0.98]"
                >
                  {t.closeBtn}
                </button>
              </div>
            </div>}

            {/* FAQ tab */}
            {activeTab === 'faq' && (
              <div className="space-y-3">
                {(FAQ_CONTENT[uiLanguage as keyof typeof FAQ_CONTENT] || FAQ_CONTENT.English).map((item, i) => (
                  <details key={i} className="group rounded-xl border border-zinc-100 overflow-hidden">
                    <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition-colors list-none">
                      {item.q}
                      <span className="text-zinc-400 group-open:rotate-180 transition-transform text-lg leading-none ml-2 shrink-0">›</span>
                    </summary>
                    <p className="px-4 pb-3 pt-1 text-sm text-zinc-600 leading-relaxed border-t border-zinc-100">{item.a}</p>
                  </details>
                ))}
                <button onClick={onClose} className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all mt-2">
                  {t.closeBtn}
                </button>
              </div>
            )}

            {/* Use cases tab */}
            {activeTab === 'usecases' && (
              <div className="space-y-3">
                {(USE_CASES[uiLanguage as keyof typeof USE_CASES] || USE_CASES.English).map((item, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-zinc-800 mb-0.5">{item.title}</p>
                      <p className="text-xs text-zinc-600 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
                <button onClick={onClose} className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all mt-2">
                  {t.closeBtn}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
