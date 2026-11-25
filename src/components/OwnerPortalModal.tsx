import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  Loader2,
  LogOut,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Users,
  X,
} from 'lucide-react';
import {
  ApiError,
  api,
  setOwnerToken,
  type OwnerAdminProfile,
  type OwnerDashboardPayload,
} from '../lib/apiClient';
import type { MaintenanceStatus } from '../types/hud';
import { OwnerAuthPanel } from './owner/OwnerAuthPanel';
import { OwnerSecurityTab } from './owner/OwnerSecurityTab';
import {
  OwnerActivityTab,
  OwnerConfigTab,
  OwnerUsersTab,
} from './owner/OwnerAdminManagementTabs';

interface OwnerPortalModalProps {
  open: boolean;
  onClose: () => void;
  onMaintenanceUpdated: (m: MaintenanceStatus) => void;
}

type PortalTab = 'overview' | 'users' | 'config' | 'security' | 'activity' | 'feedback';

export const OwnerPortalModal: React.FC<OwnerPortalModalProps> = ({
  open,
  onClose,
  onMaintenanceUpdated,
}) => {
  const [ownerStatus, setOwnerStatus] = useState<{
    configured: boolean;
    mode: 'env' | 'claimed' | 'unclaimed';
    hasPasskeys: boolean;
    prefillEmail?: string;
  }>({ configured: true, mode: 'claimed', hasPasskeys: false });

  const [dashboard, setDashboard] = useState<OwnerDashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [probingSession, setProbingSession] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const [initialVerifyNotice, setInitialVerifyNotice] = useState<string | null>(null);
  const [initialRecoveryKey, setInitialRecoveryKey] = useState<string | null>(null);

  const [tab, setTab] = useState<PortalTab>('overview');

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await api.ownerDashboard();
      setDashboard(data);
      setSessionNotice(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setOwnerToken(null);
        setDashboard(null);
        if (err.sessionExpired) {
          setSessionNotice(err.message);
        }
      }
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSessionNotice(null);

    api
      .ownerStatus()
      .then((s) => setOwnerStatus(s))
      .catch(() => {});

    setProbingSession(true);
    api
      .ownerMe()
      .then(async (me) => {
        if (me.token) setOwnerToken(me.token);
        await loadDashboard();
      })
      .catch((err) => {
        setOwnerToken(null);
        setDashboard(null);
        if (err instanceof ApiError && err.sessionExpired) {
          setSessionNotice(err.message);
        }
      })
      .finally(() => setProbingSession(false));
  }, [open, loadDashboard]);

  if (!open) return null;

  const handleAuthenticated = (
    _admin: OwnerAdminProfile,
    verifyNotice?: string | null,
    recoveryKey?: string | null
  ) => {
    if (verifyNotice) setInitialVerifyNotice(verifyNotice);
    if (recoveryKey) setInitialRecoveryKey(recoveryKey);
    if (verifyNotice || recoveryKey) {
      setTab('security');
    } else {
      setTab('overview');
    }
    void api.ownerStatus().then((s) => setOwnerStatus(s)).catch(() => {});
    void loadDashboard();
  };

  const handleOwnerLogout = async () => {
    try {
      await api.ownerLogout();
    } catch {
      // Ignore
    }
    setOwnerToken(null);
    setDashboard(null);
    setInitialVerifyNotice(null);
    setInitialRecoveryKey(null);
    onClose();
  };

  const handleToggleFeedback = async (id: string) => {
    try {
      await api.ownerToggleFeedbackStatus(id);
      await loadDashboard();
    } catch {
      // Ignore transient error
    }
  };

  const maxTrend = dashboard
    ? Math.max(1, ...dashboard.registrationTrend.map((d) => d.count))
    : 1;

  const navItems: Array<{
    id: PortalTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'users', label: 'Users & Admins', icon: Users },
    { id: 'config', label: 'AI & Settings', icon: Sliders },
    { id: 'security', label: 'Security & Passkeys', icon: ShieldCheck },
    {
      id: 'activity',
      label: 'Activity & Alerts',
      icon: Bell,
      badge: dashboard?.unacknowledgedAlerts || undefined,
    },
    {
      id: 'feedback',
      label: 'Feedback & Health',
      icon: MessageSquare,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-portal-title"
    >
      <div className="hud-layer-3 relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-[#FCD34D] shrink-0" />
            <div>
              <h2 id="owner-portal-title" className="font-display text-base sm:text-lg font-semibold text-[#E2E2EC]">
                STRYDE Owner &amp; Administrator Portal
              </h2>
              <p className="font-mono text-[11px] text-[#9BA9AC]">
                {dashboard
                  ? `${dashboard.admin.displayName} (${dashboard.admin.role === 'primary' ? 'Primary Owner' : 'Admin'}) · ${dashboard.admin.email}`
                  : 'Restricted administrative authentication · Separate from standard member accounts'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dashboard && (
              <button
                type="button"
                onClick={handleOwnerLogout}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-2.5 py-1.5 font-mono text-xs text-[#B9CACB] hover:text-[#FFB4AB]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-[#9BA9AC] hover:bg-white/5 hover:text-[#E2E2EC]"
              aria-label="Close owner portal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {probingSession && !dashboard ? (
            <div className="flex items-center justify-center gap-2 py-14 font-mono text-xs text-[#9BA9AC]">
              <Loader2 className="h-4 w-4 animate-spin text-[#00F0FF]" />
              Verifying administrator session...
            </div>
          ) : !dashboard ? (
            <OwnerAuthPanel
              ownerMode={ownerStatus.mode}
              hasPasskeys={ownerStatus.hasPasskeys}
              prefillEmail={ownerStatus.prefillEmail}
              initialSessionNotice={sessionNotice}
              onAuthenticated={handleAuthenticated}
            />
          ) : (
            <div className="space-y-5">
              {/* Sub-navigation */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.08] pb-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`inline-flex min-h-[34px] items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-xs transition-colors ${
                        active
                          ? 'bg-[#00F0FF]/15 text-[#DBFCFF] border border-[#00F0FF]/35'
                          : 'text-[#9BA9AC] hover:text-[#E2E2EC] border border-transparent'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                      {item.badge ? (
                        <span className="rounded-full bg-[#93000A] px-1.5 py-0.5 text-[10px] font-bold text-[#FFDAD6]">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {dashLoading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-[#00F0FF]" />}
              </div>

              {dashboard.unacknowledgedAlerts > 0 && tab !== 'activity' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#FFB4AB]/45 bg-[#93000A]/25 px-3.5 py-2 text-xs text-[#FFDAD6]">
                  <span>
                    Security Notice: {dashboard.unacknowledgedAlerts} suspicious login or security alert
                    {dashboard.unacknowledgedAlerts > 1 ? 's' : ''} awaiting review.
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab('activity')}
                    className="font-mono text-[11px] underline"
                  >
                    Review Alerts
                  </button>
                </div>
              )}

              {tab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="font-mono text-[10px] uppercase text-[#9BA9AC]">Members</span>
                      <p className="mt-1 font-mono text-xl font-bold text-[#00F0FF]">
                        {dashboard.totalRegisteredUsers}
                      </p>
                      <p className="font-mono text-[10px] text-[#849495]">
                        {dashboard.suspendedUsersCount} suspended
                      </p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="font-mono text-[10px] uppercase text-[#9BA9AC]">Active 24h / 7d</span>
                      <p className="mt-1 font-mono text-xl font-bold text-[#65F2B5]">
                        {dashboard.activeUsers24h} / {dashboard.activeUsers7d}
                      </p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="font-mono text-[10px] uppercase text-[#9BA9AC]">Security Posture</span>
                      <p className="mt-1 font-mono text-xs font-semibold text-[#E2E2EC]">
                        {dashboard.admin.totpEnabled ? 'MFA On' : 'MFA Off'} ·{' '}
                        {dashboard.admin.passkeys.length} Passkey{dashboard.admin.passkeys.length === 1 ? '' : 's'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#849495]">
                        {dashboard.activeOwnerSessions} active session(s)
                      </p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="font-mono text-[10px] uppercase text-[#9BA9AC]">ATLAS AI &amp; RAM</span>
                      <p className="mt-1 font-mono text-xs font-semibold text-[#E2E2EC]">
                        {dashboard.appConfig.aiEnabled ? dashboard.appConfig.aiModel : 'Paused'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#849495]">
                        {dashboard.health.memoryMb} MB ·{' '}
                        {dashboard.health.geminiConfigured ? 'Key Ready' : 'No API Key'}
                      </p>
                    </div>
                  </div>

                  {/* 7-day registrations */}
                  <div className="rounded border border-white/10 bg-[#0C0E15] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                      <span className="text-[#B9CACB]">7-Day Member Signups</span>
                      <span className="text-[#9BA9AC]">
                        {dashboard.usageStats.totalMissions} missions ·{' '}
                        {dashboard.usageStats.totalCompletedMissions} clears ·{' '}
                        {dashboard.usageStats.totalFocusMinutes}m focus
                      </span>
                    </div>
                    <div className="grid h-24 grid-cols-7 items-end gap-2">
                      {dashboard.registrationTrend.map((d) => (
                        <div key={d.date} className="flex h-full flex-col items-center justify-end gap-1">
                          <span className="font-mono text-[10px] text-[#00F0FF]">{d.count}</span>
                          <div
                            className="w-full rounded-t bg-[#00F0FF]/55"
                            style={{ height: `${Math.max(8, Math.round((d.count / maxTrend) * 100))}%` }}
                          />
                          <span className="font-mono text-[9px] text-[#9BA9AC]">{d.date.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'users' && (
                <OwnerUsersTab
                  currentAdmin={dashboard.admin}
                  admins={dashboard.admins}
                  onRefreshDashboard={loadDashboard}
                />
              )}

              {tab === 'config' && (
                <OwnerConfigTab
                  appConfig={dashboard.appConfig}
                  maintenance={dashboard.maintenance}
                  onMaintenanceUpdated={onMaintenanceUpdated}
                  onRefreshDashboard={loadDashboard}
                />
              )}

              {tab === 'security' && (
                <OwnerSecurityTab
                  admin={dashboard.admin}
                  recentReauthValid={dashboard.recentReauthValid}
                  idleMinutes={dashboard.appConfig.ownerSessionIdleMinutes}
                  initialVerificationNotice={initialVerifyNotice}
                  initialRecoveryKey={initialRecoveryKey}
                  onRefreshDashboard={loadDashboard}
                  onSignedOut={() => {
                    setOwnerToken(null);
                    setDashboard(null);
                  }}
                />
              )}

              {tab === 'activity' && (
                <OwnerActivityTab
                  logs={dashboard.activityLogs}
                  unacknowledgedAlerts={dashboard.unacknowledgedAlerts}
                  onRefreshDashboard={loadDashboard}
                />
              )}

              {tab === 'feedback' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="text-[10px] text-[#9BA9AC]">STATUS</span>
                      <p className="mt-1 font-semibold text-[#65F2B5]">{dashboard.health.status}</p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="text-[10px] text-[#9BA9AC]">UPTIME</span>
                      <p className="mt-1 font-semibold text-[#E2E2EC]">
                        {Math.floor(dashboard.health.uptimeSeconds / 60)}m
                      </p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="text-[10px] text-[#9BA9AC]">MEMORY</span>
                      <p className="mt-1 font-semibold text-[#E2E2EC]">{dashboard.health.memoryMb} MB</p>
                    </div>
                    <div className="rounded border border-white/10 bg-[#0C0E15] p-3">
                      <span className="text-[10px] text-[#9BA9AC]">ACTIVE SESSIONS</span>
                      <p className="mt-1 font-semibold text-[#E2E2EC]">
                        {dashboard.health.activeSessionsTotal}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                      User Feedback ({dashboard.feedback.length})
                    </h3>
                    {dashboard.feedback.length === 0 ? (
                      <p className="rounded border border-white/10 bg-[#0C0E15] py-5 text-center text-xs text-[#9BA9AC]">
                        No feedback submissions yet.
                      </p>
                    ) : (
                      dashboard.feedback.map((fb) => (
                        <div key={fb.id} className="rounded border border-white/10 bg-[#0C0E15] p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00F0FF]">
                                {fb.category}
                              </span>
                              <span className="font-display text-sm font-semibold text-[#E2E2EC]">
                                {fb.subject}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleToggleFeedback(fb.id)}
                              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                                fb.status === 'reviewed'
                                  ? 'border-[#10B981]/40 text-[#65F2B5]'
                                  : 'border-[#F59E0B]/40 text-[#FCD34D]'
                              }`}
                            >
                              {fb.status === 'reviewed' ? 'Reviewed' : 'Mark Reviewed'}
                            </button>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#B9CACB]">{fb.message}</p>
                          <p className="mt-1.5 font-mono text-[10px] text-[#849495]">
                            {new Date(fb.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                      Server Error Log ({dashboard.errorLog.length})
                    </h3>
                    {dashboard.errorLog.length === 0 ? (
                      <p className="rounded border border-white/10 bg-[#0C0E15] py-5 text-center text-xs text-[#9BA9AC]">
                        No recent server errors logged.
                      </p>
                    ) : (
                      dashboard.errorLog.map((err) => (
                        <div
                          key={err.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-[#0C0E15] px-3 py-2 font-mono text-xs"
                        >
                          <span className="inline-flex items-center gap-1.5 text-[#FFB4AB]">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            [{err.statusCode}] {err.route}: {err.message}
                          </span>
                          <span className="text-[10px] text-[#849495]">
                            {new Date(err.timestamp).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
