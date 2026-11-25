import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, Sparkles, Upload } from 'lucide-react';
import { ApiError, api } from '../lib/apiClient';
import { STORAGE_KEY, validateAndNormalizeState } from '../lib/rpgEngine';
import type { AvatarId, LifeRpgState, Mission } from '../types/hud';
import { AVATAR_OPTIONS, AvatarBadge } from './AvatarBadge';

interface OnboardingWizardProps {
  state: LifeRpgState;
  onComplete: (nextState: LifeRpgState) => void;
}

function detectLegacyLocalMissions(fallback: LifeRpgState): Mission[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const res = validateAndNormalizeState(parsed, fallback, false);
    if (!res.valid || !res.state) return [];
    // Never migrate the old builder seed profile
    if (res.state.profile.name === 'Kaelen Vance') return [];
    return res.state.missions;
  } catch {
    return [];
  }
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  state,
  onComplete,
}) => {
  const [name, setName] = useState(state.profile.name || '');
  const [roleTitle, setRoleTitle] = useState(state.profile.roleTitle || 'Explorer');
  const [avatarId, setAvatarId] = useState<AvatarId>(state.profile.avatarId || 'cyan-hex');
  const [dailyMissionGoal, setDailyMissionGoal] = useState(state.preferences.dailyMissionGoal || 3);
  const [availableMinutesToday, setAvailableMinutesToday] = useState(
    state.preferences.availableMinutesToday || 60
  );
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(state.profile.leaderboardOptIn);
  const [migrateLegacy, setMigrateLegacy] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const legacyMissions = useMemo(() => detectLegacyLocalMissions(state), [state]);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your display name.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const profileRes = await api.updateProfile({
        name: name.trim(),
        roleTitle: roleTitle.trim() || 'Explorer',
        avatarId,
        leaderboardOptIn,
        onboardingCompleted: true,
        preferences: {
          dailyMissionGoal,
          availableMinutesToday,
        },
      });

      let finalState = profileRes.state;

      if (migrateLegacy && legacyMissions.length > 0) {
        const migRes = await api.migrateLocalMissions(legacyMissions);
        finalState = migRes.state;
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Ignore storage cleanup error
        }
      }

      onComplete(finalState);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to save setup. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hud-canvas-grid flex min-h-screen items-center justify-center px-4 py-10 text-[#E2E2EC]">
      <div className="hud-layer-2 w-full max-w-xl rounded-md border border-[#00F0FF]/25 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-[#00F0FF]">
          <Sparkles className="h-4 w-4" />
          <span className="font-mono text-xs uppercase tracking-wider">Quick Setup</span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-[#E2E2EC]">
          Personalize Your Workspace
        </h1>
        <p className="mt-1 text-sm text-[#B9CACB]">
          You are starting fresh at Level 1 with 0 XP. Set your profile and daily target below.
        </p>

        <form onSubmit={handleFinish} className="mt-6 space-y-5">
          {error && (
            <div className="rounded border border-[#FFB4AB]/45 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="onboard-name"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Display Name
              </label>
              <input
                id="onboard-name"
                type="text"
                maxLength={40}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="onboard-role"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Focus Title
              </label>
              <input
                id="onboard-role"
                type="text"
                maxLength={40}
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g., Builder, Student, Creator"
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Choose Your Avatar
            </span>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {AVATAR_OPTIONS.map((opt) => {
                const selected = avatarId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAvatarId(opt.id)}
                    className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded border p-2.5 transition-colors ${
                      selected
                        ? 'hud-nav-active border'
                        : 'border-white/10 bg-[#0C0E15] hover:border-white/25'
                    }`}
                  >
                    <AvatarBadge avatarId={opt.id} size="sm" />
                    <span className="w-full truncate text-center font-mono text-[11px] text-[#B9CACB]">
                      {opt.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="onboard-daily-goal"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Daily Mission Goal
              </label>
              <select
                id="onboard-daily-goal"
                value={dailyMissionGoal}
                onChange={(e) => setDailyMissionGoal(Number(e.target.value))}
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} mission{n > 1 ? 's' : ''} per day
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="onboard-time"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Typical Daily Focus Time
              </label>
              <select
                id="onboard-time"
                value={availableMinutesToday}
                onChange={(e) => setAvailableMinutesToday(Number(e.target.value))}
                className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>120 minutes</option>
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-xs text-[#E2E2EC]">
            <input
              type="checkbox"
              checked={leaderboardOptIn}
              onChange={(e) => setLeaderboardOptIn(e.target.checked)}
              className="h-4 w-4 accent-[#00F0FF]"
            />
            Show my display name, level, and XP on the global leaderboard when it unlocks
          </label>

          {legacyMissions.length > 0 && (
            <div className="rounded border border-[#10B981]/35 bg-[#10B981]/10 p-3.5">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-[#E2E2EC]">
                <input
                  type="checkbox"
                  checked={migrateLegacy}
                  onChange={(e) => setMigrateLegacy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#10B981]"
                />
                <span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#65F2B5]">
                    <Upload className="h-3.5 w-3.5" />
                    Import {legacyMissions.length} saved local mission{legacyMissions.length > 1 ? 's' : ''}
                  </span>
                  <span className="mt-0.5 block text-[#B9CACB]">
                    We found missions saved on this device from an earlier local session and can safely move them into your new cloud account.
                  </span>
                </span>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="hud-btn-primary flex min-h-[44px] w-full items-center justify-center gap-2 rounded px-5 py-2.5 font-display text-sm font-semibold disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Enter STRYDE
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
