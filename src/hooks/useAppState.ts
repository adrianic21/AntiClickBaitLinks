import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  summarizeUrlStream,
  summarizeUrl,
  summarizeTextContent,
  fetchPdfContent,
  validateApiKey,
  investigateClaim,
  estimateLieScore,
  type Provider,
  type ApiKeys,
  type InvestigationResult,
  type StreamingSummaryResult,
} from '../services/geminiService';
import { UI_TRANSLATIONS, type TranslationKey } from '../translations';
import {
  estimateMinutesSaved,
  findCachedSummary,
  getProviderMetrics,
  recordProviderMetric,
  recordSavedSummary,
  saveCachedSummary,
  type AppInsights,
  type ProviderMetrics,
} from '../lib/appInsights';
import {
  addFeedSource as persistFeedSource,
  removeFeedSource as deleteFeedSource,
  toggleFeedSource as persistFeedSourceToggle,
  type DailyFeedItem,
  type FeedSource,
  type FeedSourceType,
} from '../lib/feedSources';

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
interface RssPreviewResponse {
  title: string;
  items: Array<{
    title: string;
    url: string;
    publishedAt?: string | null;
  }>;
}

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  providers: string[];
  isPremium: boolean;
}

interface AccountResponse {
  user: AuthUser;
  account: {
    apiKeys?: ApiKeys;
    preferences?: {
      uiLanguage?: string;
      summaryLanguage?: string;
      preferredLength?: 'short' | 'medium' | 'long';
      speechRate?: number;
      provider?: Provider;
      deepResearchEnabled?: boolean;
      dontShowAgain?: boolean;
    };
    appInsights?: AppInsights;
    feedSources?: FeedSource[];
    premium?: {
      isPremium: boolean;
      token?: string;
    };
  };
}

const LIMITS_LOADING = -1;

