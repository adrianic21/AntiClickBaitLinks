import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { summarizeUrl, fetchPdfContent, detectContentType, type Provider, type ApiKeys } from '../services/geminiService';
import { UI_TRANSLATIONS, type TranslationKey } from '../translations';

// ─── Device fingerprint (stable per browser) ─────────────────────────────────
function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}

// ─── URL extraction helper ────────────────────────────────────────────────────
export function extractUrlFromText(text: string): string {
  const urlRegex = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
  const matches = text.match(urlRegex);
  if (matches && matches.length > 0) {
    return matches[0].replace(/[.,;:!?]+$/, '');
  }
  return text.trim();
}

// ─── cn helper ────────────────────────────────────────────────────────────────
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useAppState() {
  // Core
  const [url, setUrl] = useState('');
  const [uiLanguage, setUiLanguage] = useState('English');
  const [summary, setSummary] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLength, setCurrentLength] = useState<'short' | 'medium' | 'long' | 'child'>('short');
  const [preferredLength, setPreferredLengthState] = useState<'short' | 'medium' | 'long'>('short');

  // API
  const [userApiKey, setUserApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [provider, setProvider] = useState<Provider>('gemini');
  const [isKeySaved, setIsKeySaved] = useState(false);

  // UI popups
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [showOnboardingLang, setShowOnboardingLang] = useState(false);
  const [showApiPrivacy, setShowApiPrivacy] = useState(false);

  // Premium / limits
  const [isPremium, setIsPremium] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [resetTimestamp, setResetTimestamp] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [lockError, setLockError] = useState(false);
  const [deviceMismatchError, setDeviceMismatchError] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Misc
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRateState] = useState(1);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [serverRemaining, setServerRemaining] = useState<number | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [serverResetAt, setServerResetAt] = useState<number | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const summaryCacheRef = useRef<Map<string, { summary: string; title: string }>>(new Map());

  // FIX: AbortController para cancelar requests en vuelo cuando el usuario
  // inicia una nueva búsqueda antes de que termine la anterior.
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Derived values (memoised) ──────────────────────────────────────────────
  const t = useMemo(
    () => UI_TRANSLATIONS[uiLanguage as TranslationKey] || UI_TRANSLATIONS.English,
    [uiLanguage]
  );

  const remainingSearches = useMemo(
    () => isPremium ? Infinity : (serverRemaining !== null ? serverRemaining : 10),
    [isPremium, serverRemaining]
  );

  const nextResetTime = useMemo(
    () => serverResetAt || null,
    [serverResetAt]
  );

  // ─── Popup helpers ──────────────────────────────────────────────────────────
  const openPopup = useCallback((popup: string) => {
    setShowStatusPopover(popup === 'status');
    setShowLangMenu(popup === 'lang');
    setShowInfo(popup === 'info');
    setShowSettings(popup === 'settings');
    if (popup !== 'info') setShowApiPrivacy(false);
  }, []);

  const togglePopup = useCallback((popup: string) => {
    const isOpen =
      (popup === 'status' && showStatusPopover) ||
      (popup === 'lang' && showLangMenu) ||
      (popup === 'info' && showInfo) ||
      (popup === 'settings' && showSettings);
    openPopup(isOpen ? '' : popup);
  }, [showStatusPopover, showLangMenu, showInfo, showSettings, openPopup]);

  const openLockModal = useCallback(() => {
    openPopup('');
    setShowLockModal(true);
  }, [openPopup]);

  // ─── Load font ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    document.body.style.fontFamily = "'Rubik', system-ui, sans-serif";
    return () => { document.body.style.fontFamily = ''; };
  }, []);

  // ─── Stop speech on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      // FIX: Cancelar también cualquier request en vuelo al desmontar
      abortControllerRef.current?.abort();
    };
  }, []);

  // ─── PWA install prompt ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setShowInstallButton(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── Web Share Target — receive URLs shared from other apps ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('shared');
    if (sharedUrl && sharedUrl.startsWith('http')) {
      setUrl(sharedUrl);
      window.history.replaceState({}, '', '/');
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SHARE_TARGET' && event.data.url) {
        setUrl(event.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, []);

  // ─── Open external links in browser (PWA) ──────────────────────────────────
  useEffect(() => {
    const handleExternalLinks = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href?.startsWith('http://') || href?.startsWith('https://')) {
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    };
    document.addEventListener('click', handleExternalLinks);
    return () => document.removeEventListener('click', handleExternalLinks);
  }, []);

  // ─── Load persisted state ───────────────────────────────────────────────────
  useEffect(() => {
    const savedProvider = localStorage.getItem('api_provider') as Provider;
    if (savedProvider) setProvider(savedProvider);

    const savedLength = localStorage.getItem('preferred_length') as 'short' | 'medium' | 'long';
    if (savedLength) setPreferredLengthState(savedLength);
    const savedSpeechRate = Number(localStorage.getItem('speech_rate'));
    if (!Number.isNaN(savedSpeechRate) && savedSpeechRate >= 0.5 && savedSpeechRate <= 2) {
      setSpeechRateState(savedSpeechRate);
    }

    const savedKeys: ApiKeys = {
      gemini: localStorage.getItem('api_key_gemini') || undefined,
      openrouter: localStorage.getItem('api_key_openrouter') || undefined,
      mistral: localStorage.getItem('api_key_mistral') || undefined,
      deepseek: localStorage.getItem('api_key_deepseek') || undefined,
    };
    setApiKeys(savedKeys);
    const currentKey = savedKeys[savedProvider || 'gemini'];
    if (currentKey) { setUserApiKey(currentKey); setIsKeySaved(true); }

    const savedLang = localStorage.getItem('ui_language');
    if (savedLang && UI_TRANSLATIONS[savedLang as TranslationKey]) {
      setUiLanguage(savedLang);
    }

    const savedPremium = localStorage.getItem('is_premium') === 'true';
    setIsPremium(savedPremium);
    if (savedPremium) {
      const savedToken = localStorage.getItem('premium_token');
      if (savedToken) {
        fetch('/api/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: savedToken, deviceId: getDeviceId() }),
        })
          .then(r => r.json())
          .then(data => {
            if (!data.valid) {
              setIsPremium(false);
              localStorage.removeItem('is_premium');
              localStorage.removeItem('premium_token');
            }
          })
          .catch(() => { /* keep premium on network error */ });
      }
    }

    const savedDontShow = localStorage.getItem('dont_show_onboarding') === 'true';
    setDontShowAgain(savedDontShow);
    if (!savedDontShow) {
      const hasChosenLang = localStorage.getItem('ui_language') !== null;
      if (!hasChosenLang) setShowOnboardingLang(true);
      else setShowInfo(true);
    }

    if (!savedPremium) {
      fetch('/api/check-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: false, isPremium: false }),
      })
        .then(r => r.json())
        .then(data => {
          setServerRemaining(data.remaining ?? null);
          if (data.resetAt) setServerResetAt(data.resetAt);
          if (!data.allowed) {
            setResetTimestamp(data.resetAt);
            setShowLockModal(true);
          }
        })
        .catch(() => { /* fall back to server count */ });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showLockModal || !resetTimestamp) return;
    const update = () => {
      const diff = resetTimestamp - Date.now();
      if (diff <= 0) { setShowLockModal(false); setResetTimestamp(null); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [showLockModal, resetTimestamp]);

  // ─── Auto-summarize on URL paste ────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (url && !isLoading && !summary) {
        try { new URL(url); handleSummarize(); } catch { /* invalid url, wait */ }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll to results ──────────────────────────────────────────────────────
  useEffect(() => {
    if (summary && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [summary]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const saveApiKey = useCallback(() => {
    const newKeys = { ...apiKeys };
    if (userApiKey) {
      newKeys[provider] = userApiKey;
      localStorage.setItem(`api_key_${provider}`, userApiKey);
    } else {
      delete newKeys[provider];
      localStorage.removeItem(`api_key_${provider}`);
    }
    setApiKeys(newKeys);
    localStorage.setItem('api_provider', provider);
    setIsKeySaved(Object.values(newKeys).some(k => k && k !== 'undefined'));
    setShowSettings(false);
  }, [apiKeys, provider, userApiKey]);

  const changeUiLanguage = useCallback((lang: string) => {
    setUiLanguage(lang);
    localStorage.setItem('ui_language', lang);
    if (showOnboardingLang) {
      setShowOnboardingLang(false);
      setShowLangMenu(false);
      setTimeout(() => setShowInfo(true), 300);
    } else {
      setShowLangMenu(false);
    }
  }, [showOnboardingLang]);

  const checkUsageLimit = useCallback((): boolean => {
    if (isPremium) return true;
    if (serverRemaining !== null && serverRemaining <= 0) {
      if (serverResetAt) setResetTimestamp(serverResetAt);
      openLockModal();
      return false;
    }
    return true;
  }, [isPremium, serverRemaining, serverResetAt, openLockModal]);

  const handleUnlock = useCallback(async () => {
    if (!unlockPass.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: unlockPass.trim(), deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsPremium(true);
        localStorage.setItem('is_premium', 'true');
        localStorage.setItem('premium_token', unlockPass.trim());
        setShowLockModal(false);
        openPopup('');
        setLockError(false);
        setUnlockPass('');
      } else if (data.reason === 'device_mismatch') {
        setLockError(true);
        setDeviceMismatchError(true);
      } else {
        setLockError(true);
      }
    } catch {
      setLockError(true);
    } finally {
      setIsLoading(false);
    }
  }, [unlockPass, openPopup]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(extractUrlFromText(text)); setError(null); }
    } catch {
      setError(t.pasteError);
      setTimeout(() => setError(null), 5000);
    }
  }, [t.pasteError]);

  const setPreferredLength = useCallback((len: 'short' | 'medium' | 'long') => {
    setPreferredLengthState(len);
    localStorage.setItem('preferred_length', len);
  }, []);

  const setSpeechRate = useCallback((rate: number) => {
    setSpeechRateState(rate);
    localStorage.setItem('speech_rate', String(rate));
  }, []);

  const handleClear = useCallback(() => {
    // FIX: Cancelar request en vuelo al limpiar
    abortControllerRef.current?.abort();
    setUrl('');
    setSummary(null);
    setArticleTitle(null);
    setError(null);
    summaryCacheRef.current.clear();
  }, []);

  const handleSummarize = useCallback(async (
    e?: React.FormEvent,
    length?: 'short' | 'medium' | 'long' | 'child'
  ) => {
    const resolvedLength = length ?? preferredLength;
    if (e) e.preventDefault();
    if (!url && !pdfFile || isLoading) return;
    if (!checkUsageLimit()) return;

    // FIX: Cancelar cualquier request anterior antes de iniciar uno nuevo
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const finalUrl = pdfFile ? `pdf:${pdfFile.name}` : extractUrlFromText(url);
    if (!pdfFile && finalUrl !== url) setUrl(finalUrl);

    if (!pdfFile) {
      try { new URL(finalUrl); } catch {
        setError(t.invalidUrl);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setCurrentLength(resolvedLength);
    if (resolvedLength === 'short') { setSummary(null); setArticleTitle(null); }

    const cacheKey = `${finalUrl}|${uiLanguage}|${resolvedLength}`;
    const cached = summaryCacheRef.current.get(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setArticleTitle(cached.title || null);
      setIsLoading(false);
      return;
    }

    const loadingMessages = t.loadingMessages;
    let msgIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    let msgInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[msgIndex]);
    }, 2500);

    try {
      let prefetchedContent: { text: string; title: string; type: string } | undefined;
      if (pdfFile) {
        prefetchedContent = await fetchPdfContent(pdfFile).then(r => ({ ...r, type: 'pdf' }));
      }

      const summaryResult = await summarizeUrl(
        finalUrl,
        apiKeys,
        provider,
        uiLanguage,
        resolvedLength,
        prefetchedContent
      );

      if (msgInterval) { clearInterval(msgInterval); msgInterval = null; }
      setLoadingMessage('');
      setSummary(summaryResult);

      // FIX: Eliminado el segundo fetch al servidor solo para obtener el título.
      // El título ya está disponible en prefetchedContent (si es PDF) o en el
      // contenido pre-descargado dentro de summarizeUrl. Si no hay título, se
      // deja vacío — no vale la pena un request extra solo por eso.
      const resolvedTitle = prefetchedContent?.title || '';
      if (resolvedTitle) setArticleTitle(resolvedTitle);
      summaryCacheRef.current.set(cacheKey, { summary: summaryResult, title: resolvedTitle });

      if (!isPremium) {
        fetch('/api/check-limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: true, isPremium: false }),
        })
          .then(r => r.json())
          .then(data => {
            setServerRemaining(data.remaining ?? null);
            if (data.resetAt) setServerResetAt(data.resetAt);
            if (!data.allowed) {
              setResetTimestamp(data.resetAt);
              openLockModal();
            }
          })
          .catch(() => { /* counter syncs on next load */ });
      }
    } catch (err: any) {
      if (msgInterval) { clearInterval(msgInterval); }
      setLoadingMessage('');

      // FIX: No mostrar error si el request fue cancelado intencionalmente
      if (err?.name === 'AbortError') return;

      let message = t.genericError;
      if (
        err.message === 'quota_exceeded_all' ||
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('Quota exceeded')
      ) {
        message = t.quotaError;
      } else if (err.message === 'insufficient_content' || err.message?.includes('INSUFFICIENT_CONTENT')) {
        message = t.insufficientContentError;
      } else if (err.message?.includes('pdf_no_text') || err.message?.includes('scanned') || err.message?.includes('image-based')) {
        message = t.pdfNoTextError;
      } else if (err.message?.includes('Could not read') || err.message?.includes('PDF')) {
        message = pdfFile ? t.pdfNoTextError : t.genericError;
      } else if (err.message === 'api_key_invalid' || err.message?.includes('API Key')) {
        message = t.apiKeyInvalidError;
        openPopup('settings');
      } else if (err.message?.includes('no key') || err.message?.includes('API Key no configurada')) {
        message = t.noKeyError;
        openPopup('settings');
      }
      setError(message);
    } finally {
      if (msgInterval) { clearInterval(msgInterval); }
      setLoadingMessage('');
      setIsLoading(false);
    }
  }, [url, pdfFile, isLoading, preferredLength, checkUsageLimit, uiLanguage, apiKeys, provider, isPremium, t, openPopup, openLockModal]);

  const handleSpeak = useCallback(() => {
    if (!summary) return;
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(summary);
    const langMap: Record<string, string> = {
      Spanish: 'es-ES', English: 'en-US', Portuguese: 'pt-BR',
      French: 'fr-FR', German: 'de-DE', Italian: 'it-IT',
    };
    utterance.lang = langMap[uiLanguage] || 'en-US';
    utterance.rate = speechRate;

    const voices = window.speechSynthesis.getVoices();
    const uiLangPrefix = (utterance.lang.split('-')[0] || '').toLowerCase();
    const bestVoice = voices.find(v => v.lang.toLowerCase().startsWith(uiLangPrefix))
      || voices.find(v => v.default)
      || voices[0];
    if (bestVoice) utterance.voice = bestVoice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [summary, isSpeaking, uiLanguage, speechRate]);

  const handleShare = useCallback(async (shareSummary: string) => {
    const text = `${shareSummary}\n\nvia AntiClickBaitLinks.com`;
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') { setShowInstallButton(false); setInstallPrompt(null); }
  }, [installPrompt]);

  const closeInfo = useCallback(() => {
    setShowInfo(false);
    setDontShowAgain(true);
    localStorage.setItem('dont_show_onboarding', 'true');
  }, []);

  return {
    // state
    url, setUrl, uiLanguage, summary, articleTitle, isLoading, error,
    preferredLength, setPreferredLength,
    userApiKey, setUserApiKey, apiKeys, provider, setProvider, isKeySaved,
    showSettings, showInfo, showLangMenu, showStatusPopover,
    showOnboardingLang, showApiPrivacy, setShowApiPrivacy,
    isPremium, remainingSearches, nextResetTime,
    showLockModal, setShowLockModal, timeLeft, resetTimestamp,
    unlockPass, setUnlockPass, lockError, setLockError, deviceMismatchError, setDeviceMismatchError,
    dontShowAgain, isSpeaking, currentLength,
    speechRate, setSpeechRate,
    showInstallButton, resultsRef,
    loadingMessage, pdfFile, setPdfFile,
    // derived
    t,
    // handlers
    openPopup, togglePopup, openLockModal, closeInfo,
    saveApiKey, changeUiLanguage,
    handleUnlock, handlePaste, handleClear, handleSummarize,
    handleSpeak, handleInstall, handleShare,
  };
}
