import React from 'react';
import { ShieldCheck, Link as LinkIcon, Loader2, Clipboard, X, FileText, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LANGUAGES } from './translations';
import { useAppState, cn } from './hooks/useAppState';
import { TopBar } from './components/TopBar';
import { InfoPanel } from './components/InfoPanel';
import { LockModal } from './components/LockModal';
import { ResultCard } from './components/ResultCard';
import { AuthGate } from './components/AuthGate';
import { ProfilePanel } from './components/ProfilePanel';
import { FeedModal } from './components/FeedModal';

export default function App() {
  const state = useAppState();
  const {
    url, setUrl, uiLanguage, summaryLanguage, deepResearchEnabled, lieScore, investigationResult, appInsights, summary, articleTitle, isLoading, error,
    currentUser, isAuthLoading, authMode, setAuthMode, authName, setAuthName, authEmail, setAuthEmail, authPassword, setAuthPassword, authError,
    feedSources, dailyFeedItems, isFeedLoading, feedError,
    userApiKey, setUserApiKey, apiKeys, validatedApiKeys, provider, setProvider, isKeySaved,
    showInfo, showLangMenu, showStatusPopover, showProfile, showFeed,
    showOnboardingLang, showApiPrivacy, setShowApiPrivacy,
    isPremium, remainingSearches, nextResetTime,
    showLockModal, setShowLockModal, timeLeft,
    unlockPass, setUnlockPass, lockError, setLockError, deviceMismatchError, setDeviceMismatchError,
    dontShowAgain, isSpeaking, currentLength,
    speechRate, setSpeechRate,
    resultsRef, t,
    loadingMessage, loadingProgress, pdfFile, setPdfFile,
    showSharedToast,
    showAuthModal, setShowAuthModal,
    openPopup, togglePopup, openLockModal, closeInfo,
    submitAuth, startOAuth, logout,
    saveApiKey, changeUiLanguage,
    addFeedSource, removeFeedSource, toggleFeedSource, refreshDailyFeed, useFeedItem, summarizeFeedItem,
    summarizeManyFeedItems, updateFeedSourceItemsPerLoad,
    preferredLength, setPreferredLength, setSummaryLanguage, setDeepResearchMode,
    handleUnlock, handlePaste, handleClear, handleSummarize,
    handleSpeak, handleShare,
    updateDisplayName,
  } = state;

  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPdfFile(file);
      setUrl('');
    }
    e.target.value = '';
  };

  // FIX: Construir la URL que se pasa a ResultCard correctamente cuando hay un PDF.
  // Sin esto, ResultCard recibe url="" y no puede mostrar ni el nombre del archivo.
  const resultCardUrl = pdfFile ? `pdf:${pdfFile.name}` : url;

  if (isAuthLoading && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm font-semibold text-zinc-500">Loading your account...</div>
      </div>
    );
  }

  return (
    // FIX: Eliminado sm:p-6 duplicado (era sobreescrito inmediatamente por sm:p-12)
    <div className="min-h-screen flex flex-col items-center justify-start pt-32 sm:pt-36 p-6 sm:p-12">

      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-emerald-100" />
        <div className="absolute bottom-0 left-0 w-full h-[50%] bg-gradient-to-t from-emerald-200/70 via-emerald-100/40 to-transparent" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-emerald-300/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-[10%] right-[5%] w-[35%] h-[35%] bg-teal-200/25 rounded-full blur-3xl" />
      </div>

      {/* Auth modal */}
      <AnimatePresence>
        {showAuthModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
              onClick={() => setShowAuthModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 z-[71] w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2"
            >
              <AuthGate
                t={t}
                mode={authMode}
                loading={isAuthLoading}
                error={authError}
                name={authName}
                email={authEmail}
                password={authPassword}
                onNameChange={setAuthName}
                onEmailChange={setAuthEmail}
                onPasswordChange={setAuthPassword}
                onSubmit={submitAuth}
                onModeChange={setAuthMode}
                onOAuthStart={startOAuth}
                onClose={() => setShowAuthModal(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top bar + all its popups (status, lang, settings) */}
      <TopBar
        t={t}
        isPremium={isPremium}
        remainingSearches={remainingSearches}
        showInfo={showInfo}
        showLangMenu={showLangMenu}
        showProfile={showProfile}
        showFeed={showFeed}
        showStatusPopover={showStatusPopover}
        uiLanguage={uiLanguage}
        timeLeft={timeLeft}
        nextResetTime={nextResetTime}
        togglePopup={togglePopup}
        setShowStatusPopover={(v) => openPopup(v ? 'status' : '')}
        setShowLangMenu={(v) => openPopup(v ? 'lang' : '')}
        openLockModal={openLockModal}
        changeUiLanguage={changeUiLanguage}
        currentUser={currentUser}
      />

      <FeedModal
        t={t}
        show={showFeed}
        onClose={() => openPopup('')}
        sources={feedSources}
        items={dailyFeedItems}
        isLoading={isFeedLoading}
        error={feedError}
        onAddSource={addFeedSource}
        onToggleSource={toggleFeedSource}
        onRemoveSource={removeFeedSource}
        onRefresh={refreshDailyFeed}
        onUpdateSourceItemsPerLoad={updateFeedSourceItemsPerLoad}
        onSummarizeMany={summarizeManyFeedItems}
      />

      {currentUser && (
        <ProfilePanel
          t={t}
          show={showProfile}
          onClose={() => openPopup('')}
          currentUser={currentUser}
          isPremium={isPremium}
          provider={provider}
          setProvider={setProvider}
          userApiKey={userApiKey}
          setUserApiKey={setUserApiKey}
          apiKeys={apiKeys}
          isKeySaved={isKeySaved}
          onSaveApiKey={saveApiKey}
          onLogout={logout}
          appInsights={appInsights}
          onUpdateName={updateDisplayName}
          remainingSearches={remainingSearches}
          unlockPass={unlockPass}
          lockError={lockError}
          deviceMismatchError={deviceMismatchError}
          isLoading={isLoading}
          onPassChange={setUnlockPass}
          onUnlock={handleUnlock}
        />
      )}

      {/* Onboarding language picker */}
      <AnimatePresence>
        {showOnboardingLang && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-xs glass rounded-3xl p-6 shadow-2xl z-[46] space-y-4"
            >
              <div className="text-center space-y-1">
                <div className="text-3xl mb-2">🌍</div>
                <h3 className="font-bold text-zinc-900 text-lg">Choose your language</h3>
                <p className="text-xs text-zinc-500">Selecciona tu idioma / Choose your language</p>
              </div>
              <div className="space-y-1">
                {LANGUAGES.map(lang => (
                  <button key={lang.code} onClick={() => changeUiLanguage(lang.code)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700 text-zinc-700"
                  >
                    <span className="text-xl">{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Info / onboarding panel */}
      <InfoPanel
        t={t}
        uiLanguage={uiLanguage}
        show={showInfo}
        dontShowAgain={dontShowAgain}
        showApiPrivacy={showApiPrivacy}
        setShowApiPrivacy={setShowApiPrivacy}
        isPremium={isPremium}
        unlockPass={unlockPass}
        lockError={lockError}
        deviceMismatchError={deviceMismatchError}
        isLoading={isLoading}
        onClose={closeInfo}
        onUnlock={handleUnlock}
        onPassChange={setUnlockPass}
        onErrorChange={(v) => { setLockError(v); if (!v) setDeviceMismatchError(false); }}
      />

      {/* Lock modal */}
      <LockModal
        t={t}
        show={showLockModal}
        timeLeft={timeLeft}
        unlockPass={unlockPass}
        lockError={lockError}
        deviceMismatchError={deviceMismatchError}
        isLoading={isLoading}
        onClose={() => setShowLockModal(false)}
        onUnlock={handleUnlock}
        onPassChange={setUnlockPass}
        onErrorChange={(v) => { setLockError(v); if (!v) setDeviceMismatchError(false); }}
      />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl space-y-6 sm:space-y-8"
      >
        {/* Logo + title */}
        <div className="text-center space-y-2 sm:space-y-4">
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200 transition-all duration-500",
            isLoading && "animate-pulse scale-110 shadow-emerald-400"
          )}>
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900">{t.title}</h1>
        </div>

        {/* Input form */}
        <div className="glass rounded-3xl p-2 sm:p-3 shadow-xl">
          <form onSubmit={handleSummarize} className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
                {pdfFile ? <FileText size={20} className="text-red-500" /> : <LinkIcon size={20} />}
              </div>
              {pdfFile ? (
                <div className="w-full pl-12 pr-16 py-4 text-zinc-700 text-base break-all overflow-hidden">
                  {pdfFile.name}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder={t.placeholder}
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full pl-12 pr-32 py-4 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 text-lg outline-none"
                />
              )}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {(url || pdfFile) && !isLoading && (
                  <button type="button" onClick={() => { handleClear(); setPdfFile(null); }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                    title={t.clearLink}
                  >
                    <X size={20} />
                  </button>
                )}
                {!url && !pdfFile && !isLoading && (
                  <button type="button" onClick={handlePaste}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all active:scale-95 whitespace-nowrap"
                  >
                    <Clipboard size={14} />
                    {t.pasteLink}
                  </button>
                )}
                {isLoading && (
                  <div className="p-2">
                    <Loader2 className="animate-spin text-emerald-600" size={24} />
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* PDF upload button + Summarize when PDF ready */}
          {!isLoading && (
            <div className="flex items-center gap-2 px-2 pb-1 pt-0.5 border-t border-zinc-100/60 mt-1">
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfSelect}
                className="hidden"
              />
              {!!url && !pdfFile && (
                <button
                  type="button"
                  onClick={() => handleSummarize()}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all active:scale-95 shadow-sm"
                >
                  {t.summarize}
                </button>
              )}
              {!pdfFile && (
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <FileText size={13} />
                  {t.uploadPdf}
                </button>
              )}
              {pdfFile && (
                <button
                  type="button"
                  onClick={() => handleSummarize()}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all active:scale-95 shadow-sm"
                >
                  {t.summarizePdf}
                </button>
              )}
              {!pdfFile && (
                <>
                  <span className="text-zinc-200 text-xs">|</span>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Youtube size={11} className="text-red-500" />
                    {t.youtubeSupported}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Default summary length preset */}
        <div className="flex items-center gap-2 justify-center">
          <span className="text-[11px] text-zinc-400 font-medium">{t.presetLabel}</span>
          <div className="flex gap-1 bg-zinc-100/80 p-0.5 rounded-xl">
            {(['short', 'medium', 'long'] as const).map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => setPreferredLength(len)}
                className={cn(
                  "px-3 py-1 rounded-lg text-[11px] font-bold transition-all",
                  preferredLength === len
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                {len === 'short' ? t.presetShort : len === 'medium' ? t.presetMedium : t.presetLong}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setDeepResearchMode(!deepResearchEnabled)}
            className={cn(
              "px-4 py-2 rounded-2xl text-sm font-bold transition-all border",
              deepResearchEnabled
                ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                : "bg-white/80 text-zinc-600 border-zinc-200 hover:bg-zinc-50"
            )}
          >
            {deepResearchEnabled ? (t.deepResearchOn || 'Investigacion profunda activada') : (t.deepResearchOff || 'Activar investigacion profunda')}
          </button>
        </div>

        {/* Results + API key status */}
        <ResultCard
          t={t}
          summary={summary}
          articleTitle={articleTitle}
          url={resultCardUrl}
          error={error}
          isLoading={isLoading}
          loadingMessage={loadingMessage}
          loadingProgress={loadingProgress}
          currentLength={currentLength}
          isSpeaking={isSpeaking}
          speechRate={speechRate}
          lieScore={lieScore}
          investigationResult={investigationResult}
          apiKeys={validatedApiKeys}
          resultsRef={resultsRef}
          onSpeak={handleSpeak}
          onSpeechRateChange={setSpeechRate}
          onExpand={(length) => handleSummarize(undefined, length)}
          onShare={handleShare}
        />

        {summary && (
          <div className="flex items-center justify-center">
            <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-600 shadow-sm">
              <span className="font-medium">{t.summaryLanguageLabel}</span>
              <select
                value={summaryLanguage}
                onChange={(event) => setSummaryLanguage(event.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-emerald-400"
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showSharedToast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold shadow-xl"
          >
            Link recibido. Generando resumen...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
