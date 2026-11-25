import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Download,
  HelpCircle,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Save,
  ShieldAlert,
  Sliders,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { ApiError, api } from '../lib/apiClient';
import {
  computeWeeklyReport,
  getLocalDateKey,
  getPreviousLocalDateKey,
  validateAndNormalizeState,
} from '../lib/rpgEngine';
import {
  AvatarId,
  LifeRpgState,
  NotificationPreference,
  ThemeAccent,
  UserPreferences,
} from '../types/hud';
import { AVATAR_OPTIONS, AvatarBadge } from './AvatarBadge';
import { StatBar } from './StatBar';

interface DataVaultScreenProps {
  state: LifeRpgState;
  onUpdateProfile: (
    name: string,
    roleTitle: string,
    avatarId: AvatarId,
    leaderboardOptIn: boolean
  ) => void;
  onUpdatePreferences: (prefs: UserPreferences) => void;
  onImportState: (nextState: LifeRpgState) => void;
  onLogout: () => void;
  onAccountDeleted: () => void;
  onLaunchTutorial: () => void;
  onOpenLegal: (tab: 'privacy' | 'terms') => void;
  onOpenOwnerPortal: () => void;
}

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export const DataVaultScreen: React.FC<DataVaultScreenProps> = ({
  state,
  onUpdateProfile,
  onUpdatePreferences,
  onImportState,
  onLogout,
  onAccountDeleted,
  onLaunchTutorial,
  onOpenLegal,
  onOpenOwnerPortal,
}) => {
  const [nameInput, setNameInput] = useState(state.profile.name);
  const [roleInput, setRoleInput] = useState(state.profile.roleTitle);
  const [avatarId, setAvatarId] = useState<AvatarId>(state.profile.avatarId);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(state.profile.leaderboardOptIn);
  const [profileError, setProfileError] = useState('');

  const [prefsDraft, setPrefsDraft] = useState<UserPreferences>(state.preferences);
  const [chartRange, setChartRange] = useState<'weekly' | 'monthly'>('weekly');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Recovery key regeneration
  const [regenPw, setRegenPw] = useState('');
  const [regenKeyResult, setRegenKeyResult] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);

  // Account deletion
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Feedback form
  const [fbCategory, setFbCategory] = useState<'general' | 'bug' | 'feature'>('general');
  const [fbSubject, setFbSubject] = useState('');
  const [fbMessage, setFbMessage] = useState('');
  const [fbLoading, setFbLoading] = useState(false);
  const [fbSuccess, setFbSuccess] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // JSON Import
  const [importCandidate, setImportCandidate] = useState<LifeRpgState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameInput(state.profile.name);
    setRoleInput(state.profile.roleTitle);
    setAvatarId(state.profile.avatarId);
    setLeaderboardOptIn(state.profile.leaderboardOptIn);
  }, [
    state.profile.name,
    state.profile.roleTitle,
    state.profile.avatarId,
    state.profile.leaderboardOptIn,
  ]);

  useEffect(() => {
    setPrefsDraft(state.preferences);
  }, [state.preferences]);

  const weeklyReport = useMemo(() => computeWeeklyReport(state), [state]);

  const dailySummaryMap = useMemo(() => {
    const map = new Map<string, { xp: number; count: number }>();
    for (const h of state.completedHistory) {
      const prev = map.get(h.localDate);
      if (prev) {
        prev.xp += h.xpEarned;
        prev.count += 1;
      } else {
        map.set(h.localDate, { xp: h.xpEarned, count: 1 });
      }
    }
    return map;
  }, [state.completedHistory]);

  const chartSeries = useMemo(() => {
    const daysCount = chartRange === 'weekly' ? 7 : 30;
    const keys: string[] = [];
    let cursor = getLocalDateKey();
    for (let i = 0; i < daysCount; i++) {
      keys.unshift(cursor);
      cursor = getPreviousLocalDateKey(cursor);
    }

    return keys.map((dateKey) => {
      const summary = dailySummaryMap.get(dateKey);
      const parts = dateKey.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const label =
        chartRange === 'weekly'
          ? d.toLocaleDateString(undefined, { weekday: 'short' })
          : String(parts[2]);
      return {
        dateKey,
        label,
        xp: summary?.xp ?? 0,
        count: summary?.count ?? 0,
      };
    });
  }, [dailySummaryMap, chartRange]);

  const maxChartXp = Math.max(150, ...chartSeries.map((d) => d.xp));

  const handleSaveProfileAndPrefs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      setProfileError('Display name cannot be empty.');
      return;
    }
    setProfileError('');
    onUpdateProfile(
      nameInput.trim(),
      roleInput.trim() || 'Explorer',
      avatarId,
      leaderboardOptIn
    );
    onUpdatePreferences(prefsDraft);
    setSettingsSavedMsg(true);
    window.setTimeout(() => setSettingsSavedMsg(false), 3000);
  };

  const handleExportJson = async () => {
    let exportData = state;
    try {
      exportData = await api.exportAccount();
    } catch {
      // Fallback to local snapshot if offline
    }
    const payload = JSON.stringify(exportData, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stryde-backup-${getLocalDateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImportError(null);
    setImportCandidate(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportError('Backup file exceeds the 5 MB limit.');
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ''));
        const result = validateAndNormalizeState(parsed, state, true);
        if (!result.valid || !result.state) {
          setImportError(result.errors.join(' ') || 'Invalid backup format.');
          return;
        }
        setImportCandidate(result.state);
      } catch {
        setImportError('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleRegenKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegenError(null);
    setRegenKeyResult(null);
    if (!regenPw) {
      setRegenError('Enter your current password to generate a new recovery key.');
      return;
    }
    setRegenLoading(true);
    try {
      const res = await api.regenerateRecoveryKey(regenPw);
      setRegenKeyResult(res.recoveryKey);
      setRegenPw('');
    } catch (err) {
      setRegenError(err instanceof ApiError ? err.message : 'Unable to regenerate key.');
    } finally {
      setRegenLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    if (!deletePw) {
      setDeleteError('Enter your password to confirm deletion.');
      return;
    }
    setDeleteLoading(true);
    try {
      await api.deleteAccount(deletePw);
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFbError(null);
    setFbSuccess(null);
    if (!fbSubject.trim() || fbMessage.trim().length < 5) {
      setFbError('Please provide a subject and a brief message.');
      return;
    }
    setFbLoading(true);
    try {
      const res = await api.submitFeedback({
        category: fbCategory,
        subject: fbSubject.trim(),
        message: fbMessage.trim(),
      });
      setFbSuccess(res.message);
      setFbSubject('');
      setFbMessage('');
    } catch (err) {
      setFbError(err instanceof ApiError ? err.message : 'Could not send feedback right now.');
    } finally {
      setFbLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#E2E2EC]">
            Settings &amp; Insights
          </h1>
          <p className="mt-1 text-sm text-[#B9CACB]">
            Manage your account, weekly summary, backups, and feedback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLaunchTutorial}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap"
          >
            <HelpCircle className="h-3.5 w-3.5 hud-accent-text" />
            Quick Tour
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#E2E2EC] hover:border-[#FFB4AB]/50 hover:text-[#FFB4AB] whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log Out
          </button>
        </div>
      </div>

      {/* Section 1: Weekly Summary & Progress Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="hud-layer-2 rounded-md border border-white/12 p-5 lg:col-span-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 hud-accent-text" />
              <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
                Weekly Summary
              </h2>
            </div>
            <span className="font-mono text-xs hud-accent-text">
              {weeklyReport.xpEarned}/{weeklyReport.xpGoal} XP
            </span>
          </div>
          <p className="text-xs text-[#B9CACB]">
            {weeklyReport.completedCount} completed · {weeklyReport.pendingCount} pending this week
          </p>
          <div className="mt-3">
            <StatBar
              value={weeklyReport.xpEarned}
              max={Math.max(1, weeklyReport.xpGoal)}
              variant={state.preferences.themeAccent}
              heightClass="h-2"
            />
          </div>
          <div className="mt-4 space-y-2">
            {weeklyReport.suggestions.slice(0, 2).map((tip, i) => (
              <p key={i} className="rounded border border-white/[0.07] bg-[#0C0E15] p-2.5 text-xs text-[#B9CACB]">
                {tip}
              </p>
            ))}
          </div>
        </section>

        <section className="hud-layer-2 rounded-md border border-white/12 p-5 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
                Activity Chart
              </h2>
              <p className="font-mono text-xs hud-accent-text">
                {chartSeries.reduce((s, d) => s + d.xp, 0).toLocaleString()} XP ·{' '}
                {chartSeries.reduce((s, d) => s + d.count, 0)} completions
              </p>
            </div>
            <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
              <button
                type="button"
                onClick={() => setChartRange('weekly')}
                className={`min-h-[32px] rounded-sm px-2.5 py-1 font-mono text-xs whitespace-nowrap ${
                  chartRange === 'weekly'
                    ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                    : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setChartRange('monthly')}
                className={`min-h-[32px] rounded-sm px-2.5 py-1 font-mono text-xs whitespace-nowrap ${
                  chartRange === 'monthly'
                    ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                    : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          <div
            className={`grid h-36 items-end pt-2 ${
              chartRange === 'weekly' ? 'grid-cols-7 gap-3' : 'grid-cols-[repeat(30,minmax(0,1fr))] gap-1'
            }`}
          >
            {chartSeries.map((day) => {
              const heightPct = Math.max(6, Math.round((day.xp / maxChartXp) * 100));
              return (
                <div key={day.dateKey} className="flex h-full flex-col items-center justify-end gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-sm bg-[var(--hud-accent)] opacity-75"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.dateKey}: ${day.xp} XP (${day.count})`}
                    />
                  </div>
                  {(chartRange === 'weekly' || Number(day.label) % 5 === 0) && (
                    <span className="font-mono text-[10px] text-[#9BA9AC]">{day.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Section 2: Account & Preferences */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="hud-layer-1 rounded-md p-5 lg:col-span-6">
          <div className="mb-4 flex items-center gap-2">
            <Sliders className="h-4 w-4 hud-accent-text" />
            <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
              Profile &amp; Preferences
            </h2>
          </div>

          <form onSubmit={handleSaveProfileAndPrefs} className="space-y-4">
            {profileError && (
              <div className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/40 px-3 py-2 text-xs text-[#FFDAD6]">
                {profileError}
              </div>
            )}

            <div>
              <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
                Avatar
              </span>
              <div className="grid grid-cols-6 gap-2">
                {AVATAR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-label={opt.label}
                    aria-pressed={avatarId === opt.id}
                    onClick={() => setAvatarId(opt.id)}
                    className={`flex min-h-[44px] items-center justify-center rounded border p-1.5 transition-colors ${
                      avatarId === opt.id
                        ? 'hud-nav-active border'
                        : 'border-white/10 bg-[#0C0E15] hover:border-white/25'
                    }`}
                  >
                    <AvatarBadge avatarId={opt.id} size="sm" />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="profile-name"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Display Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  maxLength={40}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-role"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Focus Title
                </label>
                <input
                  id="profile-role"
                  type="text"
                  maxLength={40}
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                />
              </div>

              <div>
                <label
                  htmlFor="pref-accent"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Accent Color
                </label>
                <select
                  id="pref-accent"
                  value={prefsDraft.themeAccent}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({ ...p, themeAccent: e.target.value as ThemeAccent }))
                  }
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                >
                  <option value="cyan">Cyan</option>
                  <option value="violet">Violet</option>
                  <option value="emerald">Emerald</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pref-notifications"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Notifications
                </label>
                <select
                  id="pref-notifications"
                  value={prefsDraft.notifications}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({
                      ...p,
                      notifications: e.target.value as NotificationPreference,
                    }))
                  }
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                >
                  <option value="all">All Updates</option>
                  <option value="important">Important Only</option>
                  <option value="muted">Muted</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="goal-daily-missions"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Daily Mission Goal
                </label>
                <input
                  id="goal-daily-missions"
                  type="number"
                  min={1}
                  max={20}
                  value={prefsDraft.dailyMissionGoal}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({
                      ...p,
                      dailyMissionGoal: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                    }))
                  }
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 font-mono text-sm text-[#E2E2EC]"
                />
              </div>

              <div>
                <label
                  htmlFor="goal-weekly-xp"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Weekly XP Goal
                </label>
                <input
                  id="goal-weekly-xp"
                  type="number"
                  min={100}
                  max={10000}
                  step={50}
                  value={prefsDraft.weeklyXpGoal}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({
                      ...p,
                      weeklyXpGoal: Math.max(100, Math.min(10000, Number(e.target.value) || 100)),
                    }))
                  }
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 font-mono text-sm text-[#E2E2EC]"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs text-[#E2E2EC]">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={leaderboardOptIn}
                  onChange={(e) => setLeaderboardOptIn(e.target.checked)}
                  className="h-4 w-4 accent-[#00F0FF]"
                />
                Show my profile on the global leaderboard
              </label>

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefsDraft.celebrationsEnabled}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({ ...p, celebrationsEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#00F0FF]"
                />
                Show celebration popups on level-ups
              </label>

              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={prefsDraft.voiceRepliesEnabled}
                  onChange={(e) =>
                    setPrefsDraft((p) => ({ ...p, voiceRepliesEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#00F0FF]"
                />
                Read ATLAS replies aloud automatically
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="hud-btn-primary inline-flex min-h-[40px] items-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold whitespace-nowrap"
              >
                <Save className="h-4 w-4" />
                Save Settings
              </button>
              {settingsSavedMsg && (
                <span role="status" className="font-mono text-xs text-[#65F2B5]">
                  Settings saved
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Section 3: Backup, Security & Feedback */}
        <div className="space-y-6 lg:col-span-6">
          {/* Private Feedback & Bug Report */}
          <section className="hud-layer-1 rounded-md p-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 hud-accent-text" />
              <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
                Send Feedback or Report a Bug
              </h2>
            </div>

            <form onSubmit={handleSendFeedback} className="space-y-3">
              {fbError && (
                <p className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
                  {fbError}
                </p>
              )}
              {fbSuccess && (
                <p className="rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 text-xs text-[#65F2B5]">
                  {fbSuccess}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <select
                  aria-label="Feedback category"
                  value={fbCategory}
                  onChange={(e) => setFbCategory(e.target.value as 'general' | 'bug' | 'feature')}
                  className="min-h-[38px] rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-xs text-[#E2E2EC]"
                >
                  <option value="general">General</option>
                  <option value="bug">Bug Report</option>
                  <option value="feature">Suggestion</option>
                </select>
                <input
                  type="text"
                  maxLength={100}
                  value={fbSubject}
                  onChange={(e) => setFbSubject(e.target.value)}
                  placeholder="Subject"
                  className="min-h-[38px] sm:col-span-2 rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-xs text-[#E2E2EC] placeholder:text-[#9BA9AC]"
                />
              </div>

              <textarea
                rows={2}
                maxLength={1500}
                value={fbMessage}
                onChange={(e) => setFbMessage(e.target.value)}
                placeholder="Tell us what works well or what we can fix..."
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-xs text-[#E2E2EC] placeholder:text-[#9BA9AC]"
              />

              <button
                type="submit"
                disabled={fbLoading}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] px-3.5 py-1.5 font-display text-xs font-semibold text-[var(--hud-accent-text)] whitespace-nowrap"
              >
                {fbLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Send Private Feedback
              </button>
            </form>
          </section>

          {/* Export / Import & Recovery Key */}
          <section className="hud-layer-1 rounded-md p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
              Your Data &amp; Account Security
            </h2>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleExportJson()}
                className="hud-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3.5 py-2 font-display text-xs font-semibold whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                Export My Data (JSON)
              </button>

              <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-display text-xs font-medium text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap">
                <Upload className="h-3.5 w-3.5" />
                Import Missions JSON
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            </div>

            {importError && (
              <p className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
                {importError}
              </p>
            )}

            {importCandidate && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#10B981]/40 bg-[#10B981]/10 p-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[#E2E2EC]">
                  <CheckCircle2 className="h-4 w-4 text-[#65F2B5]" />
                  Ready to import {importCandidate.missions.length} missions from {importFileName}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportCandidate(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="rounded border border-white/15 px-2.5 py-1 text-[#B9CACB]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onImportState(importCandidate);
                      setImportCandidate(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="rounded bg-[#10B981] px-2.5 py-1 font-semibold text-[#002113]"
                  >
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* Regenerate Recovery Key */}
            <form onSubmit={handleRegenKey} className="border-t border-white/[0.06] pt-3 space-y-2">
              <p className="inline-flex items-center gap-1.5 font-mono text-xs text-[#B9CACB]">
                <KeyRound className="h-3.5 w-3.5 hud-accent-text" />
                Generate a New Recovery Key
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={regenPw}
                  onChange={(e) => setRegenPw(e.target.value)}
                  placeholder="Confirm password"
                  aria-label="Confirm current password to rotate recovery key"
                  className="min-h-[38px] flex-1 rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 text-xs text-[#E2E2EC] placeholder:text-[#9BA9AC]"
                />
                <button
                  type="submit"
                  disabled={regenLoading}
                  className="min-h-[38px] rounded border border-white/15 bg-[#131622] px-3 py-1.5 font-mono text-xs text-[#E2E2EC] whitespace-nowrap"
                >
                  {regenLoading ? 'Working...' : 'Rotate Key'}
                </button>
              </div>
              {regenError && <p className="text-xs text-[#FFB4AB]">{regenError}</p>}
              {regenKeyResult && (
                <p className="rounded bg-[#0C0E15] p-2 font-mono text-xs text-[#65F2B5] break-all">
                  New Recovery Key: {regenKeyResult}
                </p>
              )}
            </form>

            {/* Delete Account */}
            <div className="border-t border-white/[0.06] pt-3">
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 text-xs text-[#FFB4AB] hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete My Account
                </button>
              ) : (
                <form onSubmit={handleDeleteAccount} className="space-y-2 rounded border border-[#FFB4AB]/35 bg-[#93000A]/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[#FFB4AB]">
                    <AlertCircle className="h-4 w-4" />
                    This permanently deletes your account and all data.
                  </p>
                  <input
                    type="password"
                    value={deletePw}
                    onChange={(e) => setDeletePw(e.target.value)}
                    placeholder="Enter password to confirm"
                    aria-label="Confirm password for permanent deletion"
                    className="min-h-[38px] w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 text-xs text-[#E2E2EC] placeholder:text-[#9BA9AC]"
                  />
                  {deleteError && <p className="text-xs text-[#FFDAD6]">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteOpen(false);
                        setDeletePw('');
                        setDeleteError(null);
                      }}
                      className="min-h-[36px] rounded border border-white/15 px-3 py-1 text-xs text-[#B9CACB]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={deleteLoading}
                      className="min-h-[36px] rounded bg-[#93000A] px-3 py-1 text-xs font-semibold text-[#FFDAD6]"
                    >
                      {deleteLoading ? 'Deleting...' : 'Permanently Delete'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-xs text-[#9BA9AC]">
              <div className="flex gap-4">
                <button type="button" onClick={() => onOpenLegal('privacy')} className="min-h-[36px] hover:text-[#E2E2EC]">
                  Privacy Policy
                </button>
                <button type="button" onClick={() => onOpenLegal('terms')} className="min-h-[36px] hover:text-[#E2E2EC]">
                  Terms of Service
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenOwnerPortal}
                className="inline-flex min-h-[36px] items-center gap-1 hover:text-[#E2E2EC]"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Owner Portal
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