function formatCountdown(resetAtMs: number): string {
  const diff = resetAtMs - Date.now();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Validated API Keys cache ─────────────────────────────────────────────────
const [validatedApiKeysReady, setValidatedApiKeysReadyGlobal] = [
  // simple module-level flag, will be in component state
  false, () => {}
];

export function useAppState() {
  // Core
  const [url, setUrl] = useState('');
  const [uiLanguage, setUiLanguage] = useState('English');
  const [summary, setSummary] = useState<string | null>(null);
  const [streamingSummary, setStreamingSummary] = useState<string | null>(null); // live streaming buffer
  const [isStreaming, setIsStreaming] = useState(false);
  const [articleTitle, setArticleTitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLength, setCurrentLength] = useState<'short' | 'medium' | 'long' | 'child'>('short');
  const [preferredLength, setPreferredLengthState] = useState<'short' | 'medium' | 'long'>('short');
  const [summaryLanguage, setSummaryLanguageState] = useState('English');
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [lieScore, setLieScore] = useState(0);
  const [investigationResult, setInvestigationResult] = useState<InvestigationResult | null>(null);
  const [appInsights, setAppInsights] = useState<AppInsights>({ savedSummaries: 0, totalMinutesSaved: 0 });
  const [providerMetrics, setProviderMetrics] = useState<Record<Provider, ProviderMetrics>>(getProviderMetrics());
  const [feedSources, setFeedSources] = useState<FeedSource[]>([]);
  const [dailyFeedItems, setDailyFeedItems] = useState<DailyFeedItem[]>([]);
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);

  // API
  const [userApiKey, setUserApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [validatedApiKeys, setValidatedApiKeys] = useState<ApiKeys>({});
  const [validatedApiKeysReady, setValidatedApiKeysReady] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [apiKeySaveError, setApiKeySaveError] = useState<string | null>(null);

  // UI popups
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [showOnboardingLang, setShowOnboardingLang] = useState(false);
  const [showApiPrivacy, setShowApiPrivacy] = useState(false);

  // Premium / limits
  const [isPremium, setIsPremium] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [serverRemaining, setServerRemaining] = useState<number>(LIMITS_LOADING);
  const [serverResetAt, setServerResetAt] = useState<number | null>(null);
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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const [pendingSharedText, setPendingSharedText] = useState<string | null>(null);
  const [showSharedToast, setShowSharedToast] = useState(false);
  const [feedSummaryQueue, setFeedSummaryQueue] = useState<string[]>([]);
  const [feedSummaryResults, setFeedSummaryResults] = useState<Array<{ url: string; title: string; summary: string }>>([]);
  const [isMultiFeedSummarizing, setIsMultiFeedSummarizing] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  const summaryCacheRef = useRef<Map<string, { summary: string; title: string }>>(new Map());
  const lastAutoSummarizedUrlRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<boolean>(false); // flag to abort current stream

  // ─── Derived values ──────────────────────────────────────────────────────────
  const t = useMemo(
    () => {
      const merged = {
        ...UI_TRANSLATIONS.English,
        ...(UI_TRANSLATIONS[uiLanguage as TranslationKey] || {}),
      };
      if (uiLanguage === 'Spanish') {
        merged.originalTitle = 'Título original';
      }
      return merged;
    },
    [uiLanguage]
  );

  const remainingSearches = useMemo(() => {
    if (isPremium) return Infinity;
    if (serverRemaining === LIMITS_LOADING) return LIMITS_LOADING;
    return serverRemaining;
  }, [isPremium, serverRemaining]);

  const nextResetTime = useMemo(() => serverResetAt || null, [serverResetAt]);

  const providerPriority = useMemo(() => {
    const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
    return [...allProviders].sort((a, b) => {
      const metricA = providerMetrics[a];
      const metricB = providerMetrics[b];
      const score = (metric?: ProviderMetrics) => {
        if (!metric) return 0;
        const successRate = metric.attempts > 0 ? metric.successes / metric.attempts : 0.6;
        const transientPenalty = metric.transientFailures * 0.12;
        const authPenalty = metric.authFailures * 0.3;
        const fallbackPenalty = metric.fallbacks * 0.05;
        const costPenalty = metric.estimatedCostUnits * 0.015;
        return successRate - transientPenalty - authPenalty - fallbackPenalty - costPenalty;
      };
      if (a === provider) return -1;
      if (b === provider) return 1;
      return score(metricB) - score(metricA);
    });
  }, [provider, providerMetrics]);

  // The active summary: during streaming show the live buffer, after completion show the final
  const displaySummary = isStreaming ? streamingSummary : summary;

  // ─── Popup helpers ──────────────────────────────────────────────────────────
  const openPopup = useCallback((popup: string) => {
    setShowStatusPopover(popup === 'status');
    setShowLangMenu(popup === 'lang');
    setShowInfo(popup === 'info');
    setShowSettings(popup === 'settings');
    setShowFeed(popup === 'feed');
    if (popup === 'profile' && !currentUser) {
      setShowProfile(false);
      setShowAuthModal(true);
      return;
    }
    setShowProfile(popup === 'profile');
    if (popup !== 'info') setShowApiPrivacy(false);
  }, [currentUser]);

  const togglePopup = useCallback((popup: string) => {
    if (popup === 'profile' && !currentUser) {
      setShowAuthModal((prev) => !prev);
      return;
    }
    const isOpen =
      (popup === 'status' && showStatusPopover) ||
      (popup === 'lang' && showLangMenu) ||
      (popup === 'info' && showInfo) ||
      (popup === 'settings' && showSettings) ||
      (popup === 'feed' && showFeed) ||
      (popup === 'profile' && showProfile);
    openPopup(isOpen ? '' : popup);
  }, [showStatusPopover, showLangMenu, showInfo, showSettings, showFeed, showProfile, currentUser, openPopup]);

  const openLockModal = useCallback(() => {
    openPopup('');
    setShowLockModal(true);
  }, [openPopup]);

  const clearPasswordResetToken = useCallback(() => setPasswordResetToken(null), []);

  const refreshValidatedApiKeys = useCallback(async (keys: ApiKeys, skipValidation = false) => {
    const validKeys = Object.fromEntries(
      Object.entries(keys).filter(([, v]) => v && v !== 'undefined')
    );
    setValidatedApiKeys(validKeys as ApiKeys);
    setValidatedApiKeysReady(true);
    if (skipValidation) {
      setIsKeySaved(Object.values(validKeys).some(k => k && k !== 'undefined'));
      return validKeys;
    }
    const entries = await Promise.all(
      (Object.entries(keys) as Array<[Provider, string | undefined]>).map(async ([providerName, keyValue]) => {
        const trimmedKey = keyValue?.trim();
        if (!trimmedKey || trimmedKey === 'undefined') return [providerName, undefined] as const;
        const isValid = await validateApiKey(providerName, trimmedKey).catch(() => false);
        return [providerName, isValid ? trimmedKey : undefined] as const;
      })
    );
    const nextValidatedKeys = entries.reduce<ApiKeys>((acc, [providerName, keyValue]) => {
      if (keyValue) acc[providerName] = keyValue;
      return acc;
    }, {});
    setValidatedApiKeys(nextValidatedKeys);
    const hasAnyValidKey = Object.values(nextValidatedKeys).some(k => k && k !== 'undefined');
    if (hasAnyValidKey) {
      setIsKeySaved(true);
    }
    return nextValidatedKeys;
  }, []);

  const validatePremiumSession = useCallback(async (): Promise<boolean> => {
    const savedToken = localStorage.getItem('premium_token');
    if (!savedToken) return isPremium;
    try {
      const res = await fetch('/api/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: savedToken, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (data.valid) return true;
      setIsPremium(false);
      localStorage.removeItem('is_premium');
      localStorage.removeItem('premium_token');
      if (data.reason === 'device_mismatch') {
        setLockError(true);
        setDeviceMismatchError(true);
        setShowLockModal(true);
      }
      return false;
    } catch {
      return true;
    }
  }, [isPremium]);

  const syncAccount = useCallback(async (payload: Record<string, unknown>) => {
    if (!currentUser) return;
    await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }, [currentUser]);

  const applyLimitData = useCallback((data: { allowed: boolean; remaining: number | null; resetAt: number | null }, openModalOnLimit = true) => {
    if (typeof data.remaining === 'number') {
      setServerRemaining(data.remaining);
    }
    if (data.resetAt) {
      const now = Date.now();
      if (data.resetAt > now) {
        setServerResetAt(data.resetAt);
        const immediate = formatCountdown(data.resetAt);
        if (immediate) setTimeLeft(immediate);
      } else if (data.remaining !== null && data.remaining <= 0) {
        const resetIn24h = now + (24 * 60 * 60 * 1000);
        setServerResetAt(resetIn24h);
        setTimeLeft("23:59:59");
      }
    } else if (data.remaining !== null && data.remaining <= 0) {
      const resetIn24h = Date.now() + (24 * 60 * 60 * 1000);
      setServerResetAt(resetIn24h);
      setTimeLeft("23:59:59");
    }
    if (!data.allowed && openModalOnLimit) {
      openLockModal();
    }
  }, [openLockModal]);

  const applyAccountData = useCallback((data: AccountResponse) => {
    setCurrentUser(data.user);
    const premiumEnabled = Boolean(data.account?.premium?.isPremium || data.user.isPremium);
    setIsPremium(premiumEnabled);
    localStorage.setItem('is_premium', premiumEnabled ? 'true' : 'false');
    if (data.account?.premium?.token) {
      localStorage.setItem('premium_token', data.account.premium.token);
    } else if (!premiumEnabled) {
      localStorage.removeItem('premium_token');
    }

    let accountKeys = data.account?.apiKeys || {};
    if (Object.keys(accountKeys).length === 0) {
      try {
        const backupKeys = localStorage.getItem('api_keys_backup');
        if (backupKeys) {
          const parsed = JSON.parse(backupKeys) as ApiKeys;
          if (parsed && typeof parsed === 'object') {
            accountKeys = parsed;
          }
        }
      } catch { /* ignore backup parse errors */ }
    }
    setApiKeys(accountKeys);
    const selectedProvider = (data.account?.preferences?.provider as Provider) || 'gemini';
    setProvider(selectedProvider);
    setUserApiKey(accountKeys[selectedProvider] || '');
    refreshValidatedApiKeys(accountKeys).catch(() => undefined);

    if (data.account?.preferences?.uiLanguage) setUiLanguage(data.account.preferences.uiLanguage);
    if (data.account?.preferences?.summaryLanguage) setSummaryLanguageState(data.account.preferences.summaryLanguage);
    if (data.account?.preferences?.preferredLength) setPreferredLengthState(data.account.preferences.preferredLength);
    if (typeof data.account?.preferences?.speechRate === 'number') setSpeechRateState(data.account.preferences.speechRate);
    if (typeof data.account?.preferences?.deepResearchEnabled === 'boolean') setDeepResearchEnabled(data.account.preferences.deepResearchEnabled);
    if (typeof data.account?.preferences?.dontShowAgain === 'boolean') setDontShowAgain(data.account.preferences.dontShowAgain);

    setAppInsights(data.account?.appInsights || { savedSummaries: 0, totalMinutesSaved: 0 });
    setFeedSources(data.account?.feedSources || []);

    fetch('/api/check-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: false, isPremium: Boolean(data.account?.premium?.isPremium || data.user.isPremium) }),
    })
      .then(r => r.json())
      .then(limitData => applyLimitData(limitData, false))
      .catch(() => setServerRemaining(5));
  }, [refreshValidatedApiKeys, applyLimitData]);

  const loadAccount = useCallback(async () => {
    const response = await fetch('/api/account', { credentials: 'include' });
    if (!response.ok) throw new Error('account_load_failed');
    const data = await response.json() as AccountResponse;
    applyAccountData(data);
  }, [applyAccountData]);

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
      abortControllerRef.current?.abort();
      streamAbortRef.current = true;
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

  // ─── Web Share Target ──────────────────────────────────────────────────────
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const params = currentUrl.searchParams;
    const authErrorParam = params.get('authError') || '';
    const sharedCandidate = params.get('shared')
      || params.get('url')
      || extractUrlFromText(params.get('text') || '')
      || (currentUrl.pathname === '/share-target' ? extractUrlFromText(params.get('title') || '') : '');
    const sharedTextCandidate = params.get('sharedText') || '';

    // Handle password reset token from URL
    const resetToken = params.get('reset_token') || '';
    if (resetToken) {
      setPasswordResetToken(resetToken);
      setShowAuthModal(true);
      window.history.replaceState({}, '', '/');
      return;
    }

    if (authErrorParam) {
      let message = 'We could not complete that sign-in. Please try again.';
      if (authErrorParam === 'google_not_configured') message = 'Google sign-in is not configured yet on the server.';
      else if (authErrorParam === 'google_invalid_state') message = 'Google sign-in failed because the session expired or the callback URL does not match.';
      else if (authErrorParam === 'google_token_exchange_failed') message = 'Google sign-in failed while exchanging the authorization code.';
      else if (authErrorParam === 'google_profile_failed') message = 'Google sign-in reached Google but could not read the user profile.';
      else if (authErrorParam === 'google_access_denied') message = 'Google sign-in was cancelled before finishing.';
      setAuthError(message);
      window.history.replaceState({}, '', '/');
      return;
    }

    if (sharedCandidate && sharedCandidate.startsWith('http')) {
      setPendingSharedUrl(sharedCandidate);
      setUrl(sharedCandidate);
      setShowSharedToast(true);
      window.history.replaceState({}, '', '/');
    } else if (sharedTextCandidate.trim()) {
      const normalizedText = sharedTextCandidate.trim();
      setPendingSharedText(normalizedText);
      setUrl(normalizedText);
      setShowSharedToast(true);
      window.history.replaceState({}, '', '/');
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SHARE_TARGET' && event.data.url) {
        const incomingUrl = String(event.data.url);
        if (incomingUrl.startsWith('http')) {
          setPendingSharedUrl(incomingUrl);
          setUrl(incomingUrl);
          setShowSharedToast(true);
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, []);

  // ─── Load persisted state ───────────────────────────────────────────────────
  useEffect(() => {
    const savedLang = localStorage.getItem('ui_language');
    if (savedLang && UI_TRANSLATIONS[savedLang as TranslationKey]) {
      setUiLanguage(savedLang);
      setSummaryLanguageState(savedLang);
    }
    const savedDontShow = localStorage.getItem('dont_show_onboarding') === 'true';
    setDontShowAgain(savedDontShow);

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(async (data) => {
        if (data.user) {
          await loadAccount();
          if (!savedDontShow) setShowInfo(true);
        } else {
          setCurrentUser(null);
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record: false, isPremium: false }),
          })
            .then(r => r.json())
            .then(limitData => applyLimitData(limitData, false))
            .catch(() => setServerRemaining(5));
        }
      })
      .catch(() => {
        setCurrentUser(null);
        setServerRemaining(5);
      })
      .finally(() => {
        setProviderMetrics(getProviderMetrics());
        setIsAuthLoading(false);
      });
  }, [loadAccount, applyLimitData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!serverResetAt) {
      setTimeLeft('');
      return;
    }
    const immediate = formatCountdown(serverResetAt);
    setTimeLeft(immediate);
    if (!immediate) {
      setServerResetAt(null);
        setServerRemaining(5);
      return;
    }
    const id = setInterval(() => {
      const next = formatCountdown(serverResetAt);
      if (!next) {
        setTimeLeft('');
        setServerResetAt(null);
        setServerRemaining(5);
        clearInterval(id);
      } else {
        setTimeLeft(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [serverResetAt]);

  // ─── Auto-summarize on URL paste ────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      if (url && !isLoading) {
        try {
          const normalizedUrl = extractUrlFromText(url);
          new URL(normalizedUrl);
          if (normalizedUrl !== lastAutoSummarizedUrlRef.current) {
            lastAutoSummarizedUrlRef.current = normalizedUrl;
            handleSummarize();
          }
        } catch {
          const normalizedText = url.trim();
          if (normalizedText.length >= 80 && normalizedText !== lastAutoSummarizedUrlRef.current) {
            lastAutoSummarizedUrlRef.current = normalizedText;
            handleSummarize();
          }
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [url, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll to results ──────────────────────────────────────────────────────
  useEffect(() => {
    if ((summary || streamingSummary) && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [summary, streamingSummary]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const submitAuth = useCallback(async () => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: authName, email: authEmail, password: authPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Authentication failed');
      setAuthPassword('');
      if (data.user && data.account) {
        applyAccountData(data as AccountResponse);
      } else {
        await loadAccount();
      }
    } catch (error: any) {
      setAuthError(error?.message || 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  }, [authMode, authName, authEmail, authPassword, loadAccount, applyAccountData]);

  const startOAuth = useCallback((providerName: 'google') => {
    window.location.href = `/api/auth/${providerName}/start`;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    openPopup('');
    setShowAuthModal(false);
    setCurrentUser(null);
    setApiKeys({});
    setValidatedApiKeys({});
    setUserApiKey('');
    setSummary(null);
    setStreamingSummary(null);
    setArticleTitle(null);
    setAppInsights({ savedSummaries: 0, totalMinutesSaved: 0 });
    setFeedSources([]);
    setDailyFeedItems([]);
    setIsPremium(false);
    setServerRemaining(LIMITS_LOADING);
    setServerResetAt(null);
    setTimeLeft('');
  }, [openPopup]);

  const saveApiKey = useCallback(async () => {
    if (!currentUser) {
      setAuthError('Please sign in to manage your API keys.');
      setShowAuthModal(true);
      return;
    }
    setApiKeySaveError(null);
    const trimmedKey = userApiKey.trim();
    if (trimmedKey) {
      const isValid = await validateApiKey(provider, trimmedKey).catch(() => false);
      if (!isValid) {
        setError(t.apiKeyInvalidError);
        const nextValidatedKeys = { ...validatedApiKeys };
        delete nextValidatedKeys[provider];
        setValidatedApiKeys(nextValidatedKeys);
        setIsKeySaved(Object.values(nextValidatedKeys).some(k => k && k !== 'undefined'));
        return;
      }
    }
    const newKeys = { ...apiKeys };
    if (trimmedKey) {
      newKeys[provider] = trimmedKey;
    } else {
      delete newKeys[provider];
    }
    setApiKeys(newKeys);
    const nextValidatedKeys = { ...validatedApiKeys };
    if (trimmedKey) nextValidatedKeys[provider] = trimmedKey;
    else delete nextValidatedKeys[provider];
    setValidatedApiKeys(nextValidatedKeys);
    const hasAnyKey = Object.values(nextValidatedKeys).some(k => k && k !== 'undefined');
    setIsKeySaved(hasAnyKey);
    localStorage.setItem('api_keys_backup', JSON.stringify(newKeys));
    localStorage.setItem(`api_key_${provider}`, trimmedKey);
    localStorage.setItem('api_provider', provider);
    try {
      await syncAccount({ apiKeys: newKeys, preferences: { provider } });
      setError(null);
    } catch {
      setApiKeySaveError(uiLanguage === 'Spanish' 
        ? 'Error al guardar la clave. Se guardó localmente.' 
        : 'Failed to save to server. Saved locally.');
    }
    setShowSettings(false);
    setShowProfile(false);
  }, [apiKeys, provider, userApiKey, t.apiKeyInvalidError, validatedApiKeys, syncAccount, currentUser, uiLanguage]);

  const changeUiLanguage = useCallback((lang: string) => {
    setUiLanguage(lang);
    localStorage.setItem('ui_language', lang);
    syncAccount({ preferences: { uiLanguage: lang } }).catch(() => undefined);
    if (showOnboardingLang) {
      setShowOnboardingLang(false);
      setShowLangMenu(false);
      setTimeout(() => setShowInfo(true), 300);
    } else {
      setShowLangMenu(false);
    }
  }, [showOnboardingLang, syncAccount]);

  const checkUsageLimit = useCallback((): boolean => {
    if (isPremium) return true;
    if (serverRemaining !== LIMITS_LOADING && serverRemaining <= 0) {
      if (serverResetAt) openLockModal();
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
        syncAccount({ premium: { isPremium: true, token: unlockPass.trim() } }).catch(() => undefined);
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
  }, [unlockPass, openPopup, syncAccount]);

  const handlePaste = useCallback(async () => {
    if (isAuthLoading) return;
    if (!currentUser) {
      setAuthError('Crea una cuenta o inicia sesión para pegar un link.');
      setShowAuthModal(true);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) { setUrl(extractUrlFromText(text)); setError(null); }
    } catch {
      setError(t.pasteError);
      setTimeout(() => setError(null), 5000);
    }
  }, [t.pasteError, currentUser, isAuthLoading]);

  const setPreferredLength = useCallback((len: 'short' | 'medium' | 'long') => {
    setPreferredLengthState(len);
    localStorage.setItem('preferred_length', len);
    syncAccount({ preferences: { preferredLength: len } }).catch(() => undefined);
  }, [syncAccount]);

  const setSummaryLanguage = useCallback((lang: string) => {
    setSummaryLanguageState(lang);
    localStorage.setItem('summary_language', lang);
    syncAccount({ preferences: { summaryLanguage: lang } }).catch(() => undefined);
  }, [syncAccount]);

  const setDeepResearchMode = useCallback((enabled: boolean) => {
    setDeepResearchEnabled(enabled);
    localStorage.setItem('deep_research_enabled', enabled ? 'true' : 'false');
    syncAccount({ preferences: { deepResearchEnabled: enabled } }).catch(() => undefined);
  }, [syncAccount]);

  const setSpeechRate = useCallback((rate: number) => {
    setSpeechRateState(rate);
    localStorage.setItem('speech_rate', String(rate));
    syncAccount({ preferences: { speechRate: rate } }).catch(() => undefined);
  }, [syncAccount]);

  const addFeedSource = useCallback((name: string, sourceUrl: string, type: FeedSourceType) => {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) return;
    const nextSources = persistFeedSource({
      name: name.trim() || trimmedUrl,
      url: trimmedUrl,
      type,
      enabled: true,
    });
    setFeedSources(nextSources);
    setFeedError(null);
    syncAccount({ feedSources: nextSources }).catch(() => undefined);
  }, [syncAccount]);

  const removeFeedSource = useCallback((id: string) => {
    const nextSources = deleteFeedSource(id);
    setFeedSources(nextSources);
    syncAccount({ feedSources: nextSources }).catch(() => undefined);
  }, [syncAccount]);

  const toggleFeedSource = useCallback((id: string) => {
    const nextSources = persistFeedSourceToggle(id);
    setFeedSources(nextSources);
    syncAccount({ feedSources: nextSources }).catch(() => undefined);
  }, [syncAccount]);

  const refreshDailyFeed = useCallback(async () => {
    const enabledSources = feedSources.filter((source) => source.enabled);
    if (enabledSources.length === 0) {
      setDailyFeedItems([]);
      setFeedError(null);
      return;
    }
    setIsFeedLoading(true);
    setFeedError(null);
    try {
      const responses = await Promise.all(
        enabledSources.map(async (source) => {
          const response = await fetch('/api/rss-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: source.url }),
          });
          if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error || `Could not load ${source.name}`);
          }
          const data = await response.json() as RssPreviewResponse;
          const perSourceLimit = Math.max(1, Math.min(25, Number(source.itemsPerLoad || 6)));
          return data.items
            .slice(0, perSourceLimit)
            .map<DailyFeedItem>((item, index) => ({
              id: `${source.id}-${index}-${item.url}`,
              title: item.title,
              url: item.url,
              sourceName: source.name || data.title || source.url,
              sourceType: source.type,
              publishedAt: item.publishedAt || null,
            }));
        })
      );
      const deduped = new Map<string, DailyFeedItem>();
      for (const items of responses.flat()) {
        if (!deduped.has(items.url)) deduped.set(items.url, items);
      }
      const nextItems = Array.from(deduped.values())
        .sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 60);
      setDailyFeedItems(nextItems);
    } catch (err: any) {
      setFeedError(err?.message || 'Could not load the selected feed.');
    } finally {
      setIsFeedLoading(false);
    }
  }, [feedSources]);

  const updateFeedSourceItemsPerLoad = useCallback((id: string, itemsPerLoad: number) => {
    const safe = Math.max(1, Math.min(25, Math.round(itemsPerLoad)));
    const nextSources = feedSources.map((source) =>
      source.id === id ? { ...source, itemsPerLoad: safe } : source
    );
    setFeedSources(nextSources);
    try { localStorage.setItem('custom_feed_sources_v1', JSON.stringify(nextSources)); } catch { /* ignore */ }
    syncAccount({ feedSources: nextSources }).catch(() => undefined);
  }, [feedSources, syncAccount]);

  const useFeedItem = useCallback((feedUrl: string) => {
    setPdfFile(null);
    setError(null);
    setPendingSharedUrl(null);
    setUrl(feedUrl);
  }, []);

  const summarizeFeedItem = useCallback((feedUrl: string) => {
    setPdfFile(null);
    setError(null);
    setUrl(feedUrl);
    setPendingSharedUrl(feedUrl);
    setShowSharedToast(true);
  }, []);

  const summarizeManyFeedItems = useCallback(async (urls: string[]) => {
    const unique = Array.from(new Set(urls.map((u) => String(u || '').trim()).filter(Boolean)));
    if (unique.length === 0) return;

    openPopup('');
    setIsMultiFeedSummarizing(true);
    setFeedSummaryResults([]);
    setSummary(null);
    setStreamingSummary(null);
    setArticleTitle(null);
    setError(null);
    setIsLoading(true);
    setLoadingProgress(5);

    const results: Array<{ url: string; title: string; summary: string }> = [];

    for (let i = 0; i < unique.length; i++) {
      const feedUrl = unique[i];
      setLoadingProgress(Math.round(5 + (i / unique.length) * 90));
      try {
        const result = await summarizeUrl(feedUrl, apiKeys, provider, summaryLanguage, 'short', undefined, providerPriority);
        results.push({ url: feedUrl, title: result.title || feedUrl, summary: result.summary });
      } catch {
        // Skip failed URLs silently
      }
    }

    setLoadingProgress(100);
    setIsMultiFeedSummarizing(false);
    setIsLoading(false);
    setFeedSummaryResults(results);

    if (results.length > 0) {
      const combined = results.map((r, idx) => `**${idx + 1}. ${r.title}**\n${r.summary}`).join('\n\n---\n\n');
      setSummary(combined);
      setArticleTitle(`${results.length} artículos resumidos`);
      setLieScore(0);
    } else {
      setError(t.genericError);
    }

    if (!isPremium) {
      fetch('/api/check-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: true, isPremium: false, deviceId: getDeviceId() }),
      })
        .then(r => r.json())
        .then(data => applyLimitData(data))
        .catch(() => undefined);
    }
  }, [apiKeys, provider, summaryLanguage, providerPriority, isPremium, openPopup, t.genericError, applyLimitData]);

  useEffect(() => {
    if (!currentUser) return;
    if (isLoading) return;
    if (feedSummaryQueue.length === 0) return;
    const next = feedSummaryQueue[0];
    const rest = feedSummaryQueue.slice(1);
    const id = setTimeout(() => {
      setFeedSummaryQueue(rest);
      summarizeFeedItem(next);
    }, 250);
    return () => clearTimeout(id);
  }, [feedSummaryQueue, isLoading, currentUser, summarizeFeedItem]);

  const handleClear = useCallback(() => {
    streamAbortRef.current = true;
    abortControllerRef.current?.abort();
    setUrl('');
    setSummary(null);
    setStreamingSummary(null);
    setArticleTitle(null);
    setLieScore(0);
    setInvestigationResult(null);
    setError(null);
    setFeedSummaryResults([]);
    setIsStreaming(false);
    lastAutoSummarizedUrlRef.current = '';
    summaryCacheRef.current.clear();
  }, []);

  // ─── Main handleSummarize with streaming ─────────────────────────────────────
  const handleSummarize = useCallback(async (
    e?: React.FormEvent,
    length?: 'short' | 'medium' | 'long' | 'child'
  ) => {
    const resolvedLength = length ?? preferredLength;
    if (e) e.preventDefault();
    if (isAuthLoading) return;
    if (!currentUser) {
      setAuthError('Please sign in or create an account to generate summaries.');
      setShowAuthModal(true);
      return;
    }
    if ((!url && !pdfFile) || isLoading) return;
    if (isPremium) {
      const stillValidPremium = await validatePremiumSession();
      if (!stillValidPremium) return;
    }
    if (!checkUsageLimit()) return;

    // Abort any ongoing stream
    streamAbortRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const normalizedInput = url.trim();
    const extractedUrl = pdfFile ? '' : extractUrlFromText(normalizedInput);
    const isTextInput = !pdfFile && (!/^https?:\/\//i.test(extractedUrl) || normalizedInput.length > extractedUrl.length + 40);
    const finalUrl = pdfFile ? `pdf:${pdfFile.name}` : (isTextInput ? normalizedInput : extractedUrl);
    if (!pdfFile && !isTextInput && finalUrl !== url) setUrl(finalUrl);

    if (!pdfFile && !isTextInput) {
      try { new URL(finalUrl); } catch {
        setError(t.invalidUrl);
        return;
      }
    }

    setIsLoading(true);
    setIsStreaming(false);
    setLoadingProgress(8);
    setError(null);
    setInvestigationResult(null);
    setFeedSummaryResults([]);
    setCurrentLength(resolvedLength);
    setSummary(null);
    setStreamingSummary(null);
    setArticleTitle(null);

    const cacheKey = `${isTextInput ? `text:${finalUrl.slice(0, 120)}` : finalUrl}|${summaryLanguage}|${resolvedLength}`;

    // Check caches
    const cached = summaryCacheRef.current.get(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setArticleTitle(cached.title || null);
      setLieScore(estimateLieScore(cached.title || finalUrl, cached.summary));
      if (deepResearchEnabled && !isTextInput && !finalUrl.startsWith('pdf:')) {
        investigateClaim(finalUrl, cached.title || finalUrl, cached.summary, apiKeys, providerPriority)
          .then(setInvestigationResult).catch(() => setInvestigationResult(null));
      }
      setIsLoading(false);
      return;
    }

    const persistedCached = findCachedSummary(cacheKey);
    if (persistedCached) {
      summaryCacheRef.current.set(cacheKey, { summary: persistedCached.summary, title: persistedCached.title });
      setSummary(persistedCached.summary);
      setArticleTitle(persistedCached.title || null);
      setLieScore(estimateLieScore(persistedCached.title || finalUrl, persistedCached.summary));
      if (deepResearchEnabled && !isTextInput && !finalUrl.startsWith('pdf:')) {
        investigateClaim(finalUrl, persistedCached.title || finalUrl, persistedCached.summary, apiKeys, providerPriority)
          .then(setInvestigationResult).catch(() => setInvestigationResult(null));
      }
      setIsLoading(false);
      return;
    }

    // Loading messages cycle
    const loadingMessages = t.loadingMessages;
    let msgIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    let msgInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[msgIndex]);
    }, 2500);
    let progressInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.max(1, Math.round((92 - prev) / 8));
      });
    }, 400);

    // Mark this streaming session
    streamAbortRef.current = false;
    const thisSessionAborted = () => streamAbortRef.current;

    try {
      let prefetchedContent: { text: string; title: string; type: string } | undefined;
      if (pdfFile) {
        prefetchedContent = await fetchPdfContent(pdfFile).then(r => ({ ...r, type: 'pdf' }));
      }

      // For text input, use non-streaming path
      if (isTextInput) {
        const summaryResult = await summarizeTextContent(finalUrl, apiKeys, provider, summaryLanguage, resolvedLength, providerPriority);
        if (thisSessionAborted()) return;

        if (msgInterval) { clearInterval(msgInterval); msgInterval = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        setLoadingMessage('');
        setLoadingProgress(100);
        setSummary(summaryResult.summary);

        const resolvedTitle = summaryResult.title || '';
        if (resolvedTitle) setArticleTitle(resolvedTitle);
        setLieScore(estimateLieScore(resolvedTitle || finalUrl, summaryResult.summary));
        summaryCacheRef.current.set(cacheKey, { summary: summaryResult.summary, title: resolvedTitle });
        saveCachedSummary({ key: cacheKey, summary: summaryResult.summary, title: resolvedTitle, createdAt: Date.now() });

        for (const p of summaryResult.attemptedProviders) recordProviderMetric(p, 'attempt');
        if (summaryResult.providerUsed !== provider) recordProviderMetric(provider, 'fallback');
        recordProviderMetric(summaryResult.providerUsed, 'success');
        setProviderMetrics(getProviderMetrics());

        const minutesSaved = estimateMinutesSaved(summaryResult.articleLength, summaryResult.summary.length);
        const nextInsights = recordSavedSummary(minutesSaved);
        setAppInsights(nextInsights);
        syncAccount({ appInsights: nextInsights }).catch(() => undefined);

        if (!isPremium) {
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record: true, isPremium: false, deviceId: getDeviceId() }),
          }).then(r => r.json()).then(data => applyLimitData(data)).catch(() => undefined);
        }

      } else {
        // ─── STREAMING PATH ──────────────────────────────────────────────────
        let streamedText = '';
        let resolvedTitle = prefetchedContent?.title || '';
        let articleLen = 0;
        let usedProvider: Provider = provider;
        let metaReceived = false;

        const stream = summarizeUrlStream(
          finalUrl,
          apiKeys,
          provider,
          summaryLanguage,
          resolvedLength,
          prefetchedContent,
          providerPriority,
          (meta: StreamingSummaryResult) => {
            resolvedTitle = resolvedTitle || meta.title;
            articleLen = meta.articleLength;
            usedProvider = meta.providerUsed;
            metaReceived = true;

            // As soon as we have first chunk meta, clear loading state and show streaming UI
            if (msgInterval) { clearInterval(msgInterval); msgInterval = null; }
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            setLoadingMessage('');
            setLoadingProgress(100);
            setIsLoading(false);
            setIsStreaming(true);
            if (resolvedTitle) setArticleTitle(resolvedTitle);
          }
        );

        for await (const chunk of stream) {
          if (thisSessionAborted()) {
            // Stop reading but don't throw
            break;
          }
          streamedText += chunk;
          setStreamingSummary(streamedText);

          // If meta hasn't fired yet (shouldn't happen but safety)
          if (!metaReceived) {
            if (msgInterval) { clearInterval(msgInterval); msgInterval = null; }
            if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
            setLoadingMessage('');
            setLoadingProgress(100);
            setIsLoading(false);
            setIsStreaming(true);
          }
        }

        if (thisSessionAborted()) return;

        // Streaming complete — finalize
        setIsStreaming(false);
        setSummary(streamedText);
        setStreamingSummary(null);

        if (streamedText.trim() === 'INSUFFICIENT_CONTENT') {
          throw new Error('insufficient_content');
        }

        if (resolvedTitle) setArticleTitle(resolvedTitle);
        setLieScore(estimateLieScore(resolvedTitle || finalUrl, streamedText));
        summaryCacheRef.current.set(cacheKey, { summary: streamedText, title: resolvedTitle });
        saveCachedSummary({ key: cacheKey, summary: streamedText, title: resolvedTitle, createdAt: Date.now() });

        recordProviderMetric(usedProvider, 'attempt');
        recordProviderMetric(usedProvider, 'success');
        if (usedProvider !== provider) recordProviderMetric(provider, 'fallback');
        setProviderMetrics(getProviderMetrics());

        const minutesSaved = estimateMinutesSaved(articleLen || streamedText.length * 5, streamedText.length);
        const nextInsights = recordSavedSummary(minutesSaved);
        setAppInsights(nextInsights);
        syncAccount({ appInsights: nextInsights }).catch(() => undefined);

        if (!isPremium) {
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record: true, isPremium: false, deviceId: getDeviceId() }),
          }).then(r => r.json()).then(data => applyLimitData(data)).catch(() => undefined);
        }

        if (deepResearchEnabled && !isTextInput && !finalUrl.startsWith('pdf:')) {
          try {
            const investigation = await investigateClaim(finalUrl, resolvedTitle || finalUrl, streamedText, apiKeys, providerPriority);
            if (!thisSessionAborted()) setInvestigationResult(investigation);
          } catch {
            if (!thisSessionAborted()) setInvestigationResult(null);
          }
        }
      }

    } catch (err: any) {
      if (msgInterval) clearInterval(msgInterval);
      if (progressInterval) clearInterval(progressInterval);
      setLoadingMessage('');
      setIsStreaming(false);
      setStreamingSummary(null);

      if (err?.name === 'AbortError' || thisSessionAborted()) return;

      let message = t.genericError;
      if (err.message === 'quota_exceeded_all' || err.message === 'quota_exceeded') {
        message = t.quotaError;
      } else if (err.message === 'insufficient_content' || err.message === 'INSUFFICIENT_CONTENT') {
        message = t.insufficientContentError;
      } else if (err.message === 'provider_temporary_failure') {
        message = t.providerTemporaryError;
      } else if (err.message?.includes('pdf_no_text') || err.message?.includes('scanned')) {
        message = t.pdfNoTextError;
      } else if (err.message === 'api_key_invalid' || err.message?.includes('API Key')) {
        message = t.apiKeyInvalidError;
        recordProviderMetric(provider, 'auth_failure');
        setProviderMetrics(getProviderMetrics());
        openPopup('profile');
      } else if (err.message?.includes('no key') || err.message?.includes('API Key no configurada')) {
        message = t.noKeyError;
        openPopup('profile');
      }
      if (err.message === 'provider_temporary_failure') {
        recordProviderMetric(provider, 'transient_failure');
        setProviderMetrics(getProviderMetrics());
      }
      setError(message);
    } finally {
      if (msgInterval) clearInterval(msgInterval);
      if (progressInterval) clearInterval(progressInterval);
      setLoadingMessage('');
      setLoadingProgress(0);
      setIsLoading(false);
    }
  }, [url, pdfFile, isLoading, preferredLength, checkUsageLimit, summaryLanguage, apiKeys, provider, providerPriority, isPremium, t, openPopup, openLockModal, validatePremiumSession, deepResearchEnabled, currentUser, syncAccount, applyLimitData]);

  const handleSpeak = useCallback(() => {
    const textToSpeak = summary || streamingSummary;
    if (!textToSpeak) return;
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const speechText = textToSpeak
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/[`#>-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const utterance = new SpeechSynthesisUtterance(speechText);
    const langMap: Record<string, string> = {
      Spanish: 'es-ES', English: 'en-US', Portuguese: 'pt-BR',
      French: 'fr-FR', German: 'de-DE', Italian: 'it-IT',
    };
    utterance.lang = langMap[summaryLanguage] || 'en-US';
    utterance.rate = speechRate;
    const voices = window.speechSynthesis.getVoices();
    const uiLangPrefix = (utterance.lang.split('-')[0] || '').toLowerCase();
    const bestVoice = voices.find(v => v.lang.toLowerCase().startsWith(uiLangPrefix))
      || voices.find(v => v.default) || voices[0];
    if (bestVoice) utterance.voice = bestVoice;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [summary, streamingSummary, isSpeaking, summaryLanguage, speechRate]);

  const handleShare = useCallback(async (shareSummary: string, shareUrl?: string) => {
    const text = shareUrl && !shareUrl.startsWith('pdf:')
      ? `${shareSummary}\n\n${shareUrl}\n\nresumido por AntiClickBaitLinks.com`
      : `${shareSummary}\n\nresumido por AntiClickBaitLinks.com`;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }, []);

  // ─── Auto-summarize on shared URLs ─────────────────────────────────────────
  useEffect(() => {
    if (!pendingSharedUrl || isLoading) return;
    if (pendingSharedUrl !== url) return;
    setSummary(null);
    setStreamingSummary(null);
    setArticleTitle(null);
    setError(null);
    setTimeout(() => {
      handleSummarize();
      setPendingSharedUrl(null);
    }, 50);
  }, [pendingSharedUrl, url, isLoading, handleSummarize]);

  useEffect(() => {
    if (!showSharedToast) return;
    const id = setTimeout(() => setShowSharedToast(false), 2500);
    return () => clearTimeout(id);
  }, [showSharedToast]);

  useEffect(() => {
    if (feedSources.some((source) => source.enabled)) {
      refreshDailyFeed().catch(() => undefined);
    } else {
      setDailyFeedItems([]);
    }
  }, [feedSources, refreshDailyFeed]);

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
    syncAccount({ preferences: { dontShowAgain: true } }).catch(() => undefined);
  }, [syncAccount]);

  return {
    url, setUrl, uiLanguage, summary, streamingSummary, isStreaming, displaySummary,
    articleTitle, isLoading, error,
    preferredLength, setPreferredLength, summaryLanguage, setSummaryLanguage,
    deepResearchEnabled, setDeepResearchMode, lieScore, investigationResult,
    appInsights, providerMetrics,
    currentUser, isAuthLoading, authMode, setAuthMode, authName, setAuthName,
    authEmail, setAuthEmail, authPassword, setAuthPassword, authError,
    passwordResetToken, clearPasswordResetToken,
    feedSources, dailyFeedItems, isFeedLoading, feedError,
    userApiKey, setUserApiKey, apiKeys, validatedApiKeys, validatedApiKeysReady,
    provider, setProvider, isKeySaved, apiKeySaveError,
    showSettings, showInfo, showLangMenu, showStatusPopover, showProfile, showFeed,
    showOnboardingLang, showApiPrivacy, setShowApiPrivacy,
    isPremium, remainingSearches, nextResetTime,
    showLockModal, setShowLockModal, timeLeft,
    unlockPass, setUnlockPass, lockError, setLockError, deviceMismatchError, setDeviceMismatchError,
    dontShowAgain, isSpeaking, currentLength,
    speechRate, setSpeechRate,
    showInstallButton, resultsRef,
    loadingMessage, loadingProgress, pdfFile, setPdfFile,
    showSharedToast,
    showAuthModal, setShowAuthModal,
    feedSummaryResults, isMultiFeedSummarizing,
    t,
    openPopup, togglePopup, openLockModal, closeInfo,
    submitAuth, startOAuth, logout,
    saveApiKey, changeUiLanguage,
    addFeedSource, removeFeedSource, toggleFeedSource, refreshDailyFeed,
    useFeedItem, summarizeFeedItem, summarizeManyFeedItems, updateFeedSourceItemsPerLoad,
    handleUnlock, handlePaste, handleClear, handleSummarize,
    handleSpeak, handleInstall, handleShare,
    updateDisplayName: (name: string) => {
      setCurrentUser((prev) => (prev ? { ...prev, displayName: name } : prev));
      fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { displayName: name } }),
      }).catch(() => undefined);
    },
  };
}
