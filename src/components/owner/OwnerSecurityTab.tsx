import React, { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MailCheck,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  ApiError,
  api,
  type OwnerAdminProfile,
  type OwnerSessionInfo,
} from '../../lib/apiClient';
import { checkPasswordRules } from './OwnerAuthPanel';

interface OwnerSecurityTabProps {
  admin: OwnerAdminProfile;
  recentReauthValid: boolean;
  idleMinutes: number;
  initialVerificationNotice?: string | null;
  initialRecoveryKey?: string | null;
  onRefreshDashboard: () => Promise<void>;
  onSignedOut: () => void;
}

export const OwnerSecurityTab: React.FC<OwnerSecurityTabProps> = ({
  admin,
  recentReauthValid,
  idleMinutes,
  initialVerificationNotice,
  initialRecoveryKey,
  onRefreshDashboard,
  onSignedOut,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Email verification
  const [verifyCode, setVerifyCode] = useState('');
  const [previewVerifyCode, setPreviewVerifyCode] = useState<string | null>(
    initialVerificationNotice || null
  );

  // One-time keys/codes shown after generation
  const [shownRecoveryKey, setShownRecoveryKey] = useState<string | null>(
    initialRecoveryKey || null
  );
  const [shownBackupCodes, setShownBackupCodes] = useState<string[] | null>(null);

  // Re-authentication box
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const [reauthPw, setReauthPw] = useState('');
  const [reauthTotp, setReauthTotp] = useState('');

  // Passkeys
  const [passkeyName, setPasskeyName] = useState('');

  // MFA Setup
  const [mfaSetupData, setMfaSetupData] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');

  // Password Change
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [idleInput, setIdleInput] = useState(idleMinutes);

  // Active Sessions
  const [sessions, setSessions] = useState<OwnerSessionInfo[]>([]);

  const webauthnSupported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const loadSessions = async () => {
    try {
      const res = await api.ownerSessions();
      setSessions(res.sessions);
    } catch {
      // Ignore transient error
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    setIdleInput(idleMinutes);
  }, [idleMinutes]);

  const handleApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.reauthRequired) {
      setReauthNeeded(true);
      setError('Please confirm your password or authenticator code below to authorize this sensitive change.');
      return;
    }
    setError(err instanceof ApiError ? err.message : fallback);
  };

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.ownerReauth({
        password: reauthPw || undefined,
        totpCode: reauthTotp.trim() || undefined,
      });
      setReauthNeeded(false);
      setReauthPw('');
      setReauthTotp('');
      setNotice('Identity verified for the next 5 minutes.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.ownerVerifyEmail(verifyCode.trim());
      setVerifyCode('');
      setPreviewVerifyCode(null);
      setNotice('Owner email address verified.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Could not verify code.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.ownerResendVerification();
      setPreviewVerifyCode(res.verificationCodeNotice);
      setNotice(res.message);
    } catch (err) {
      handleApiError(err, 'Could not issue verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddPasskey = async () => {
    setError(null);
    setNotice(null);
    if (!recentReauthValid) {
      setReauthNeeded(true);
      setError('Confirm your password or authenticator code before adding a passkey.');
      return;
    }
    setBusy(true);
    try {
      const opts = await api.ownerPasskeyRegisterOptions();
      const credential = await startRegistration({
        optionsJSON: opts as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });
      const label = passkeyName.trim() || `Device Passkey ${admin.passkeys.length + 1}`;
      await api.ownerPasskeyRegisterVerify(label, credential);
      setPasskeyName('');
      setNotice(`Passkey "${label}" registered.`);
      await onRefreshDashboard();
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setError('Passkey registration was cancelled or timed out.');
      } else {
        handleApiError(err, 'Could not register passkey.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    setError(null);
    if (!recentReauthValid) {
      setReauthNeeded(true);
      setError('Confirm your password or authenticator code before revoking a passkey.');
      return;
    }
    setBusy(true);
    try {
      await api.ownerDeletePasskey(id);
      setNotice('Passkey revoked.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Unable to revoke passkey.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await api.ownerMfaSetup();
      setMfaSetupData({ secret: data.secret, qrDataUrl: data.qrDataUrl });
    } catch (err) {
      handleApiError(err, 'Unable to start MFA setup.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.ownerMfaEnable(mfaConfirmCode.trim());
      setMfaSetupData(null);
      setMfaConfirmCode('');
      setShownBackupCodes(res.backupCodes);
      setNotice('Two-factor authentication enabled. Save your backup codes.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Invalid 6-digit authenticator code.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.ownerMfaDisable();
      setNotice('Two-factor authentication disabled.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Unable to disable MFA.');
    } finally {
      setBusy(false);
    }
  };

  const handleRotateBackupCodes = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.ownerMfaRegenerateCodes();
      setShownBackupCodes(res.backupCodes);
      setNotice('Generated 8 fresh one-time backup codes.');
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Unable to rotate backup codes.');
    } finally {
      setBusy(false);
    }
  };

  const handleRotateMasterRecovery = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.ownerRegenerateRecoveryKey();
      setShownRecoveryKey(res.recoveryKey);
      setNotice('Generated a new Master Recovery Key.');
    } catch (err) {
      handleApiError(err, 'Unable to rotate master recovery key.');
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rules = checkPasswordRules(newPw);
    if (!Object.values(rules).every(Boolean)) {
      setError('New password must be 12+ characters with upper, lower, number, and symbol.');
      return;
    }
    setBusy(true);
    try {
      await api.ownerChangePassword(curPw, newPw);
      setCurPw('');
      setNewPw('');
      setNotice('Password updated and other admin sessions signed out.');
      await loadSessions();
    } catch (err) {
      handleApiError(err, 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveIdleTimeout = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.ownerUpdateConfig({ ownerSessionIdleMinutes: idleInput });
      setNotice(`Session inactivity timeout updated to ${idleInput} minutes.`);
      await onRefreshDashboard();
    } catch (err) {
      handleApiError(err, 'Could not update session timeout.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSessions = async (includeCurrent: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.ownerRevokeAllSessions(includeCurrent);
      if (res.signedOut) {
        onSignedOut();
        return;
      }
      setNotice(`Signed out ${res.revokedCount} other session(s).`);
      await loadSessions();
    } catch (err) {
      handleApiError(err, 'Could not revoke sessions.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2.5 text-xs text-[#FFDAD6]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded border border-[#10B981]/45 bg-[#10B981]/10 px-3 py-2.5 text-xs text-[#65F2B5]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Email Verification */}
      {!admin.emailVerified && (
        <div className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#FCD34D]">
              <MailCheck className="h-4 w-4" />
              Verify Owner Email ({admin.email})
            </span>
            <button
              type="button"
              onClick={() => void handleResendCode()}
              disabled={busy}
              className="rounded border border-[#F59E0B]/40 px-2.5 py-1 font-mono text-[11px] text-[#FCD34D]"
            >
              Issue Verification Code
            </button>
          </div>
          {previewVerifyCode && (
            <p className="rounded bg-[#0C0E15] px-3 py-2 font-mono text-xs text-[#DBFCFF]">
              One-time 6-digit verification code (no external SMTP configured):{' '}
              <strong className="text-[#00F0FF]">{previewVerifyCode}</strong>
            </p>
          )}
          <form onSubmit={handleVerifyEmail} className="flex gap-2">
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Enter 6-digit code"
              className="flex-1 rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-[#F59E0B] px-3.5 py-1.5 font-display text-xs font-semibold text-[#08090C]"
            >
              Verify Email
            </button>
          </form>
        </div>
      )}

      {/* One-time Master Recovery Key & Backup Codes Callouts */}
      {shownRecoveryKey && (
        <div className="rounded border border-[#00F0FF]/40 bg-[#0C0E15] p-3.5 text-xs space-y-1.5">
          <p className="font-semibold text-[#00F0FF]">Save Your Master Recovery Key (Shown Once)</p>
          <code className="block font-mono text-sm text-[#DBFCFF] break-all">{shownRecoveryKey}</code>
        </div>
      )}
      {shownBackupCodes && (
        <div className="rounded border border-[#10B981]/40 bg-[#0C0E15] p-3.5 text-xs space-y-2">
          <p className="font-semibold text-[#65F2B5]">Save Your 8 One-Time MFA Backup Codes</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 font-mono text-[#DBFCFF]">
            {shownBackupCodes.map((c) => (
              <span key={c} className="rounded border border-white/10 bg-[#131622] px-2 py-1 text-center">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step-Up Verification Box */}
      {(reauthNeeded || !recentReauthValid) && (
        <form onSubmit={handleReauth} className="rounded border border-white/15 bg-[#0C0E15] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-display text-xs font-semibold text-[#E2E2EC]">
              Step-Up Verification {recentReauthValid ? '(Active)' : '(Required for Passkeys / MFA edits)'}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="password"
              value={reauthPw}
              onChange={(e) => setReauthPw(e.target.value)}
              placeholder="Current password"
              className="rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
            />
            {admin.totpEnabled && (
              <input
                type="text"
                value={reauthTotp}
                onChange={(e) => setReauthTotp(e.target.value)}
                placeholder="Or 6-digit MFA code"
                className="rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
              />
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded border border-[#00F0FF]/50 bg-[#00F0FF]/15 px-3 py-1.5 font-mono text-xs text-[#DBFCFF]"
            >
              Confirm Identity
            </button>
          </div>
        </form>
      )}

      {/* Passkeys / Biometrics / Hardware Security Keys */}
      <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <Fingerprint className="h-4 w-4 text-[#00F0FF]" />
            Passkeys &amp; Hardware Security Keys ({admin.passkeys.length})
          </span>
          {!webauthnSupported && (
            <span className="font-mono text-[11px] text-[#9BA9AC]">WebAuthn unavailable in this browser</span>
          )}
        </div>

        {admin.passkeys.length > 0 && (
          <div className="space-y-2">
            {admin.passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-[#131622] px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#E2E2EC]">{pk.name}</p>
                  <p className="font-mono text-[10px] text-[#9BA9AC]">
                    {pk.deviceType === 'multiDevice' ? 'Synced Passkey' : 'Device-bound Key'} · Added{' '}
                    {new Date(pk.createdAt).toLocaleDateString()}
                    {pk.lastUsedAt ? ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDeletePasskey(pk.id)}
                  className="inline-flex items-center gap-1 rounded border border-[#FFB4AB]/35 px-2.5 py-1 font-mono text-[11px] text-[#FFB4AB] hover:bg-[#93000A]/30"
                >
                  <Trash2 className="h-3 w-3" />
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}

        {webauthnSupported && (
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              maxLength={50}
              value={passkeyName}
              onChange={(e) => setPasskeyName(e.target.value)}
              placeholder="Passkey label (e.g., MacBook Touch ID, YubiKey)"
              className="min-w-[200px] flex-1 rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleAddPasskey()}
              className="inline-flex items-center gap-1.5 rounded bg-[#00F0FF] px-3.5 py-1.5 font-display text-xs font-semibold text-[#08090C]"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Register Passkey
            </button>
          </div>
        )}
      </div>

      {/* TOTP Authenticator App MFA */}
      <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <ShieldCheck className="h-4 w-4 text-[#65F2B5]" />
            Authenticator App MFA (TOTP)
          </span>
          <span className={`font-mono text-xs ${admin.totpEnabled ? 'text-[#65F2B5]' : 'text-[#9BA9AC]'}`}>
            {admin.totpEnabled ? `Active · ${admin.recoveryCodesRemaining} backup codes left` : 'Disabled'}
          </span>
        </div>

        {!admin.totpEnabled && !mfaSetupData && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleStartMfaSetup()}
            className="inline-flex items-center gap-1.5 rounded border border-[#00F0FF]/50 bg-[#00F0FF]/12 px-3 py-1.5 font-mono text-xs text-[#DBFCFF]"
          >
            <QrCode className="h-3.5 w-3.5" />
            Set Up Authenticator App
          </button>
        )}

        {mfaSetupData && (
          <form onSubmit={handleEnableMfa} className="space-y-3 rounded border border-white/10 bg-[#131622] p-3">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <img
                src={mfaSetupData.qrDataUrl}
                alt="Authenticator QR Code"
                className="h-36 w-36 rounded bg-white p-1.5"
              />
              <div className="space-y-2 text-xs text-[#B9CACB]">
                <p>Scan this QR code with Google Authenticator, 1Password, or Authy, or enter manually:</p>
                <code className="block rounded bg-[#0C0E15] px-2.5 py-1.5 font-mono text-xs text-[#DBFCFF] break-all">
                  {mfaSetupData.secret}
                </code>
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    required
                    value={mfaConfirmCode}
                    onChange={(e) => setMfaConfirmCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-40 rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded bg-[#00F0FF] px-3 py-1.5 font-display text-xs font-semibold text-[#08090C]"
                  >
                    Enable MFA
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {admin.totpEnabled && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRotateBackupCodes()}
              className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate Backup Codes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDisableMfa()}
              className="rounded border border-[#FFB4AB]/35 px-3 py-1.5 font-mono text-xs text-[#FFB4AB]"
            >
              Disable MFA
            </button>
          </div>
        )}
      </div>

      {/* Password, Recovery Key & Idle Timeout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form onSubmit={handleChangePassword} className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-2.5">
          <p className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-[#E2E2EC]">
            <Lock className="h-4 w-4 text-[#00F0FF]" />
            Change Password
          </p>
          <input
            type="password"
            required
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
            placeholder="Current password"
            className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
          />
          <input
            type="password"
            required
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New strong password (12+ chars)"
            className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC] hover:border-[#00F0FF]/50"
          >
            Update Password
          </button>
        </form>

        <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
          <p className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-[#E2E2EC]">
            <KeyRound className="h-4 w-4 text-[#FCD34D]" />
            Recovery &amp; Session Timeout
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRotateMasterRecovery()}
            className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC] hover:border-[#00F0FF]/50"
          >
            Rotate Master Recovery Key
          </button>
          <div className="flex items-center gap-2 pt-1">
            <label htmlFor="idle-mins" className="font-mono text-[11px] text-[#9BA9AC] whitespace-nowrap">
              Idle Logout (min):
            </label>
            <input
              id="idle-mins"
              type="number"
              min={5}
              max={120}
              value={idleInput}
              onChange={(e) => setIdleInput(Math.max(5, Math.min(120, Number(e.target.value) || 30)))}
              className="w-20 rounded border border-white/15 bg-[#131622] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSaveIdleTimeout()}
              className="rounded border border-white/15 bg-[#131622] px-2.5 py-1 font-mono text-xs text-[#E2E2EC]"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Active Sessions & Logout From All Devices */}
      <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-[#E2E2EC]">
            Active Admin Sessions ({sessions.length})
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRevokeSessions(false)}
              className="rounded border border-white/15 bg-[#131622] px-2.5 py-1 font-mono text-[11px] text-[#E2E2EC]"
            >
              Sign Out Other Devices
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRevokeSessions(true)}
              className="inline-flex items-center gap-1 rounded border border-[#FFB4AB]/35 px-2.5 py-1 font-mono text-[11px] text-[#FFB4AB]"
            >
              <LogOut className="h-3 w-3" />
              Sign Out All Devices
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-[#131622] px-3 py-2 font-mono text-[11px]"
            >
              <span className="truncate max-w-sm text-[#B9CACB]">
                {s.current ? '● Current · ' : ''}
                {s.ipMasked} · {s.userAgent}
              </span>
              <span className="text-[#9BA9AC]">
                Active {new Date(s.lastActivityAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
