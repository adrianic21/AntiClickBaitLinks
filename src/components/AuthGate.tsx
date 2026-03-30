import React, { useState } from 'react';
import { Loader2, LogIn, Mail, ShieldCheck, X } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthGateProps {
  uiLanguage: string;
  t: {
    authTitle?: string;
    authDescription?: string;
    authNamePlaceholder?: string;
    authEmailPlaceholder?: string;
    authPasswordPlaceholder?: string;
    authSignIn?: string;
    authSignUp?: string;
    authContinueGoogle?: string;
    authSwitchToSignUp?: string;
    authSwitchToSignIn?: string;
    authSyncCaption?: string;
  };
  mode: 'login' | 'signup';
  loading: boolean;
  error: string | null;
  name: string;
  email: string;
  password: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onModeChange: (mode: 'login' | 'signup') => void;
  onOAuthStart: (provider: 'google') => void;
  onClose: () => void;
}

export function AuthGate({
  uiLanguage,
  t,
  mode,
  loading,
  error,
  name,
  email,
  password,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onModeChange,
  onOAuthStart,
  onClose,
}: AuthGateProps) {
  const isSignup = mode === 'signup';
  const [resetMode, setResetMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const copy = {
    English: {
      resetTitle: 'Reset password',
      resetDescription: 'Choose a new password for your account.',
      resetEmail: 'Enter your email to reset the password.',
      resetPasswordShort: 'Your new password must be at least 8 characters long.',
      resetFailed: 'We could not reset your password.',
      resetSuccess: 'Password updated. You can sign in now.',
      resetButton: 'Reset password',
      forgot: 'Forgot your password?',
      noAccount: 'No account yet? Switch to "Create account".',
      hasAccount: 'Already have an account? Switch to "Sign in".',
      newPassword: 'New password',
    },
    Spanish: {
      resetTitle: 'Restablecer contraseña',
      resetDescription: 'Elige una nueva contraseña para tu cuenta.',
      resetEmail: 'Introduce tu correo para restablecer la contraseña.',
      resetPasswordShort: 'La nueva contraseña debe tener al menos 8 caracteres.',
      resetFailed: 'No se pudo restablecer la contraseña.',
      resetSuccess: 'Contraseña actualizada. Ya puedes iniciar sesión.',
      resetButton: 'Restablecer contraseña',
      forgot: '¿Olvidaste tu contraseña?',
      noAccount: '¿Aún no tienes cuenta? Cambia a "Crear cuenta".',
      hasAccount: '¿Ya tienes cuenta? Cambia a "Iniciar sesión".',
      newPassword: 'Nueva contraseña',
    },
  }[uiLanguage] || {
    resetTitle: 'Reset password',
    resetDescription: 'Choose a new password for your account.',
    resetEmail: 'Enter your email to reset the password.',
    resetPasswordShort: 'Your new password must be at least 8 characters long.',
    resetFailed: 'We could not reset your password.',
    resetSuccess: 'Password updated. You can sign in now.',
    resetButton: 'Reset password',
    forgot: 'Forgot your password?',
    noAccount: 'No account yet? Switch to "Create account".',
    hasAccount: 'Already have an account? Switch to "Sign in".',
    newPassword: 'New password',
  };

  const handleForgotPassword = async () => {
    if (!resetMode) {
      setResetMode(true);
      setResetMessage(null);
      return;
    }
    if (!email) {
      setResetMessage(copy.resetEmail);
      return;
    }
    if (!password || password.length < 8) {
      setResetMessage(copy.resetPasswordShort);
      return;
    }
    try {
      setResetLoading(true);
      setResetMessage(null);
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || copy.resetFailed);
      }
      setResetMessage(copy.resetSuccess);
      onModeChange('login');
      onPasswordChange('');
    } catch (err: any) {
      setResetMessage(err?.message || copy.resetFailed);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="w-full glass rounded-[2rem] p-6 sm:p-8 shadow-2xl space-y-5 bg-white/90 text-zinc-900 dark:bg-zinc-900/90 dark:text-zinc-100"
    >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3 text-left flex-1">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
              <ShieldCheck size={26} />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                {resetMode
                  ? copy.resetTitle
                  : (t.authTitle || 'Sign in to AntiClickBaitLinks')}
              </h1>
              {(resetMode || t.authDescription) && (
                <p className="text-sm text-zinc-500">
                  {resetMode
                    ? copy.resetDescription
                    : t.authDescription}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {!resetMode && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100/80 p-1">
            <button
              type="button"
              onClick={() => onModeChange('login')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${!isSignup ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500'}`}
            >
              {t.authSignIn || 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => onModeChange('signup')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${isSignup ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500'}`}
            >
              {t.authSignUp || 'Create account'}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {isSignup && !resetMode && (
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={t.authNamePlaceholder || 'Your name or alias'}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-emerald-400"
            />
          )}
          <div className="relative">
            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder={t.authEmailPlaceholder || 'Email'}
              className="w-full rounded-2xl border border-zinc-200 bg-white pl-11 pr-4 py-3 text-sm text-zinc-900 outline-none focus:border-emerald-400"
            />
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={
              resetMode
                ? copy.newPassword
                : (t.authPasswordPlaceholder || 'Password')
            }
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-emerald-400"
          />
          {error && !resetMode && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {resetMessage && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {resetMessage}
            </div>
          )}
          {!resetMode && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {isSignup ? (t.authSignUp || 'Create account') : (t.authSignIn || 'Sign in')}
            </button>
          )}
          {resetMode && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
            >
              {resetLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {copy.resetButton}
            </button>
          )}
        </div>

        {!resetMode && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onOAuthStart('google')}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition-all hover:border-emerald-300 hover:text-emerald-700"
            >
              {t.authContinueGoogle || 'Continue with Google'}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-emerald-600 font-semibold hover:text-emerald-700"
          >
            {copy.forgot}
          </button>
          {!resetMode && (
            <span>
              {mode === 'login'
                ? copy.noAccount
                : copy.hasAccount}
            </span>
          )}
        </div>

        <p className="text-center text-xs text-zinc-500">
          {t.authSyncCaption || 'Your account keeps your API keys, premium access, daily limits and settings synced between devices.'}
        </p>
      </motion.div>
  );
}
