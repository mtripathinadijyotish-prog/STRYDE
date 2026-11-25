import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  User,
} from 'lucide-react';
import { ApiError, api, setUserToken } from '../lib/apiClient';
import type { LifeRpgState } from '../types/hud';

interface AuthWelcomeScreenProps {
  registeredCount: number;
  leaderboardThreshold: number;
  onAuthenticated: (state: LifeRpgState) => void;
  onOpenLegal: (tab: 'privacy' | 'terms') => void;
  onOpenOwnerPortal: () => void;
}

type AuthMode = 'register' | 'login' | 'recover';

export const AuthWelcomeScreen: React.FC<AuthWelcomeScreenProps> = ({
  registeredCount,
  leaderboardThreshold,
  onAuthenticated,
  onOpenLegal,
  onOpenOwnerPortal,
}) => {
  const [mode, setMode] = useState<AuthMode>('register');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState<{
    message: string;
    newKey: string;
  } | null>(null);

  // Post-registration one-time recovery key acknowledgment
  const [pendingSession, setPendingSession] = useState<{
    token: string;
    recoveryKey: string;
    state: LifeRpgState;
  } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keySavedConfirmed, setKeySavedConfirmed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setRecoverySuccess(null);
    setShowPassword(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim() || displayName.trim().length < 2) {
      setError('Please enter a display name (at least 2 characters).');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!consentAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to create an account.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        consentAccepted: true,
      });
      setUserToken(res.token);
      setPendingSession({
        token: res.token,
        recoveryKey: res.recoveryKey,
        state: res.state,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not create your account right now. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({ email: email.trim(), password });
      setUserToken(res.token);
      onAuthenticated(res.state);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to sign in right now. Please check your connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoverySuccess(null);

    if (!email.trim() || !recoveryKeyInput.trim()) {
      setError('Enter your account email and personal recovery key.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.recoverPassword({
        email: email.trim(),
        recoveryKey: recoveryKeyInput.trim(),
        newPassword,
      });
      setRecoverySuccess({
        message: res.message,
        newKey: res.newRecoveryKey,
      });
      setPassword('');
      setNewPassword('');
      setRecoveryKeyInput('');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reset your password. Verify your email and recovery key.'
      );
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setKeyCopied(true);
      window.setTimeout(() => setKeyCopied(false), 2500);
    });
  };

  // Step 2 of Registration: Safeguard Personal Recovery Key before proceeding
  if (pendingSession) {
    return (
      <div className="hud-canvas-grid flex min-h-screen flex-col items-center justify-center px-4 py-10 text-[#E2E2EC]">
        <div className="hud-layer-2 w-full max-w-md rounded-md border border-[#10B981]/40 p-6 sm:p-7">
          <div className="flex items-center gap-2.5 text-[#65F2B5]">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-wider">Account Created</span>
          </div>
          <h1 className="mt-2 font-display text-xl font-bold text-[#E2E2EC]">
            Save Your Personal Recovery Key
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#B9CACB]">
            If you ever forget your password, this key is the only way to recover your account safely. Store it somewhere secure.
          </p>

          <div className="mt-4 flex items-center justify-between gap-2 rounded border border-[#00F0FF]/40 bg-[#0C0E15] px-3.5 py-3">
            <code className="font-mono text-sm font-semibold tracking-wider text-[#DBFCFF] break-all">
              {pendingSession.recoveryKey}
            </code>
            <button
              type="button"
              onClick={() => copyText(pendingSession.recoveryKey)}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-white/15 bg-[#131622] px-2.5 py-1.5 font-mono text-xs text-[#E2E2EC] hover:border-[#00F0FF]/60"
            >
              {keyCopied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#65F2B5]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-xs text-[#E2E2EC]">
            <input
              type="checkbox"
              checked={keySavedConfirmed}
              onChange={(e) => setKeySavedConfirmed(e.target.checked)}
              className="h-4 w-4 accent-[#00F0FF]"
            />
            I have saved my recovery key in a safe place.
          </label>

          <button
            type="button"
            disabled={!keySavedConfirmed}
            onClick={() => onAuthenticated(pendingSession.state)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2.5 font-display text-sm font-semibold text-[#08090C] transition-all hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to Setup
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hud-canvas-grid flex min-h-screen flex-col justify-between px-4 py-8 text-[#E2E2EC] sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 lg:flex-row lg:items-center lg:gap-14">
        {/* Clean Brand Intro */}
        <div className="max-w-md space-y-5 text-center lg:text-left">
          <div className="inline-flex items-center gap-2.5">
            <svg className="h-8 w-8 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
              <polygon
                points="16,2 29,9.5 29,22.5 16,30 3,22.5 3,9.5"
                fill="#0C0E15"
                stroke="#00F0FF"
                strokeWidth="2"
              />
              <polygon
                points="16,8 23,12 23,20 16,24 9,20 9,12"
                fill="#00F0FF"
                fillOpacity="0.25"
              />
            </svg>
            <span className="font-display text-xl font-bold tracking-tight text-[#E2E2EC]">
              STRYDE
            </span>
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight text-[#E2E2EC] sm:text-4xl">
            Welcome to your next level.
          </h1>
          <p className="text-base leading-relaxed text-[#B9CACB]">
            Build better habits. Achieve meaningful goals. Track your progress.
          </p>

          <div className="space-y-2.5 pt-2 text-sm text-[#B9CACB]">
            <p>· Daily and weekly missions that earn XP and level up five core skills.</p>
            <p>· Focus sessions, goal roadmaps, and ATLAS AI planning when you need support.</p>
            <p>
              · Private by default —{' '}
              <span className="font-mono text-xs text-[#00F0FF]">
                {registeredCount}/{leaderboardThreshold} members joined for global leaderboard
              </span>
              .
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="hud-layer-2 w-full max-w-md rounded-md border border-white/12 p-6 sm:p-7">
          <div className="mb-5 grid grid-cols-3 gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`min-h-[40px] rounded-sm py-2 font-display text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-[#00F0FF]/15 text-[#DBFCFF]'
                  : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`min-h-[40px] rounded-sm py-2 font-display text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-[#00F0FF]/15 text-[#DBFCFF]'
                  : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode('recover')}
              className={`min-h-[40px] rounded-sm py-2 font-display text-xs font-semibold transition-colors whitespace-nowrap ${
                mode === 'recover'
                  ? 'bg-[#00F0FF]/15 text-[#DBFCFF]'
                  : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
              }`}
            >
              Recover
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2.5 text-xs text-[#FFDAD6]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB4AB]" />
              <span>{error}</span>
            </div>
          )}

          {recoverySuccess && (
            <div className="mb-4 space-y-2 rounded border border-[#10B981]/45 bg-[#10B981]/10 p-3 text-xs text-[#E2E2EC]">
              <p className="font-semibold text-[#65F2B5]">{recoverySuccess.message}</p>
              <p className="text-[#B9CACB]">Save your new recovery key:</p>
              <div className="flex items-center justify-between gap-2 rounded bg-[#0C0E15] px-2.5 py-2">
                <code className="font-mono text-xs text-[#DBFCFF] break-all">
                  {recoverySuccess.newKey}
                </code>
                <button
                  type="button"
                  onClick={() => copyText(recoverySuccess.newKey)}
                  className="shrink-0 font-mono text-[#00F0FF] hover:underline"
                >
                  {keyCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Display Name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                  <input
                    id="auth-display-name"
                    type="text"
                    required
                    maxLength={40}
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How others see you"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-3 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-reg-email"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                  <input
                    id="auth-reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-3 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="auth-reg-password"
                    className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Password (8+ chars)
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                    <input
                      id="auth-reg-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 chars"
                      className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-9 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9BA9AC] hover:text-[#E2E2EC]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-reg-confirm"
                    className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Confirm
                  </label>
                  <input
                    id="auth-reg-confirm"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2.5 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[#B9CACB]">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#00F0FF]"
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => onOpenLegal('terms')}
                    className="text-[#00F0FF] hover:underline"
                  >
                    Terms of Service
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    onClick={() => onOpenLegal('privacy')}
                    className="text-[#00F0FF] hover:underline"
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2.5 font-display text-sm font-semibold text-[#08090C] transition-all hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create My Account
              </button>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-login-email"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                  <input
                    id="auth-login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-3 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-login-password"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                  <input
                    id="auth-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-10 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9BA9AC] hover:text-[#E2E2EC]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2.5 font-display text-sm font-semibold text-[#08090C] transition-all hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Log In
              </button>

              <p className="text-center text-xs text-[#9BA9AC]">
                Forgot your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('recover')}
                  className="text-[#00F0FF] hover:underline"
                >
                  Use your recovery key
                </button>
              </p>
            </form>
          )}

          {mode === 'recover' && (
            <form onSubmit={handleRecover} className="space-y-4">
              <p className="text-xs leading-relaxed text-[#B9CACB]">
                Enter the email address on your account and the personal recovery key saved when you joined.
              </p>

              <div>
                <label
                  htmlFor="auth-rec-email"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Email
                </label>
                <input
                  id="auth-rec-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2.5 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-rec-key"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Personal Recovery Key
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
                  <input
                    id="auth-rec-key"
                    type="text"
                    required
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    placeholder="STRYDE-XXXX-XXXX-XXXX"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-9 pr-3 font-mono text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-rec-newpw"
                  className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  New Password (8+ chars)
                </label>
                <div className="relative">
                  <input
                    id="auth-rec-newpw"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8+ characters"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] py-2.5 pl-3 pr-10 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[#00F0FF] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9BA9AC] hover:text-[#E2E2EC]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2.5 font-display text-sm font-semibold text-[#08090C] transition-all hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset Password
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mx-auto mt-8 flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-4 text-xs text-[#9BA9AC]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="min-h-[36px] hover:text-[#E2E2EC]"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onOpenLegal('terms')}
            className="min-h-[36px] hover:text-[#E2E2EC]"
          >
            Terms of Service
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenOwnerPortal}
          className="inline-flex min-h-[36px] items-center gap-1.5 text-[#9BA9AC] hover:text-[#E2E2EC]"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Owner Portal
        </button>
      </footer>
    </div>
  );
};
