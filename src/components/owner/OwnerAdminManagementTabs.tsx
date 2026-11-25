import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Bot,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Sliders,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import {
  ApiError,
  api,
  type OwnerActivityEntry,
  type OwnerAdminProfile,
  type OwnerAppConfig,
  type OwnerUserSummary,
} from '../../lib/apiClient';
import type { MaintenanceStatus } from '../../types/hud';
import { checkPasswordRules } from './OwnerAuthPanel';

interface UsersTabProps {
  currentAdmin: OwnerAdminProfile;
  admins: OwnerAdminProfile[];
  onRefreshDashboard: () => Promise<void>;
}

export const OwnerUsersTab: React.FC<UsersTabProps> = ({
  currentAdmin,
  admins,
  onRefreshDashboard,
}) => {
  const [users, setUsers] = useState<OwnerUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add Admin state (Primary Owner only)
  const [newAdmEmail, setNewAdmEmail] = useState('');
  const [newAdmName, setNewAdmName] = useState('');
  const [newAdmPw, setNewAdmPw] = useState('');
  const [newAdmResult, setNewAdmResult] = useState<{
    email: string;
    recoveryKey: string;
    verificationCode: string;
  } | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.ownerUsers();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
  });

  const handleToggleSuspend = async (u: OwnerUserSummary) => {
    setError(null);
    try {
      await api.ownerUpdateUser(u.id, { suspended: !u.suspended });
      setNotice(u.suspended ? `Reinstated ${u.email}.` : `Suspended ${u.email}.`);
      await loadUsers();
      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const handleRevokeUserSessions = async (u: OwnerUserSummary) => {
    setError(null);
    try {
      await api.ownerUpdateUser(u.id, { revokeSessions: true });
      setNotice(`Signed out active sessions for ${u.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    setError(null);
    try {
      await api.ownerDeleteUser(id);
      setConfirmDeleteId(null);
      setNotice('User account permanently deleted.');
      await loadUsers();
      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNewAdmResult(null);
    const rules = checkPasswordRules(newAdmPw);
    if (!Object.values(rules).every(Boolean)) {
      setError('Admin password must be 12+ chars with upper, lower, number, and symbol.');
      return;
    }
    try {
      const res = await api.ownerAddAdmin({
        email: newAdmEmail.trim(),
        displayName: newAdmName.trim() || 'Administrator',
        password: newAdmPw,
      });
      setNewAdmResult({
        email: res.admin.email,
        recoveryKey: res.recoveryKey,
        verificationCode: res.verificationCodeNotice,
      });
      setNewAdmEmail('');
      setNewAdmName('');
      setNewAdmPw('');
      await onRefreshDashboard();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.reauthRequired
            ? 'Confirm your identity in the Security tab before adding administrators.'
            : err.message
          : 'Could not add administrator.'
      );
    }
  };

  const handleRemoveAdmin = async (id: string) => {
    setError(null);
    try {
      await api.ownerRemoveAdmin(id);
      setNotice('Administrator removed.');
      await onRefreshDashboard();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.reauthRequired
            ? 'Confirm your identity in the Security tab before removing administrators.'
            : err.message
          : 'Could not remove administrator.'
      );
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded border border-[#10B981]/45 bg-[#10B981]/10 px-3 py-2 text-xs text-[#65F2B5]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Registered Members */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <Users className="h-4 w-4 text-[#00F0FF]" />
            Registered Members ({users.length})
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by email or name..."
            className="rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 text-xs text-[#E2E2EC]"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 font-mono text-xs text-[#9BA9AC]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading member accounts...
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded border border-white/10 bg-[#0C0E15] py-6 text-center text-xs text-[#9BA9AC]">
            No matching member accounts.
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-[#0C0E15] p-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#E2E2EC]">{u.displayName}</span>
                    {u.suspended && (
                      <span className="rounded bg-[#93000A]/50 px-1.5 py-0.5 font-mono text-[10px] text-[#FFB4AB]">
                        SUSPENDED
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-[#9BA9AC] truncate">{u.email}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#849495]">
                    Lv.{u.level} · {u.totalXp} XP · {u.completedCount} clears · Active{' '}
                    {new Date(u.lastActiveAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleSuspend(u)}
                    className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 font-mono text-[11px] ${
                      u.suspended
                        ? 'border-[#10B981]/40 text-[#65F2B5]'
                        : 'border-[#F59E0B]/40 text-[#FCD34D]'
                    }`}
                  >
                    {u.suspended ? <UserCheck className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                    {u.suspended ? 'Reinstate' : 'Suspend'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevokeUserSessions(u)}
                    className="rounded border border-white/15 px-2.5 py-1 font-mono text-[11px] text-[#B9CACB]"
                  >
                    Sign Out
                  </button>
                  {currentAdmin.role === 'primary' &&
                    (confirmDeleteId === u.id ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u.id)}
                        className="rounded bg-[#93000A] px-2.5 py-1 font-mono text-[11px] text-[#FFDAD6]"
                      >
                        Confirm Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(u.id)}
                        aria-label={`Delete ${u.email}`}
                        className="rounded border border-[#FFB4AB]/30 p-1.5 text-[#FFB4AB]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Authorized Administrators */}
      <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
        <p className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
          <ShieldAlert className="h-4 w-4 text-[#FCD34D]" />
          Authorized Administrators ({admins.length})
        </p>

        <div className="space-y-2">
          {admins.map((adm) => (
            <div
              key={adm.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-[#131622] px-3 py-2 text-xs"
            >
              <div>
                <p className="font-semibold text-[#E2E2EC]">
                  {adm.displayName}{' '}
                  <span className="ml-1 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#00F0FF]">
                    {adm.role === 'primary' ? 'Primary Owner' : 'Admin'}
                  </span>
                </p>
                <p className="font-mono text-[11px] text-[#9BA9AC]">
                  {adm.email} · {adm.emailVerified ? 'Verified' : 'Unverified'} ·{' '}
                  {adm.totpEnabled ? 'MFA On' : 'MFA Off'} · {adm.passkeys.length} Passkeys
                </p>
              </div>
              {currentAdmin.role === 'primary' && adm.role !== 'primary' && (
                <button
                  type="button"
                  onClick={() => void handleRemoveAdmin(adm.id)}
                  className="rounded border border-[#FFB4AB]/35 px-2.5 py-1 font-mono text-[11px] text-[#FFB4AB]"
                >
                  Revoke Admin
                </button>
              )}
            </div>
          ))}
        </div>

        {currentAdmin.role === 'primary' && (
          <form onSubmit={handleCreateAdmin} className="border-t border-white/10 pt-3 space-y-2.5">
            <p className="inline-flex items-center gap-1.5 font-mono text-xs text-[#B9CACB]">
              <UserPlus className="h-3.5 w-3.5 text-[#00F0FF]" />
              Authorize Additional Administrator
            </p>
            {newAdmResult && (
              <div className="rounded border border-[#10B981]/40 bg-[#10B981]/10 p-2.5 font-mono text-[11px] text-[#DBFCFF] space-y-1">
                <p>Added {newAdmResult.email}</p>
                <p>Recovery Key: {newAdmResult.recoveryKey}</p>
                <p>Email Verification Code: {newAdmResult.verificationCode}</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                required
                value={newAdmName}
                onChange={(e) => setNewAdmName(e.target.value)}
                placeholder="Name"
                className="rounded border border-white/15 bg-[#131622] px-2.5 py-1.5 text-xs text-[#E2E2EC]"
              />
              <input
                type="email"
                required
                value={newAdmEmail}
                onChange={(e) => setNewAdmEmail(e.target.value)}
                placeholder="admin@domain.com"
                className="rounded border border-white/15 bg-[#131622] px-2.5 py-1.5 text-xs text-[#E2E2EC]"
              />
              <input
                type="password"
                required
                value={newAdmPw}
                onChange={(e) => setNewAdmPw(e.target.value)}
                placeholder="Strong password (12+)"
                className="rounded border border-white/15 bg-[#131622] px-2.5 py-1.5 text-xs text-[#E2E2EC]"
              />
            </div>
            <button
              type="submit"
              className="rounded bg-[#00F0FF] px-3 py-1.5 font-display text-xs font-semibold text-[#08090C]"
            >
              Add Administrator
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface ConfigTabProps {
  appConfig: OwnerAppConfig;
  maintenance: MaintenanceStatus;
  onMaintenanceUpdated: (m: MaintenanceStatus) => void;
  onRefreshDashboard: () => Promise<void>;
}

export const OwnerConfigTab: React.FC<ConfigTabProps> = ({
  appConfig,
  maintenance,
  onMaintenanceUpdated,
  onRefreshDashboard,
}) => {
  const [cfg, setCfg] = useState<OwnerAppConfig>(appConfig);
  const [maintEnabled, setMaintEnabled] = useState(maintenance.enabled);
  const [maintMessage, setMaintMessage] = useState(maintenance.message);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCfg(appConfig);
  }, [appConfig]);

  useEffect(() => {
    setMaintEnabled(maintenance.enabled);
    setMaintMessage(maintenance.message);
  }, [maintenance]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await api.ownerUpdateConfig(cfg);
      setNotice('AI and application configuration saved.');
      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaintenance = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api.ownerSetMaintenance(maintEnabled, maintMessage.trim());
      onMaintenanceUpdated(res.maintenance);
      setNotice(res.maintenance.enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
      await onRefreshDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update maintenance mode.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded border border-[#10B981]/45 bg-[#10B981]/10 px-3 py-2 text-xs text-[#65F2B5]">
          {notice}
        </div>
      )}

      <form onSubmit={handleSaveConfig} className="space-y-4">
        <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
          <p className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <Bot className="h-4 w-4 text-[#00F0FF]" />
            ATLAS AI Configuration
          </p>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#E2E2EC]">
            <input
              type="checkbox"
              checked={cfg.aiEnabled}
              onChange={(e) => setCfg((c) => ({ ...c, aiEnabled: e.target.checked }))}
              className="h-4 w-4 accent-[#00F0FF]"
            />
            Enable ATLAS AI endpoints for authenticated users
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cfg-ai-model" className="mb-1 block font-mono text-[11px] uppercase text-[#9BA9AC]">
                Gemini Model
              </label>
              <select
                id="cfg-ai-model"
                value={cfg.aiModel}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    aiModel: e.target.value as OwnerAppConfig['aiModel'],
                  }))
                }
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Fast)</option>
                <option value="gemini-4-neon">gemini-4-neon (Balanced/Deep)</option>
              </select>
            </div>

            <div>
              <label htmlFor="cfg-ai-quota" className="mb-1 block font-mono text-[11px] uppercase text-[#9BA9AC]">
                Daily ATLAS Quota / User
              </label>
              <input
                id="cfg-ai-quota"
                type="number"
                min={1}
                max={500}
                value={cfg.dailyAtlasQuota}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    dailyAtlasQuota: Math.max(1, Math.min(500, Number(e.target.value) || 40)),
                  }))
                }
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cfg-ai-note" className="mb-1 block font-mono text-[11px] uppercase text-[#9BA9AC]">
              System Guidance Note (Optional)
            </label>
            <textarea
              id="cfg-ai-note"
              rows={2}
              maxLength={400}
              value={cfg.atlasSystemNote}
              onChange={(e) => setCfg((c) => ({ ...c, atlasSystemNote: e.target.value }))}
              placeholder="Optional guidance appended to ATLAS system prompt..."
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
            />
          </div>
        </div>

        <div className="rounded border border-white/10 bg-[#0C0E15] p-4 space-y-3">
          <p className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <Sliders className="h-4 w-4 text-[#00F0FF]" />
            Application Settings
          </p>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#E2E2EC]">
            <input
              type="checkbox"
              checked={cfg.registrationOpen}
              onChange={(e) => setCfg((c) => ({ ...c, registrationOpen: e.target.checked }))}
              className="h-4 w-4 accent-[#00F0FF]"
            />
            Allow new visitor registrations
          </label>

          <div className="max-w-xs">
            <label htmlFor="cfg-lb-thresh" className="mb-1 block font-mono text-[11px] uppercase text-[#9BA9AC]">
              Leaderboard Unlock Threshold (Users)
            </label>
            <input
              id="cfg-lb-thresh"
              type="number"
              min={2}
              max={1000}
              value={cfg.leaderboardThreshold}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  leaderboardThreshold: Math.max(2, Math.min(1000, Number(e.target.value) || 10)),
                }))
              }
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-[#00F0FF] px-4 py-2 font-display text-xs font-semibold text-[#08090C]"
        >
          {saving ? 'Saving...' : 'Save AI & App Settings'}
        </button>
      </form>

      {/* Maintenance Mode */}
      <div className="rounded border border-[#F59E0B]/30 bg-[#0C0E15] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-display text-sm font-semibold text-[#E2E2EC]">
            <Wrench className="h-4 w-4 text-[#FCD34D]" />
            Maintenance Mode
          </span>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs">
            <input
              type="checkbox"
              checked={maintEnabled}
              onChange={(e) => setMaintEnabled(e.target.checked)}
              className="h-4 w-4 accent-[#F59E0B]"
            />
            {maintEnabled ? 'Enabled' : 'Disabled'}
          </label>
        </div>

        <textarea
          rows={2}
          maxLength={300}
          value={maintMessage}
          onChange={(e) => setMaintMessage(e.target.value)}
          placeholder="Maintenance notice displayed to visitors..."
          className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2 text-xs text-[#E2E2EC]"
        />

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveMaintenance()}
          className="rounded border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-3.5 py-1.5 font-display text-xs font-semibold text-[#FCD34D]"
        >
          Save Maintenance Mode
        </button>
      </div>
    </div>
  );
};

