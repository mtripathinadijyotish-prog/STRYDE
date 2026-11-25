import React, { useMemo, useState } from 'react';
import { Award, Lock, Search, Trophy, Users } from 'lucide-react';
import type { LeaderboardResponse } from '../types/hud';
import { AvatarBadge } from './AvatarBadge';
import { StatBar } from './StatBar';

interface LeaderboardScreenProps {
  data: LeaderboardResponse | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  data,
  loading,
  onRefresh,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter((e) => e.displayName.toLowerCase().includes(q));
  }, [data, searchQuery]);

  if (loading && !data) {
    return (
      <div className="hud-layer-1 rounded-md p-10 text-center font-mono text-xs text-[#B9CACB]">
        Loading leaderboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="hud-layer-1 rounded-md p-10 text-center">
        <p className="font-display text-base font-medium text-[#E2E2EC]">
          Could not load the leaderboard right now.
        </p>
        <p className="mt-1 text-xs text-[#9BA9AC]">
          Check your connection and try refreshing.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="hud-btn-primary mt-4 min-h-[40px] rounded px-4 py-2 font-display text-xs font-semibold"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Locked State (< 10 unique registered accounts)
  if (!data.unlocked) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <div className="hud-layer-2 rounded-md border border-[var(--hud-accent-border)] p-7 text-center sm:p-9">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] hud-accent-text">
            <Lock className="h-6 w-6" />
          </div>

          <h1 className="font-display text-xl font-bold tracking-wide text-[#E2E2EC]">
            THE LEADERBOARD IS ALMOST HERE!
          </h1>

          <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#B9CACB]">
            <p>We need 10 members to join before the global leaderboard unlocks.</p>
            <p className="font-mono text-base font-semibold hud-accent-text">
              Current members: {data.registeredCount}/{data.threshold}
            </p>
            <p className="text-[#E2E2EC]">Your journey starts now!</p>
          </div>

          <div className="mx-auto mt-6 max-w-xs">
            <StatBar
              value={data.registeredCount}
              max={data.threshold}
              variant="cyan"
              heightClass="h-2.5"
            />
          </div>

          <p className="mt-4 font-mono text-[11px] text-[#9BA9AC]">
            Updates live as new members create accounts.
          </p>
        </div>
      </div>
    );
  }

  // Unlocked State (>= 10 unique registered accounts)
  const topThree = data.entries.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#E2E2EC]">Global Leaderboard</h1>
          <p className="mt-1 text-sm text-[#B9CACB]">
            Ranked by total earned XP across {data.registeredCount} registered members.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!data.optedIn && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[36px] rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC] whitespace-nowrap"
            >
              You are hidden · Enable in Settings
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 font-mono text-xs hud-accent-text">
            <Users className="h-3.5 w-3.5" />
            {data.entries.length} visible
          </span>
        </div>
      </div>

      {/* User's Own Rank Card */}
      {data.myEntry && (
        <div className="hud-layer-2 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--hud-accent-border)] p-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold hud-accent-text">
              #{data.myRank}
            </span>
            <AvatarBadge avatarId={data.myEntry.avatarId} size="md" />
            <div>
              <p className="font-display text-sm font-semibold text-[#E2E2EC]">
                {data.myEntry.displayName}{' '}
                <span className="font-mono text-[11px] hud-accent-text">(You)</span>
              </p>
              <p className="font-mono text-xs text-[#9BA9AC]">
                Level {data.myEntry.level} · {data.myEntry.achievementsCount} achievements
              </p>
            </div>
          </div>
          <span className="font-mono text-base font-bold text-[#DBFCFF]">
            {data.myEntry.totalXp.toLocaleString()} XP
          </span>
        </div>
      )}

      {/* Top 3 Summary */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((entry) => (
            <div
              key={`${entry.rank}-${entry.displayName}`}
              className={`hud-layer-2 rounded-md border p-4 ${
                entry.rank === 1
                  ? 'border-[#F59E0B]/45'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1 font-mono text-xs font-bold ${
                    entry.rank === 1 ? 'text-[#FCD34D]' : 'hud-accent-text'
                  }`}
                >
                  <Trophy className="h-3.5 w-3.5" />
                  Rank #{entry.rank}
                </span>
                <span className="font-mono text-xs text-[#B9CACB]">Lv.{entry.level}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <AvatarBadge avatarId={entry.avatarId} size="sm" />
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-[#E2E2EC] truncate">
                    {entry.displayName}
                    {entry.isCurrentUser ? ' (You)' : ''}
                  </p>
                  <p className="font-mono text-xs hud-accent-text">
                    {entry.totalXp.toLocaleString()} XP
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Full Table */}
      <div className="hud-layer-1 rounded-md p-5">
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
          <input
            type="text"
            aria-label="Search leaderboard members"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find a member by name..."
            className="min-h-[40px] w-full rounded border border-white/12 bg-[#0C0E15] py-2 pl-9 pr-3 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
          />
        </div>

        {filteredEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9BA9AC]">
            No matching members found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 font-mono text-[11px] uppercase tracking-wider text-[#9BA9AC]">
                  <th className="py-2.5 pr-4">Rank</th>
                  <th className="py-2.5 pr-4">Member</th>
                  <th className="py-2.5 pr-4">Level</th>
                  <th className="py-2.5 pr-4">Achievements</th>
                  <th className="py-2.5 text-right">Total XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredEntries.map((entry, idx) => (
                  <tr
                    key={`${entry.rank}-${entry.displayName}-${idx}`}
                    className={
                      entry.isCurrentUser ? 'bg-[var(--hud-accent-soft)]' : 'hover:bg-white/[0.02]'
                    }
                  >
                    <td className="py-3 pr-4 font-mono text-xs font-bold hud-accent-text whitespace-nowrap">
                      #{entry.rank}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <AvatarBadge avatarId={entry.avatarId} size="sm" />
                        <span className="font-medium text-[#E2E2EC]">
                          {entry.displayName}
                          {entry.isCurrentUser && (
                            <span className="ml-1.5 font-mono text-[11px] hud-accent-text">
                              (You)
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-[#B9CACB] whitespace-nowrap">
                      Lv.{entry.level}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-[#FCD34D] whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" />
                        {entry.achievementsCount}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-xs font-semibold text-[#65F2B5] whitespace-nowrap">
                      {entry.totalXp.toLocaleString()} XP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
