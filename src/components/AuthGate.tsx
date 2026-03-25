import { Loader2, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthGateProps {
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
}

export function AuthGate({
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
}: AuthGateProps) {
  const isSignup = mode === 'signup';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-10">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-emerald-100" />
        <div className="absolute bottom-0 left-0 w-full h-[50%] bg-gradient-to-t from-emerald-200/70 via-emerald-100/40 to-transparent" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-emerald-300/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-[10%] right-[5%] w-[35%] h-[35%] bg-teal-200/25 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass rounded-[2rem] p-6 sm:p-8 shadow-2xl space-y-5"
      >
        <div className="space-y-3 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
            <ShieldCheck size={30} />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{t.authTitle || 'Sign in to AntiClickBaitLinks'}</h1>
            <p className="text-sm text-zinc-500">{t.authDescription || 'Keep your API keys, summaries, premium access and settings synced across all your devices.'}</p>
          </div>
        </div>

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

        <div className="space-y-3">
          {isSignup && (
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={t.authNamePlaceholder || 'Your name'}
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
            placeholder={t.authPasswordPlaceholder || 'Password'}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-emerald-400"
          />
          {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {isSignup ? (t.authSignUp || 'Create account') : (t.authSignIn || 'Sign in')}
          </button>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onOAuthStart('google')}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 transition-all hover:border-emerald-300 hover:text-emerald-700"
          >
            {t.authContinueGoogle || 'Continue with Google'}
          </button>
        </div>

        <p className="text-center text-xs text-zinc-500">
          {t.authSyncCaption || 'Your account keeps your API keys, premium access, daily limits and settings synced between devices.'}
        </p>
      </motion.div>
    </div>
  );
}
