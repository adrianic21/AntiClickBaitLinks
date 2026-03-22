import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { summarizeUrl, isAuthError, type Provider, type ApiKeys } from '../services/geminiService';
import { UI_TRANSLATIONS, type TranslationKey } from '../translations';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const [searchHistory, setSearchHistory] = useState<number[]>([]);
  const [showLockModal, setShowLockModal] = useState(false);
  const [resetTimestamp, setResetTimestamp] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [unlockPass, setUnlockPass] = useState('');
  const [lockError, setLockError] = useState(false);
  const [deviceMismatchError, setDeviceMismatchError] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Misc
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [serverRemaining, setServerRemaining] = useState<number | null>(null);
  const [serverResetAt, setServerResetAt] = useState<number | null>(null);

  // Summary history: last 10 entries
  const [summaryHistory, setSummaryHistory] = useState<Array<{
    url: string;
    title: string;
    summary: string;
    date: number;
  }>>([]);

  const resultsRef = useRef<HTMLDivElement>(null);

  // ─── Derived values (memoised) ──────────────────────────────────────────────
  const t = useMemo(
    () => UI_TRANSLATIONS[uiLanguage as TranslationKey] || UI_TRANSLATIONS.English,
    [uiLanguage]
  );

  const recentSearches = useMemo(
    () => searchHistory.filter(ts => ts > Date.now() - DAY_MS),
    [searchHistory]
  );

  const remainingSearches = useMemo(
    () => isPremium ? Infinity : (serverRemaining !== null ? serverRemaining : Math.max(0, 10 - recentSearches.length)),
    [isPremium, recentSearches, serverRemaining]
  );

  const nextResetTime = useMemo(
    () => serverResetAt || (!isPremium && recentSearches.length > 0
      ? Math.min(...recentSearches) + DAY_MS
      : null),
    [isPremium, recentSearches, serverResetAt]
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
    return () => { window.speechSynthesis.cancel(); };
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
    // Provider
    const savedProvider = localStorage.getItem('api_provider') as Provider;
    if (savedProvider) setProvider(savedProvider);

    // API keys (all four providers)
    const savedKeys: ApiKeys = {
      gemini: localStorage.getItem('api_key_gemini') || undefined,
      openrouter: localStorage.getItem('api_key_openrouter') || undefined,
      mistral: localStorage.getItem('api_key_mistral') || undefined,
      deepseek: localStorage.getItem('api_key_deepseek') || undefined,
    };
    setApiKeys(savedKeys);
    const currentKey = savedKeys[savedProvider || 'gemini'];
    if (currentKey) { setUserApiKey(currentKey); setIsKeySaved(true); }

    // UI language
    const savedLang = localStorage.getItem('ui_language');
    if (savedLang && UI_TRANSLATIONS[savedLang as TranslationKey]) {
      setUiLanguage(savedLang);
    }

    // Premium status + token validation
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

    // Onboarding
    const savedDontShow = localStorage.getItem('dont_show_onboarding') === 'true';
    setDontShowAgain(savedDontShow);
    if (!savedDontShow) {
      const hasChosenLang = localStorage.getItem('ui_language') !== null;
      if (!hasChosenLang) setShowOnboardingLang(true);
      else setShowInfo(true);
    }

    // Check server-side usage limit on load
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
        .catch(() => { /* fall back to localStorage */ });
    }

    // Summary history (last 10 summaries)
    const savedSummaryHistory = localStorage.getItem('summary_history');
    if (savedSummaryHistory) {
      try { setSummaryHistory(JSON.parse(savedSummaryHistory)); } catch { /* ignore */ }
    }

    // Search history
    const savedHistory = localStorage.getItem('search_history');
    if (savedHistory) {
      try {
        const history: number[] = JSON.parse(savedHistory);
        setSearchHistory(history);
        const recent = history.filter(ts => ts > Date.now() - DAY_MS);
        if (recent.length >= 5 && !savedPremium) {
          setResetTimestamp(Math.min(...recent) + DAY_MS);
          // use direct setter to avoid circular dep with openLockModal
          setShowLockModal(true);
        }
      } catch { setSearchHistory([]); }
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
    // Quick local pre-check to avoid unnecessary server call
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

  const handleClear = useCallback(() => {
    setUrl('');
    setSummary(null);
    setArticleTitle(null);
    setError(null);
  }, []);

  const handleSummarize = useCallback(async (
    e?: React.FormEvent,
    length: 'short' | 'medium' | 'long' | 'child' = 'short'
  ) => {
    if (e) e.preventDefault();
    if (!url || isLoading) return;
    if (!checkUsageLimit()) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const finalUrl = extractUrlFromText(url);
    if (finalUrl !== url) setUrl(finalUrl);

    try { new URL(finalUrl); } catch {
      setError(t.invalidUrl);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCurrentLength(length);
    if (length === 'short') { setSummary(null); setArticleTitle(null); }

    // Rotate loading messages for better UX
    const loadingMessages = t.loadingMessages;
    let msgIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    let msgInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[msgIndex]);
    }, 2500);

    try {
      // Single fetch — summarize and get title at the same time
      const [summaryResult, fetchRes] = await Promise.all([
        summarizeUrl(finalUrl, uiLanguage, apiKeys, length, provider),
        length === 'short'
          ? fetch('/api/fetch-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: finalUrl }),
            }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (msgInterval) { clearInterval(msgInterval); msgInterval = null; }
      setLoadingMessage('');
      setSummary(summaryResult);
      const resolvedTitle = fetchRes?.title || '';
      if (resolvedTitle) setArticleTitle(resolvedTitle);

      // Save to summary history (last 10, only on new short summaries)
      if (length === 'short') {
        const newEntry = {
          url: finalUrl,
          title: resolvedTitle || finalUrl,
          summary: summaryResult,
          date: Date.now(),
        };
        setSummaryHistory(prev => {
          const updated = [newEntry, ...prev.filter(h => h.url !== finalUrl)].slice(0, 10);
          localStorage.setItem('summary_history', JSON.stringify(updated));
          return updated;
        });
      }

      if (!isPremium) {
        // Record usage on server (IP-based) — this is the authoritative counter
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
          .catch(() => {
            // Fallback: increment localStorage counter if server unreachable
            const newHistory = [...searchHistory, Date.now()];
            setSearchHistory(newHistory);
            localStorage.setItem('search_history', JSON.stringify(newHistory));
          });
      }
    } catch (err: any) {
      clearInterval(msgInterval);
      setLoadingMessage('');
      let message = t.genericError;
      if (
        err.message === 'quota_exceeded_all' ||
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('Quota exceeded')
      ) {
        message = t.quotaError;
      } else if (err.message?.includes('API Key')) {
        message = t.noKeyError;
        openPopup('settings');
      }
      setError(message);
      console.error(err);
    } finally {
      if (msgInterval) { clearInterval(msgInterval); }
      setLoadingMessage('');
      setIsLoading(false);
    }
  }, [url, isLoading, checkUsageLimit, uiLanguage, apiKeys, provider, isPremium, searchHistory, t, openPopup]);

  const handleSpeak = useCallback(() => {
    if (!summary) return;
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(summary);
    const langMap: Record<string, string> = {
      Spanish: 'es-ES', English: 'en-US', Portuguese: 'pt-BR',
      French: 'fr-FR', German: 'de-DE', Italian: 'it-IT',
    };
    utterance.lang = langMap[uiLanguage] || 'en-US';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [summary, isSpeaking, uiLanguage]);

  const handleShare = useCallback(async (shareSummary: string) => {
    const text = `${shareSummary}

via AntiClickBaitLinks.com`;
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

  const handleClearHistory = useCallback(() => {
    setSummaryHistory([]);
    localStorage.removeItem('summary_history');
  }, []);

  return {
    // state
    url, setUrl, uiLanguage, summary, articleTitle, isLoading, error,
    userApiKey, setUserApiKey, apiKeys, provider, setProvider, isKeySaved,
    showSettings, showInfo, showLangMenu, showStatusPopover,
    showOnboardingLang, showApiPrivacy, setShowApiPrivacy,
    isPremium, remainingSearches, nextResetTime,
    showLockModal, setShowLockModal, timeLeft, resetTimestamp,
    unlockPass, setUnlockPass, lockError, setLockError, deviceMismatchError, setDeviceMismatchError,
    dontShowAgain, isSpeaking, currentLength,
    showInstallButton, resultsRef,
    loadingMessage, summaryHistory, showHistory, setShowHistory,
    // derived
    t,
    // handlers
    openPopup, togglePopup, openLockModal, closeInfo,
    saveApiKey, changeUiLanguage,
    handleUnlock, handlePaste, handleClear, handleSummarize,
    handleSpeak, handleInstall, handleShare, handleClearHistory,
  };
}
