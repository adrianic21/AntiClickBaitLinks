import { ArrowRight, HelpCircle, Info, Lightbulb, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  { label: 'DeepSeek', href: 'https://platform.deepseek.com/api_keys' },
  { label: 'OpenRouter', href: 'https://openrouter.ai/keys' },
  { label: 'Mistral', href: 'https://console.mistral.ai/api-keys' },
];

const INFO_FAQ = {
  Spanish: [
    {
      q: 'Por que necesito una cuenta?',
      a: 'Tu cuenta sincroniza tus API Keys, tu feed diario, el idioma, el estado Premium y las preferencias entre dispositivos.',
    },
    {
      q: 'Por que necesito una API Key?',
      a: 'La app usa proveedores externos de IA como Gemini, DeepSeek, OpenRouter o Mistral para generar resumenes y procesar el contenido.',
    },
    {
      q: 'Que enlaces se pueden resumir?',
      a: 'La app funciona con articulos y noticias, PDFs con texto, videos de YouTube compatibles con subtitulos y elementos del Feed Diario.',
    },
    {
      q: 'Por que a veces falla un enlace?',
      a: 'Algunas webs bloquean la extraccion automatica o muestran contenido parcial. Si ocurre, prueba el enlace directo al articulo o cambia de proveedor.',
    },
    {
      q: 'Como funciona el limite gratuito?',
      a: 'Las cuentas gratuitas disponen de un numero diario de resumenes. La app te muestra las busquedas restantes y la cuenta atras hasta el siguiente reinicio.',
    },
  ],
  English: [
    {
      q: 'Why do I need an account?',
      a: 'Your account syncs your API keys, daily feed, language, Premium status and preferences across devices.',
    },
    {
      q: 'Why do I need an API key?',
      a: 'The app uses external AI providers such as Gemini, DeepSeek, OpenRouter and Mistral to generate summaries and process content.',
    },
    {
      q: 'What can the app summarize?',
      a: 'The app works with article and news links, text-based PDFs, supported YouTube videos with subtitles and items from the Daily Feed.',
    },
    {
      q: 'Why does a link sometimes fail?',
      a: 'Some websites block automatic extraction or expose only partial content. If that happens, try the direct article URL or switch provider.',
    },
    {
      q: 'How does the free limit work?',
      a: 'Free accounts get a daily summary allowance. The app shows both the remaining searches and the live countdown until the next reset.',
    },
  ],
} as const;

const INFO_USE_CASES = {
  Spanish: [
    { title: 'Titulares antes de compartir', desc: 'Comprueba una noticia antes de enviarla por WhatsApp, Telegram o redes sociales.' },
    { title: 'Estudios y contenido tecnico', desc: 'Resume papers, informes o articulos densos sin tener que leerlos enteros antes.' },
    { title: 'YouTube con subtitulos', desc: 'Entiende entrevistas, documentales o conferencias compatibles antes de dedicarles tiempo.' },
    { title: 'Fuentes en otros idiomas', desc: 'Pega el enlace original y recibe el resumen en el idioma que usas en la app.' },
    { title: 'PDFs y documentos', desc: 'Sube contratos, informes o material academico y obten las ideas clave rapidamente.' },
    { title: 'Feed Diario', desc: 'Conecta tus webs favoritas, revisa titulares desde un solo lugar y resume solo lo importante.' },
  ],
  English: [
    { title: 'Headlines before sharing', desc: 'Check a story before sending it on WhatsApp, Telegram or social media.' },
    { title: 'Studies and technical content', desc: 'Summarize papers, reports or dense articles without reading everything first.' },
    { title: 'YouTube with subtitles', desc: 'Understand compatible interviews, documentaries or talks before committing your time.' },
    { title: 'Sources in other languages', desc: 'Paste the original link and get the summary in the language you use in the app.' },
    { title: 'PDFs and documents', desc: 'Upload contracts, reports or academic material and get the key points quickly.' },
    { title: 'Daily Feed', desc: 'Connect your favorite websites, review headlines in one place and summarize only what matters.' },
  ],
} as const;

