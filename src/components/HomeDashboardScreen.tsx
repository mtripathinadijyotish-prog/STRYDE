import React, { useMemo, useState } from 'react';
import {
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { ApiError, api } from '../lib/apiClient';
import {
  generateLocalDailyBriefing,
  generateSmartSchedule,
  getLocalDateKey,
} from '../lib/rpgEngine';
import {
  LifeRpgState,
  Mission,
  MissionDifficulty,
  MissionFrequency,
  SkillCategory,
} from '../types/hud';
import { AvatarBadge } from './AvatarBadge';
import { FocusTimer } from './FocusTimer';
import { MissionCard } from './MissionCard';
import { StatBar } from './StatBar';

export interface StarterMissionPreset {
  title: string;
  description: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  frequency: MissionFrequency;
  deadline: string;
}

export const STARTER_PRESETS: StarterMissionPreset[] = [
  {
    title: '20-Minute Focused Session',
    description: 'Pick one meaningful task and work uninterrupted for 20 minutes.',
    category: SkillCategory.Discipline,
    difficulty: MissionDifficulty.Easy,
    frequency: MissionFrequency.Daily,
    deadline: 'Today',
  },
  {
    title: 'Learn or Read for 15 Minutes',
    description: 'Read 10 pages, watch a lesson, or take notes on a topic you care about.',
    category: SkillCategory.Intelligence,
    difficulty: MissionDifficulty.Easy,
    frequency: MissionFrequency.Daily,
    deadline: 'Today',
  },
  {
    title: '15-Minute Walk or Stretch',
    description: 'Step away from the screen for light movement and fresh air.',
    category: SkillCategory.Fitness,
    difficulty: MissionDifficulty.Easy,
    frequency: MissionFrequency.Daily,
    deadline: 'Today',
  },
];

interface HomeDashboardScreenProps {
  state: LifeRpgState;
  isOnline: boolean;
  onToggleMission: (missionId: string) => void;
  onToggleSubObjective: (missionId: string, subId: string) => void;
  onOpenNewMission: () => void;
  onQuickAddMission?: (preset: StarterMissionPreset) => void;
  onEditMission: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onSelectFocusDuration: (minutes: number) => void;
  onCompleteFocusSession: (minutes: number) => void;
  onUpdateAvailableMinutes: (minutes: number) => void;
  onApproveBriefing: (focusMinutes: number, headline: string) => void;
  onApproveSchedule: (
    blocks: Array<{ missionId: string; startLabel: string; endLabel: string }>,
    focusMinutes: number
  ) => void;
  onNavigateJarvis: () => void;
  onEditProfile: () => void;
}

const TIME_OPTIONS = [30, 60, 90, 120, 240];

export const HomeDashboardScreen: React.FC<HomeDashboardScreenProps> = ({
  state,
  isOnline,
  onToggleMission,
  onToggleSubObjective,
  onOpenNewMission,
  onQuickAddMission,
  onEditMission,
  onDeleteMission,
  onSelectFocusDuration,
  onCompleteFocusSession,
  onUpdateAvailableMinutes,
  onApproveBriefing,
  onApproveSchedule,
  onNavigateJarvis,
  onEditProfile,
}) => {
  const [filterTab, setFilterTab] = useState<'today' | 'open' | 'done'>('today');
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandMode, setCommandMode] = useState<'briefing' | 'schedule'>('briefing');
  const [scheduleStart, setScheduleStart] = useState<'now' | '09:00' | '13:00' | '18:00'>('now');

  const [aiBriefingLoading, setAiBriefingLoading] = useState(false);
  const [aiBriefingError, setAiBriefingError] = useState<string | null>(null);
  const [aiBriefingResult, setAiBriefingResult] = useState<{
    headline: string;
    priorities: Array<{ title: string; reason: string; estimatedMinutes: number }>;
    suggestedFocusMinutes: number;
    encouragement: string;
  } | null>(null);
  const [customFocusOverride, setCustomFocusOverride] = useState<number | null>(null);

  const todayKey = getLocalDateKey();

  const todaysMissions = useMemo(() => {
    return state.missions.filter((m) => {
      if (m.frequency === MissionFrequency.Daily) return true;
      if (!m.completed) return true;
      return m.completedAt ? getLocalDateKey(new Date(m.completedAt)) === todayKey : false;
    });
  }, [state.missions, todayKey]);

  const todayCompletedCount = useMemo(
    () => todaysMissions.filter((m) => m.completed).length,
    [todaysMissions]
  );

  const localBriefing = useMemo(
    () => generateLocalDailyBriefing(state, state.preferences.availableMinutesToday),
    [state]
  );

  const smartSchedule = useMemo(
    () =>
      generateSmartSchedule(
        state,
        state.preferences.availableMinutesToday,
        scheduleStart
      ),
    [state, scheduleStart]
  );

  const activeBriefing = useMemo(() => {
    if (aiBriefingResult) {
      return {
        headline: aiBriefingResult.headline,
        items: aiBriefingResult.priorities.map((p, idx) => ({
          id: `ai-p-${idx}`,
          title: p.title,
          reason: p.reason,
          estimatedMinutes: p.estimatedMinutes,
        })),
        suggestedFocusMinutes: customFocusOverride ?? aiBriefingResult.suggestedFocusMinutes,
        encouragement: aiBriefingResult.encouragement,
        isAi: true,
      };
    }
    return {
      headline: localBriefing.headline,
      items: localBriefing.recommendedMissions.map((m) => ({
        id: m.missionId,
        title: m.title,
        reason: m.reason,
        estimatedMinutes: m.estimatedMinutes,
      })),
      suggestedFocusMinutes: customFocusOverride ?? localBriefing.suggestedFocusMinutes,
      encouragement: localBriefing.encouragement,
      isAi: false,
    };
  }, [aiBriefingResult, localBriefing, customFocusOverride]);

  const handleGenerateAiBriefing = async () => {
    if (!isOnline || aiBriefingLoading) return;
    setAiBriefingLoading(true);
    setAiBriefingError(null);
    try {
      const data = await api.atlasBriefing(state.preferences.availableMinutesToday);
      setAiBriefingResult(data);
      setCustomFocusOverride(null);
    } catch (err) {
      setAiBriefingError(
        err instanceof ApiError ? err.message : 'Unable to generate AI briefing right now.'
      );
    } finally {
      setAiBriefingLoading(false);
    }
  };

  const displayedMissions = useMemo(() => {
    if (filterTab === 'today') return todaysMissions;
    if (filterTab === 'open') return state.missions.filter((m) => !m.completed);
    return state.missions.filter((m) => m.completed);
  }, [filterTab, todaysMissions, state.missions]);

  const { profile, streak, focusStats, preferences } = state;
  const completedTodayForStreak = streak.lastCompletedDate === todayKey;

  return (
    <div className="space-y-6">
      {/* Clean Overview Strip: Welcome, Level & XP, Today's Progress */}
      <section className="hud-layer-2 rounded-md border border-white/10 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4 sm:items-center">
            <button
              type="button"
              onClick={onEditProfile}
              className="rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]"
              title="Edit profile"
            >
              <AvatarBadge avatarId={profile.avatarId} size="lg" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-xl font-bold tracking-tight text-[#E2E2EC] sm:text-2xl">
                  Welcome back, {profile.name}
                </h1>
                <span className="font-mono text-xs font-semibold hud-accent-text">
                  · Level {profile.level}
                </span>
              </div>

              <div className="mt-2.5 max-w-md">
                <div className="mb-1 flex items-center justify-between font-mono text-xs">
                  <span className="text-[#B9CACB]">
                    {profile.totalXp.toLocaleString()} XP total
                  </span>
                  <span className="hud-accent-text">
                    {profile.currentLevelXp} / {profile.xpToNextLevel} XP to Lv.{profile.level + 1}
                  </span>
                </div>
                <StatBar
                  value={profile.currentLevelXp}
                  max={profile.xpToNextLevel}
                  variant={preferences.themeAccent}
                  heightClass="h-2"
                />
              </div>
            </div>
          </div>

          {/* Daily Progress & Streak Summary */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-4">
            <div className="rounded border border-white/[0.08] bg-[#0C0E15] px-4 py-2.5">
              <span className="block font-mono text-[11px] text-[#9BA9AC]">Today&apos;s Progress</span>
              <span className="mt-0.5 block font-mono text-lg font-bold text-[#65F2B5]">
                {todayCompletedCount}/{Math.max(todaysMissions.length, preferences.dailyMissionGoal)}
              </span>
            </div>

            <div className="rounded border border-white/[0.08] bg-[#0C0E15] px-4 py-2.5">
              <span className="flex items-center gap-1 font-mono text-[11px] text-[#9BA9AC]">
                <Flame className="h-3 w-3 text-[#F59E0B]" />
                Streak
              </span>
              <span className="mt-0.5 block font-mono text-lg font-bold text-[#FCD34D]">
                {streak.current} {streak.current === 1 ? 'day' : 'days'}
              </span>
              <span className="block font-mono text-[11px] text-[#9BA9AC]">
                {completedTodayForStreak
                  ? 'Logged today'
                  : streak.current > 0
                    ? 'Ready today'
                    : 'Start anytime'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content: Today's Missions (8 cols) + Focus & Daily Plan (4 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <div className="hud-layer-1 rounded-md p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">
                  Today&apos;s Missions
                </h2>
                <p className="mt-0.5 text-xs text-[#B9CACB]">
                  Check off missions as you finish them to earn XP and build momentum.
                </p>
              </div>

              <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
                {(
                  [
                    { id: 'today', label: `Today (${todaysMissions.length})` },
                    {
                      id: 'open',
                      label: `Open (${state.missions.filter((m) => !m.completed).length})`,
                    },
                    {
                      id: 'done',
                      label: `Done (${state.missions.filter((m) => m.completed).length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`min-h-[34px] rounded-sm px-2.5 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                      filterTab === tab.id
                        ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                        : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {displayedMissions.length === 0 ? (
                <div className="rounded border border-dashed border-white/15 bg-[#0C0E15]/60 p-6 text-center sm:p-8">
                  <p className="font-display text-base font-medium text-[#E2E2EC]">
                    {state.missions.length === 0
                      ? 'Ready when you are'
                      : 'Nothing in this view'}
                  </p>
                  <p className="mt-1 text-xs text-[#9BA9AC]">
                    {state.missions.length === 0
                      ? 'Pick a quick starter mission below, create your own, or plan a goal with ATLAS.'
                      : 'Switch tabs above or add a new mission.'}
                  </p>

                  {state.missions.length === 0 && onQuickAddMission && (
                    <div className="mx-auto mt-4 grid max-w-xl grid-cols-1 gap-2 text-left sm:grid-cols-3">
                      {STARTER_PRESETS.map((preset) => (
                        <button
                          key={preset.title}
                          type="button"
                          onClick={() => onQuickAddMission(preset)}
                          className="rounded border border-white/12 bg-[#131622] p-3 text-left transition-colors hover:border-[var(--hud-accent-border)] hover:bg-[#1A1F30]"
                        >
                          <span className="block font-display text-xs font-semibold text-[#E2E2EC]">
                            + {preset.title}
                          </span>
                          <span className="mt-1 block font-mono text-[11px] hud-accent-text">
                            {preset.category} · +50 XP
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={onOpenNewMission}
                      className="hud-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-4 py-2 font-display text-xs font-semibold whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Mission
                    </button>
                    <button
                      type="button"
                      onClick={onNavigateJarvis}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded border border-white/15 bg-[#131622] px-3.5 py-2 font-display text-xs font-medium text-[#E2E2EC] transition-colors hover:border-[var(--hud-accent-border)] whitespace-nowrap"
                    >
                      <Bot className="h-3.5 w-3.5 hud-accent-text" />
                      Ask ATLAS
                    </button>
                  </div>
                </div>
              ) : (
                displayedMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    onToggleComplete={onToggleMission}
                    onToggleSubObjective={onToggleSubObjective}
                    onEdit={onEditMission}
                    onDelete={onDeleteMission}
                  />
                ))
              )}
            </div>
          </div>

          {/* Collapsible Command Centre: Daily Briefing & Smart Schedule */}
          <div className="hud-layer-1 rounded-md p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={commandOpen}
                onClick={() => setCommandOpen((v) => !v)}
                className="flex min-h-[36px] items-center gap-2 text-left"
              >
                <Sparkles className="h-4 w-4 hud-accent-text" />
                <span className="font-display text-sm font-semibold text-[#E2E2EC]">
                  Daily Briefing &amp; Schedule
                </span>
                {commandOpen ? (
                  <ChevronUp className="h-4 w-4 text-[#9BA9AC]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#9BA9AC]" />
                )}
              </button>

              {!commandOpen && (
                <span className="max-w-md truncate font-mono text-xs text-[#9BA9AC]">
                  {activeBriefing.headline}
                </span>
              )}
            </div>

            {commandOpen && (
              <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0C0E15] p-0.5">
                    <button
                      type="button"
                      onClick={() => setCommandMode('briefing')}
                      className={`min-h-[34px] rounded-sm px-2.5 py-1 font-mono text-xs whitespace-nowrap ${
                        commandMode === 'briefing'
                          ? 'hud-nav-active'
                          : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                      }`}
                    >
                      Briefing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommandMode('schedule')}
                      className={`inline-flex min-h-[34px] items-center gap-1 rounded-sm px-2.5 py-1 font-mono text-xs whitespace-nowrap ${
                        commandMode === 'schedule'
                          ? 'hud-nav-active'
                          : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      Schedule
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Available time today"
                      value={preferences.availableMinutesToday}
                      onChange={(e) => onUpdateAvailableMinutes(Number(e.target.value))}
                      className="min-h-[34px] rounded border border-white/15 bg-[#0C0E15] px-2.5 py-1 font-mono text-xs text-[#E2E2EC]"
                    >
                      {TIME_OPTIONS.map((mins) => (
                        <option key={mins} value={mins}>
                          {mins} min available
                        </option>
                      ))}
                    </select>

                    {commandMode === 'briefing' && (
                      <button
                        type="button"
                        disabled={!isOnline || aiBriefingLoading}
                        onClick={handleGenerateAiBriefing}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded border border-[#8B5CF6]/50 bg-[#131622] px-2.5 py-1 font-mono text-xs text-[#D0BCFF] disabled:opacity-45 whitespace-nowrap"
                      >
                        {aiBriefingLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        AI Refresh
                      </button>
                    )}
                  </div>
                </div>

                {commandMode === 'briefing' ? (
                  <div className="space-y-3">
                    {aiBriefingError && (
                      <p className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#FCD34D]">
                        {aiBriefingError}
                      </p>
                    )}
                    <p className="text-sm text-[#E2E2EC]">{activeBriefing.headline}</p>
                    {activeBriefing.items.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {activeBriefing.items.map((item, idx) => (
                          <div
                            key={item.id}
                            className="rounded border border-white/[0.08] bg-[#0C0E15] p-3"
                          >
                            <p className="font-display text-sm font-medium text-[#E2E2EC] truncate">
                              {idx + 1}. {item.title}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-[#9BA9AC]">
                              {item.reason} · ~{item.estimatedMinutes}m
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.06] bg-[#0C0E15] px-3 py-2">
                      <span className="text-xs text-[#B9CACB]">{activeBriefing.encouragement}</span>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Suggested focus duration"
                          value={activeBriefing.suggestedFocusMinutes}
                          onChange={(e) => setCustomFocusOverride(Number(e.target.value))}
                          className="min-h-[34px] rounded border border-white/15 bg-[#131622] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
                        >
                          {[15, 25, 45, 60].map((m) => (
                            <option key={m} value={m}>
                              {m}m focus
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            onApproveBriefing(
                              activeBriefing.suggestedFocusMinutes,
                              activeBriefing.headline
                            )
                          }
                          className="hud-btn-primary inline-flex min-h-[34px] items-center gap-1 rounded px-3 py-1 font-display text-xs font-semibold whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Apply Focus Time
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[#B9CACB]">
                        {smartSchedule.blocks.length} mission block(s) ({smartSchedule.totalScheduledMinutes}m)
                      </span>
                      <select
                        aria-label="Schedule start time"
                        value={scheduleStart}
                        onChange={(e) =>
                          setScheduleStart(e.target.value as 'now' | '09:00' | '13:00' | '18:00')
                        }
                        className="min-h-[34px] rounded border border-white/15 bg-[#0C0E15] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
                      >
                        <option value="now">Start Now</option>
                        <option value="09:00">09:00</option>
                        <option value="13:00">13:00</option>
                        <option value="18:00">18:00</option>
                      </select>
                    </div>

                    {smartSchedule.blocks.length === 0 ? (
                      <p className="rounded border border-dashed border-white/15 bg-[#0C0E15] p-4 text-xs text-[#9BA9AC]">
                        Add open missions to build a daily schedule.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {smartSchedule.blocks.map((block) => (
                            <div
                              key={block.missionId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.08] bg-[#0C0E15] px-3 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="font-mono text-[11px] font-semibold hud-accent-text whitespace-nowrap">
                                  {block.startLabel}–{block.endLabel}
                                </span>
                                <span className="truncate text-sm font-medium text-[#E2E2EC]">
                                  {block.title}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] text-[#9BA9AC]">
                                {block.durationMinutes}m
                              </span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onApproveSchedule(
                              smartSchedule.blocks.map((b) => ({
                                missionId: b.missionId,
                                startLabel: b.startLabel,
                                endLabel: b.endLabel,
                              })),
                              Math.min(60, Math.max(15, smartSchedule.blocks[0].durationMinutes))
                            )
                          }
                          className="hud-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded px-3.5 py-1.5 font-display text-xs font-semibold whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve Schedule
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column (4 cols): Focus Session + ATLAS Quick Card */}
        <aside className="space-y-5 lg:col-span-4">
          <FocusTimer
            selectedDuration={focusStats.selectedDurationMinutes}
            onSelectDuration={onSelectFocusDuration}
            onCompleteSession={onCompleteFocusSession}
            totalMinutes={focusStats.totalMinutes}
            sessionsCompleted={focusStats.sessionsCompleted}
          />

          <div className="hud-layer-1 rounded-md p-5">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 hud-accent-text" />
              <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                ATLAS Assistant
              </h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[#B9CACB]">
              Need help breaking down a big goal or deciding what to work on next?
            </p>
            <button
              type="button"
              onClick={onNavigateJarvis}
              className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] px-3 py-2 font-display text-xs font-semibold text-[var(--hud-accent-text)] transition-colors hover:brightness-110"
            >
              Open ATLAS
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