interface ActivityTabProps {
  logs: OwnerActivityEntry[];
  unacknowledgedAlerts: number;
  onRefreshDashboard: () => Promise<void>;
}

export const OwnerActivityTab: React.FC<ActivityTabProps> = ({
  logs,
  unacknowledgedAlerts,
  onRefreshDashboard,
}) => {
  const handleAck = async () => {
    await api.ownerAcknowledgeAlerts();
    await onRefreshDashboard();
  };

  return (
    <div className="space-y-3">
      {unacknowledgedAlerts > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/30 px-3.5 py-2.5 text-xs text-[#FFDAD6]">
          <span>
            {unacknowledgedAlerts} unacknowledged security alert{unacknowledgedAlerts > 1 ? 's' : ''} detected.
          </span>
          <button
            type="button"
            onClick={() => void handleAck()}
            className="rounded border border-[#FFDAD6]/40 px-2.5 py-1 font-mono text-[11px] hover:bg-white/10"
          >
            Acknowledge Alerts
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="py-8 text-center text-xs text-[#9BA9AC]">No owner security events logged yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`rounded border px-3 py-2.5 text-xs ${
                log.suspicious && !log.acknowledged
                  ? 'border-[#FFB4AB]/45 bg-[#93000A]/20'
                  : 'border-white/10 bg-[#0C0E15]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#E2E2EC]">{log.event}</span>
                <span
                  className={`font-mono text-[10px] uppercase ${
                    log.outcome === 'success'
                      ? 'text-[#65F2B5]'
                      : log.outcome === 'alert'
                        ? 'text-[#FCD34D]'
                        : 'text-[#FFB4AB]'
                  }`}
                >
                  {log.outcome} · {log.ipMasked}
                </span>
              </div>
              <p className="mt-1 text-[#B9CACB]">{log.detail}</p>
              <p className="mt-1 font-mono text-[10px] text-[#849495]">
                {log.actorEmail} · {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