export function InfoPanel({
  uiLanguage,
  t,
  show,
  dontShowAgain,
  showApiPrivacy,
  setShowApiPrivacy,
  onClose,
}: InfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'faq' | 'usecases'>('info');

  useEffect(() => {
    if (show) setActiveTab('info');
  }, [show]);

  const localCopy = useMemo(() => {
    if (uiLanguage === 'Spanish') {
      return {
        eyebrow: 'Sobre AntiClickBaitLinks',
        intro:
          'AntiClickBaitLinks te ayuda a ver lo importante de una noticia, un PDF o un video compatible sin perder tiempo con titulares inflados o enlaces enganosos.',
        aboutTitle: 'Que hace hoy la app',
        aboutPoints: [
          'Resume articulos y noticias pegando el enlace directo.',
          'Lee PDFs con texto y videos de YouTube que tengan subtitulos disponibles.',
          'Sincroniza tu cuenta, tus API Keys, tu feed diario y tus preferencias entre dispositivos.',
          'Muestra limites gratuitos claros y una cuenta atras hasta el siguiente reinicio.',
        ],
        howTitle: 'Como usarlo',
        howStep1Title: '1. Entra en tu cuenta',
        howStep1Desc:
          'Tu cuenta mantiene sincronizados el idioma, el feed diario, el estado Premium y tus proveedores activos.',
        howStep2Title: '2. Activa al menos un proveedor',
        howStep2Desc:
          'Guarda una API Key valida en tu perfil. Puedes activar varios proveedores para que la app tenga una alternativa si alguno falla o se queda sin cuota.',
        faqLabel: 'FAQ',
        tipsLabel: 'Tips',
        aboutTab: 'Sobre',
        platformsTitle: 'Disponible en mas sitios',
        platformsDesc:
          'Ademas de la web, puedes usar AntiClickBaitLinks con extension de navegador y con apps nativas para Android, iPhone/iPad y Windows.',
        premiumTitle: 'Premium',
        premiumDesc:
          'Premium elimina el limite diario gratuito con un unico pago y mantiene tu acceso vinculado a tu cuenta.',
      };
    }

    return {
      eyebrow: 'About AntiClickBaitLinks',
      intro:
        'AntiClickBaitLinks helps you get the important part of a story, PDF or supported video without wasting time on inflated headlines or misleading links.',
      aboutTitle: 'What the app does today',
      aboutPoints: [
        'Summarizes articles and news stories from direct links.',
        'Reads text-based PDFs and YouTube videos with available subtitles.',
        'Keeps your account, API keys, daily feed and preferences synced across devices.',
        'Shows clear free limits and a live countdown to the next reset.',
      ],
      howTitle: 'How to use it',
      howStep1Title: '1. Sign in to your account',
      howStep1Desc:
        'Your account keeps your language, daily feed, Premium status and active providers synced across devices.',
      howStep2Title: '2. Enable at least one provider',
      howStep2Desc:
        'Save a valid API key in your profile. You can keep more than one provider active so the app has a fallback if one fails or reaches quota.',
      faqLabel: 'FAQ',
      tipsLabel: 'Use cases',
      aboutTab: 'About',
      platformsTitle: 'Available beyond the web',
      platformsDesc:
        'You can also use AntiClickBaitLinks with the browser extension and native apps for Android, iPhone/iPad and Windows.',
      premiumTitle: 'Premium',
      premiumDesc:
        'Premium removes the free daily limit with a one-time payment and keeps your access linked to your account.',
    };
  }, [uiLanguage]);

  const faqItems = INFO_FAQ[uiLanguage as keyof typeof INFO_FAQ] || FAQ_CONTENT[uiLanguage as keyof typeof FAQ_CONTENT] || FAQ_CONTENT.English;
  const useCases = (INFO_USE_CASES[uiLanguage as keyof typeof INFO_USE_CASES] || USE_CASES[uiLanguage as keyof typeof USE_CASES] || USE_CASES.English).map((item, index) => ({
    ...item,
    icon: ['📰', '🧪', '▶️', '🌍', '📄', '🧭'][index] || '•',
  }));

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[45] bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={dontShowAgain ? { opacity: 0, y: -20, scale: 0.96 } : { opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="fixed left-1/2 top-1/2 z-[46] max-h-[88dvh] w-[92%] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(240,253,250,0.99)_100%)] p-5 text-zinc-900 shadow-[0_28px_90px_rgba(15,23,42,0.24)] backdrop-blur-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-700/75">
                  {localCopy.eyebrow}
                </p>
                <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-950">
                  {t.title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
                  {localCopy.intro}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={t.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 flex gap-1 rounded-2xl bg-emerald-50 p-1.5">
              {[
                { key: 'info', label: localCopy.aboutTab, icon: Info },
                { key: 'faq', label: localCopy.faqLabel, icon: HelpCircle },
                { key: 'usecases', label: localCopy.tipsLabel, icon: Lightbulb },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as 'info' | 'faq' | 'usecases')}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-all',
                      activeTab === tab.key ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon size={14} />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'info' && (
              <div className="mt-5 space-y-5">
                <section className="rounded-[1.75rem] border border-emerald-100 bg-white/85 p-5 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700/75">
                    {localCopy.aboutTitle}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {localCopy.aboutPoints.map((point) => (
                      <div key={point} className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm leading-relaxed text-zinc-800">
                        {point}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.75rem] border border-zinc-200 bg-white/90 p-5 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                    {localCopy.howTitle}
                  </p>
                  <div className="mt-4 space-y-5">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-extrabold text-emerald-700">1</div>
                      <div>
                        <p className="text-base font-bold text-zinc-900">{localCopy.howStep1Title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-600">{localCopy.howStep1Desc}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-extrabold text-emerald-700">2</div>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-zinc-900">{localCopy.howStep2Title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-600">{localCopy.howStep2Desc}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {API_LINKS.map((link) => (
                            <a
                              key={link.label}
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-700"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowApiPrivacy(!showApiPrivacy)}
                          className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-700 hover:text-emerald-800"
                        >
                          <ShieldCheck size={14} />
                          {t.infoApiPrivacyTitle}
                        </button>
                        <AnimatePresence>
                          {showApiPrivacy && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm leading-relaxed text-zinc-700">
                                {t.infoApiPrivacyDesc}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.75rem] border border-zinc-200 bg-white/90 p-5 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      {localCopy.platformsTitle}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                      {localCopy.platformsDesc}
                    </p>
                  </div>
                  <div className="rounded-[1.75rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700/75">
                      {localCopy.premiumTitle}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-700">
                      {localCopy.premiumDesc}
                    </p>
                    <a
                      href="https://www.paypal.com/ncp/payment/SD8UXPABAFFJL"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
                    >
                      {t.buyBtn} <ArrowRight size={16} />
                    </a>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'faq' && (
              <div className="mt-5 space-y-3">
                {faqItems.map((item, index) => (
                  <details key={`${item.q}-${index}`} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/90 shadow-sm">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-zinc-900 transition-colors hover:bg-zinc-50">
                      {item.q}
                    </summary>
                    <p className="border-t border-zinc-100 px-4 py-3 text-sm leading-relaxed text-zinc-700">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            )}

            {activeTab === 'usecases' && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {useCases.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-[1.5rem] border border-zinc-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl leading-none">{item.icon}</div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-700">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
