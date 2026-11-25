import React, { useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { ApiError, api, setOwnerToken, type OwnerAdminProfile } from '../../lib/apiClient';

interface OwnerAuthPanelProps {
  ownerMode: 'env' | 'claimed' | 'unclaimed';
  hasPasskeys: boolean;
  prefillEmail?: string;
  initialSessionNotice?: string | null;
  onAuthenticated: (admin: OwnerAdminProfile, verificationNotice?: string | null, recoveryKey?: string | null) => void;
}

export function checkPasswordRules(pw: string) {
  return {
    length: pw.length >= 12 && pw.length <= 128,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export const OwnerAuthPanel: React.FC<OwnerAuthPanelProps> = ({
  ownerMode,
  hasPasskeys,
  prefillEmail,
  initialSessionNotice,
  onAuthenticated,
}) => {
  const [subMode, setSubMode] = useState<'signin' | 'recover'>('signin');
  const [email, setEmail] = useState(prefillEmail || '');
  const [displayName, setDisplayName] = useState('Primary Owner');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // MFA Step state
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Recovery state
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryMfaInput, setRecoveryMfaInput] = useState('');
  const [newRecoveryPassword, setNewRecoveryPassword] = useState('');
  const [needsRecoveryMfa, setNeedsRecoveryMfa] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<{ message: string; newKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialSessionNotice || null);

  const webauthnSupported = typeof window !== 'undefined' && browserSupportsWebAuthn();
  const pwRules = checkPasswordRules(ownerMode === 'unclaimed' ? password : newRecoveryPassword);
  const allRulesPass = Object.values(pwRules).every(Boolean);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allRulesPass) {
      setError('Password must meet all strong password requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.ownerClaim({
        email: email.trim(),
        displayName: displayName.trim() || 'Primary Owner',
        password,
      });
      setOwnerToken(res.token);
      setPassword('');
      setConfirmPassword('');
      onAuthenticated(res.admin, res.verificationCodeNotice, res.recoveryKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register primary owner.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.ownerLogin(email.trim(), password);
      if ('mfaRequired' in res && res.mfaRequired) {
        setMfaChallenge(res.challengeToken);
        setPassword('');
      } else if ('token' in res) {
        setOwnerToken(res.token);
        setPassword('');
        onAuthenticated(res.admin);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Owner sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.ownerLoginMfa(mfaChallenge, mfaCode.trim());
      setOwnerToken(res.token);
      setMfaChallenge(null);
      setMfaCode('');
      onAuthenticated(res.admin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const { challengeId, optionsJSON } = await api.ownerPasskeyAuthOptions(email.trim() || undefined);
      const assertion = await startAuthentication({
        optionsJSON: optionsJSON as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      });
      const verified = await api.ownerPasskeyAuthVerify(challengeId, assertion);
      setOwnerToken(verified.token);
      onAuthenticated(verified.admin);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey prompt was cancelled or timed out.');
      } else {
        setError(err instanceof Error ? err.message : 'Passkey authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoveryResult(null);
    if (!allRulesPass) {
      setError('New password must meet all strong password requirements.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.ownerRecover({
        email: email.trim(),
        recoveryKey: recoveryKeyInput.trim(),
        mfaCode: recoveryMfaInput.trim() || undefined,
        newPassword: newRecoveryPassword,
      });
      setRecoveryResult({ message: res.message, newKey: res.newRecoveryKey });
      setRecoveryKeyInput('');
      setRecoveryMfaInput('');
      setNewRecoveryPassword('');
      setNeedsRecoveryMfa(false);
    } catch (err) {
      if (err instanceof ApiError && err.mfaRequired) {
        setNeedsRecoveryMfa(true);
      }
      setError(err instanceof ApiError ? err.message : 'Owner recovery failed.');
    } finally {
      setLoading(false);
    }
  };

  if (mfaChallenge) {
    return (
      <form onSubmit={handleMfaVerify} className="mx-auto max-w-sm space-y-4 py-4">
        <div className="rounded border border-[#00F0FF]/30 bg-[#00F0FF]/5 p-3 text-xs text-[#DBFCFF]">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-[#00F0FF]" />
            Two-Factor Verification Required
          </p>
          <p className="mt-1 text-[#B9CACB]">
            Enter the 6-digit code from your authenticator app or an 8-character one-time backup code.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="owner-mfa-code" className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
            Authenticator or Backup Code
          </label>
          <input
            id="owner-mfa-code"
            type="text"
            required
            autoFocus
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            placeholder="123456 or XXXX-XXXX"
            className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2.5 font-mono text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMfaChallenge(null);
              setMfaCode('');
              setError(null);
            }}
            className="min-h-[40px] rounded border border-white/15 px-3 py-2 font-mono text-xs text-[#B9CACB]"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2 font-display text-sm font-semibold text-[#08090C]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify &amp; Sign In
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-md py-3 space-y-4">
      {ownerMode !== 'unclaimed' && (
        <div className="grid grid-cols-2 gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
          <button
            type="button"
            onClick={() => {
              setSubMode('signin');
              setError(null);
            }}
            className={`min-h-[36px] rounded-sm font-mono text-xs ${
              subMode === 'signin' ? 'bg-[#00F0FF]/15 text-[#DBFCFF]' : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
            }`}
          >
            Administrator Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setSubMode('recover');
              setError(null);
            }}
            className={`min-h-[36px] rounded-sm font-mono text-xs ${
              subMode === 'recover' ? 'bg-[#00F0FF]/15 text-[#DBFCFF]' : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
            }`}
          >
            Verified Recovery
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2.5 text-xs text-[#FFDAD6]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {recoveryResult && (
        <div className="space-y-2 rounded border border-[#10B981]/45 bg-[#10B981]/10 p-3 text-xs text-[#E2E2EC]">
          <p className="flex items-center gap-1.5 font-semibold text-[#65F2B5]">
            <CheckCircle2 className="h-4 w-4" />
            {recoveryResult.message}
          </p>
          <div className="flex items-center justify-between gap-2 rounded bg-[#0C0E15] px-2.5 py-2">
            <code className="font-mono text-xs text-[#DBFCFF] break-all">{recoveryResult.newKey}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(recoveryResult.newKey);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 font-mono text-[#00F0FF]"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {ownerMode === 'unclaimed' ? (
        <form onSubmit={handleClaim} className="space-y-3.5">
          <div className="rounded border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-xs leading-relaxed text-[#E2E2EC]">
            <p className="font-semibold text-[#FCD34D]">Initial Primary Owner Registration</p>
            <p className="mt-1 text-[#B9CACB]">
              Set your dedicated owner email and a strong 12+ character password. Ordinary users cannot register as owners.
            </p>
          </div>

          <div>
            <label htmlFor="claim-display" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Owner Display Name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
              <input
                id="claim-display"
                type="text"
                required
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded border border-white/15 bg-[#0C0E15] py-2 pl-9 pr-3 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="claim-email" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Owner Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
              <input
                id="claim-email"
                type="email"
                required
                readOnly={Boolean(prefillEmail)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@yourdomain.com"
                className="w-full rounded border border-white/15 bg-[#0C0E15] py-2 pl-9 pr-3 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="claim-pw" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Strong Password (12+ chars)
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
              <input
                id="claim-pw"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-white/15 bg-[#0C0E15] py-2 pl-9 pr-10 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9BA9AC]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="claim-pw-confirm" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Confirm Password
            </label>
            <input
              id="claim-pw-confirm"
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded border border-white/10 bg-[#0C0E15] p-2.5 text-[11px]">
            {[
              ['12+ characters', pwRules.length],
              ['Uppercase (A-Z)', pwRules.upper],
              ['Lowercase (a-z)', pwRules.lower],
              ['Number (0-9)', pwRules.number],
              ['Special symbol', pwRules.symbol],
            ].map(([label, ok]) => (
              <span key={String(label)} className={`inline-flex items-center gap-1.5 ${ok ? 'text-[#65F2B5]' : 'text-[#9BA9AC]'}`}>
                <Check className={`h-3 w-3 ${ok ? 'opacity-100' : 'opacity-30'}`} />
                {label}
              </span>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2 font-display text-sm font-semibold text-[#08090C]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Primary Owner Account
          </button>
        </form>
      ) : subMode === 'signin' ? (
        <div className="space-y-4">
          {hasPasskeys && webauthnSupported && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void handlePasskeySignIn()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded border border-[#00F0FF]/50 bg-[#00F0FF]/12 px-4 py-2.5 font-display text-sm font-semibold text-[#DBFCFF] hover:bg-[#00F0FF]/20"
            >
              <Fingerprint className="h-4 w-4 text-[#00F0FF]" />
              Sign In with Passkey / Biometrics
            </button>
          )}

          <form onSubmit={handlePasswordLogin} className="space-y-3.5">
            <div>
              <label htmlFor="owner-login-email" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
                Owner / Admin Email
              </label>
              <input
                id="owner-login-email"
                type="email"
                required
                autoComplete="username webauthn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="owner-login-pw" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
                Password
              </label>
              <div className="relative">
                <input
                  id="owner-login-pw"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-white/15 bg-[#0C0E15] py-2 pl-3 pr-10 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#9BA9AC]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2 font-display text-sm font-semibold text-[#08090C]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In to Owner Portal
            </button>
          </form>
        </div>
      ) : (
        <form onSubmit={handleRecover} className="space-y-3.5">
          <p className="text-xs leading-relaxed text-[#B9CACB]">
            Verify your email, master recovery key, and two-factor code (if MFA is enabled) to reset your owner password. All active sessions will be signed out.
          </p>

          <div>
            <label htmlFor="rec-email" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Administrator Email
            </label>
            <input
              id="rec-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
            />
          </div>

          <div>
            <label htmlFor="rec-key" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Master Recovery Key
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
              <input
                id="rec-key"
                type="text"
                required
                value={recoveryKeyInput}
                onChange={(e) => setRecoveryKeyInput(e.target.value)}
                placeholder="STRYDE-OWN-XXXX-XXXX-XXXX"
                className="w-full rounded border border-white/15 bg-[#0C0E15] py-2 pl-9 pr-3 font-mono text-xs text-[#E2E2EC]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rec-mfa" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              {needsRecoveryMfa ? 'Two-Factor Code (Required)' : 'Two-Factor Code (if MFA enabled)'}
            </label>
            <input
              id="rec-mfa"
              type="text"
              required={needsRecoveryMfa}
              value={recoveryMfaInput}
              onChange={(e) => setRecoveryMfaInput(e.target.value)}
              placeholder="6-digit authenticator or backup code"
              className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 font-mono text-xs text-[#E2E2EC]"
            />
          </div>

          <div>
            <label htmlFor="rec-new-pw" className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              New Strong Password (12+ chars)
            </label>
            <input
              id="rec-new-pw"
              type={showPassword ? 'text' : 'password'}
              required
              value={newRecoveryPassword}
              onChange={(e) => setNewRecoveryPassword(e.target.value)}
              className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[#00F0FF] px-4 py-2 font-display text-sm font-semibold text-[#08090C]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify &amp; Reset Password
          </button>
        </form>
      )}
    </div>
  );
};
