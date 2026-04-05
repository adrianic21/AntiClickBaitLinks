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
    userApiKey, setUserApiKey, apiKeys, validatedApiKeys, isValidatingKeys, provider, setProvider, isKeySaved,
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
    preferredLength, setPreferredLength, setSummaryLanguage,
    handleUnlock, handlePaste, handleClear, handleSummarize,
    handleSpeak, handleShare,
    updateDisplayName,
  } = state;

  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPdfFile(file); setUrl(''); }
    e.target.value = '';
  };

  const resultCardUrl = pdfFile ? `pdf:${pdfFile.name}` : url;

  const handleLogoClick = () => {
    handleClear();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isAuthLoading && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-emerald-50">
        <div className="flex items-center gap-3 text-sm font-medium text-zinc-400">
          <Loader2 size={16} className="animate-spin text-emerald-500" />
          Cargando…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-emerald-50/60">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-emerald-200/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-[10%] right-[5%] w-[35%] h-[35%] bg-teal-100/30 rounded-full blur-3xl" />
        <div className="absolute top-[30%] left-[50%] w-[20%] h-[20%] bg-emerald-100/20 rounded-full blur-3xl" />
      </div>

      {/* ── Fixed navigation header ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-xl border-b border-zinc-100/80">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex items-center justify-between py-2">
            {/* Logo mark in header */}
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center gap-2.5 group"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm group-hover:bg-emerald-700 transition-colors">
                <ShieldCheck size={14} />
              </div>
              <span className="text-sm font-bold text-zinc-800 hidden sm:block tracking-tight">AntiClickBait</span>
            </button>

            {/* Navigation buttons */}
            <TopBar
              t={t}
              isPremium={isPremium}
              remainingSearches={remainingSearches === -1 ? 10 : remainingSearches}
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
          </div>
        </div>
      </header>

      {/* ── Modals & overlays ── */}

      {/* Auth modal */}
      <AnimatePresence>
        {showAuthModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]"
              onClick={() => setShowAuthModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="fixed top-1/2 left-1/2 z-[71] w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2"
            >
              <AuthGate
                t={t} uiLanguage={uiLanguage} mode={authMode} loading={isAuthLoading} error={authError}
                name={authName} email={authEmail} password={authPassword}
                onNameChange={setAuthName} onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword}
                onSubmit={submitAuth} onModeChange={setAuthMode} onOAuthStart={startOAuth}
                onClose={() => setShowAuthModal(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <FeedModal
        t={t} show={showFeed} onClose={() => openPopup('')}
        sources={feedSources} items={dailyFeedItems} isLoading={isFeedLoading} error={feedError}
        onAddSource={addFeedSource} onToggleSource={toggleFeedSource} onRemoveSource={removeFeedSource}
        onRefresh={refreshDailyFeed} onUpdateSourceItemsPerLoad={updateFeedSourceItemsPerLoad}
        onSummarizeMany={summarizeManyFeedItems}
      />

      {currentUser && (
        <ProfilePanel
          t={t} show={showProfile} onClose={() => openPopup('')}
          currentUser={currentUser} isPremium={isPremium}
          provider={provider} setProvider={setProvider}
          userApiKey={userApiKey} setUserApiKey={setUserApiKey}
          apiKeys={apiKeys} isKeySaved={isKeySaved} onSaveApiKey={saveApiKey}
          onLogout={logout} appInsights={appInsights} onUpdateName={updateDisplayName}
          remainingSearches={remainingSearches === -1 ? 10 : remainingSearches}
          nextResetTime={nextResetTime} timeLeft={timeLeft}
          unlockPass={unlockPass} lockError={lockError} deviceMismatchError={deviceMismatchError}
          isLoading={isLoading} onPassChange={setUnlockPass} onUnlock={handleUnlock}
        />
      )}

      {/* Onboarding language picker */}
      <AnimatePresence>
        {showOnboardingLang && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[45]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-xs rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl z-[46] space-y-4"
            >
              <div className="text-center space-y-1">
                <div className="text-3xl mb-2">🌍</div>
                <h3 className="font-bold text-zinc-900 text-lg">Choose your language</h3>
                <p className="text-xs text-zinc-400">Selecciona tu idioma</p>
              </div>
              <div className="space-y-1">
                {LANGUAGES.map(lang => (
                  <button key={lang.code} onClick={() => changeUiLanguage(lang.code)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700 text-zinc-700"
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <InfoPanel
        t={t} uiLanguage={uiLanguage} show={showInfo} dontShowAgain={dontShowAgain}
        showApiPrivacy={showApiPrivacy} setShowApiPrivacy={setShowApiPrivacy}
        isPremium={isPremium} unlockPass={unlockPass} lockError={lockError}
        deviceMismatchError={deviceMismatchError} isLoading={isLoading}
        onClose={closeInfo} onUnlock={handleUnlock} onPassChange={setUnlockPass}
        onErrorChange={(v) => { setLockError(v); if (!v) setDeviceMismatchError(false); }}
      />

      <LockModal
        t={t} show={showLockModal} timeLeft={timeLeft} nextResetTime={nextResetTime}
        unlockPass={unlockPass} lockError={lockError} deviceMismatchError={deviceMismatchError} isLoading={isLoading}
        onClose={() => setShowLockModal(false)} onUnlock={handleUnlock} onPassChange={setUnlockPass}
        onErrorChange={(v) => { setLockError(v); if (!v) setDeviceMismatchError(false); }}
      />

      {/* ── Main content ── */}
      <main className="flex flex-col items-center pt-28 pb-16 px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-2xl space-y-6"
        >
          {/* Hero */}
          <div className="text-center space-y-4 pt-6">
            <motion.button
              type="button"
              onClick={handleLogoClick}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200/60 transition-colors cursor-pointer",
                isLoading && "animate-pulse bg-emerald-500"
              )}
            >
              <ShieldCheck size={30} />
            </motion.button>

            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900">{t.title}</h1>
              <p className="mt-2 text-sm text-zinc-400 font-medium">Descubre lo que realmente dice cada artículo</p>
            </div>
          </div>

          {/* Input card */}
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <form onSubmit={handleSummarize}>
              <div className="flex items-center gap-2 p-3">
                <div className="relative flex-1">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
                    {pdfFile ? <FileText size={18} className="text-red-400" /> : <LinkIcon size={18} />}
                  </div>
                  {pdfFile ? (
                    <div className="w-full pl-10 pr-14 py-3 text-sm text-zinc-600 font-medium truncate">
                      {pdfFile.name}
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder={t.placeholder}
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="w-full pl-10 pr-28 py-3 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 text-base outline-none"
                    />
                  )}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {(url || pdfFile) && !isLoading && (
                      <button type="button"
                        onClick={() => { handleClear(); setPdfFile(null); }}
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {!url && !pdfFile && !isLoading && (
                      <button type="button" onClick={handlePaste}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-lg text-xs font-bold hover:bg-zinc-200 transition-all"
                      >
                        <Clipboard size={13} />{t.pasteLink}
                      </button>
                    )}
                    {isLoading && (
                      <div className="p-2">
                        <Loader2 className="animate-spin text-emerald-600" size={18} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>

            {/* Bottom toolbar */}
            <div className="flex items-center gap-2 px-3 pb-3 pt-0 border-t border-zinc-100">
              <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" onChange={handlePdfSelect} className="hidden" />

              {!!url && !pdfFile && !isLoading && (
                <button
                  type="button" onClick={() => handleSummarize()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all active:scale-95 shadow-sm"
                >
                  {t.summarize}
                </button>
              )}
              {pdfFile && !isLoading && (
                <button
                  type="button" onClick={() => handleSummarize()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all active:scale-95 shadow-sm"
                >
                  {t.summarizePdf}
                </button>
              )}

              {!pdfFile && (
                <button
                  type="button" onClick={() => pdfInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  <FileText size={12} />{t.uploadPdf}
                </button>
              )}

              {!pdfFile && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-400 ml-auto">
                  <Youtube size={11} className="text-red-400" />{t.youtubeSupported}
                </span>
              )}
            </div>
          </div>

          {/* Length preset */}
          <div className="flex items-center gap-2 justify-center">
            <span className="text-[11px] text-zinc-400 font-medium">{t.presetLabel}</span>
            <div className="flex gap-0.5 bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
              {(['short', 'medium', 'long'] as const).map((len) => (
                <button
                  key={len} type="button" onClick={() => setPreferredLength(len)}
                  className={cn(
                    'px-3 py-1.5 rounded-[10px] text-[11px] font-bold transition-all',
                    preferredLength === len ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                  )}
                >
                  {len === 'short' ? t.presetShort : len === 'medium' ? t.presetMedium : t.presetLong}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <ResultCard
            t={t} summary={summary} articleTitle={articleTitle} url={resultCardUrl}
            error={error} isLoading={isLoading} loadingMessage={loadingMessage} loadingProgress={loadingProgress}
            currentLength={currentLength} isSpeaking={isSpeaking} speechRate={speechRate}
            lieScore={lieScore} investigationResult={investigationResult}
            apiKeys={validatedApiKeys} isValidatingKeys={isValidatingKeys}
            resultsRef={resultsRef} onSpeak={handleSpeak} onSpeechRateChange={setSpeechRate}
            onExpand={(length) => handleSummarize(undefined, length)} onShare={handleShare}
          />

          {/* Summary language selector */}
          {summary && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center justify-center"
            >
              <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-600 shadow-sm">
                <span className="text-xs font-medium text-zinc-500">{t.summaryLanguageLabel}</span>
                <select
                  value={summaryLanguage}
                  onChange={(e) => setSummaryLanguage(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 outline-none focus:border-emerald-400"
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>{language.name}</option>
                  ))}
                </select>
              </label>
            </motion.div>
          )}
        </motion.div>
      </main>

      {/* Shared toast */}
      <AnimatePresence>
        {showSharedToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold shadow-xl"
          >
            Link recibido. Generando resumen…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
