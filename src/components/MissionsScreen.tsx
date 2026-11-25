import React, { useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  Bot,
  History,
  Map,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ALL_SKILLS } from '../lib/rpgEngine';
import {
  GoalMilestone,
  GoalRoadmap,
  LifeRpgState,
  Mission,
  MissionDifficulty,
  MissionFrequency,
  SkillCategory,
} from '../types/hud';
import { CyberCheckbox } from './CyberCheckbox';
import { MissionCard } from './MissionCard';
import { StatBar } from './StatBar';

interface MissionsScreenProps {
  state: LifeRpgState;
  onToggleMission: (missionId: string) => void;
  onToggleSubObjective: (missionId: string, subId: string) => void;
  onOpenNewMission: () => void;
  onQuickAddMission?: (preset: {
    title: string;
    description: string;
    category: SkillCategory;
    difficulty: MissionDifficulty;
    frequency: MissionFrequency;
    deadline: string;
  }) => void;
  onEditMission: (mission: Mission) => void;
  onDeleteMission: (mission: Mission) => void;
  onCreateRoadmap: (payload: {
    title: string;
    description: string;
    category: SkillCategory;
    targetDate: string;
    milestones: Array<{ title: string; targetDate?: string }>;
  }) => void;
  onAddMilestone: (roadmapId: string, title: string, targetDate?: string) => void;
  onToggleMilestone: (roadmapId: string, milestoneId: string) => void;
  onDeleteRoadmap: (roadmap: GoalRoadmap) => void;
  onPromoteMilestoneToMission: (roadmap: GoalRoadmap, milestone: GoalMilestone) => void;
  onNavigateAtlasPlanner: () => void;
}

export const MissionsScreen: React.FC<MissionsScreenProps> = ({
  state,
  onToggleMission,
  onToggleSubObjective,
  onOpenNewMission,
  onQuickAddMission,
  onEditMission,
  onDeleteMission,
  onCreateRoadmap,
  onAddMilestone,
  onToggleMilestone,
  onDeleteRoadmap,
  onPromoteMilestoneToMission,
  onNavigateAtlasPlanner,
}) => {
  const [frequencyFilter, setFrequencyFilter] = useState<
    'all' | MissionFrequency | 'roadmap' | 'history'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SkillCategory>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | MissionDifficulty>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Roadmap form state
  const [roadmapFormOpen, setRoadmapFormOpen] = useState(false);
  const [roadTitle, setRoadTitle] = useState('');
  const [roadDesc, setRoadDesc] = useState('');
  const [roadCategory, setRoadCategory] = useState<SkillCategory>(SkillCategory.Discipline);
  const [roadTargetDate, setRoadTargetDate] = useState('This month');
  const [roadMilestonesText, setRoadMilestonesText] = useState('');
  const [roadError, setRoadError] = useState<string | null>(null);

  const [newMilestoneDrafts, setNewMilestoneDrafts] = useState<Record<string, string>>({});

  const filteredMissions = useMemo(() => {
    if (frequencyFilter === 'history' || frequencyFilter === 'roadmap') return [];
    const q = searchQuery.trim().toLowerCase();
    return state.missions.filter((m) => {
      if (frequencyFilter !== 'all' && m.frequency !== frequencyFilter) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (difficultyFilter !== 'all' && m.difficulty !== difficultyFilter) return false;
      if (
        q &&
        !m.title.toLowerCase().includes(q) &&
        !m.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.missions, frequencyFilter, categoryFilter, difficultyFilter, searchQuery]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.completedHistory.filter((h) => {
      if (categoryFilter !== 'all' && h.category !== categoryFilter) return false;
      if (difficultyFilter !== 'all' && h.difficulty !== difficultyFilter) return false;
      if (q && !h.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [state.completedHistory, categoryFilter, difficultyFilter, searchQuery]);

  const handleSubmitRoadmap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roadTitle.trim()) {
      setRoadError('Please enter a goal title.');
      return;
    }
    const milestones = roadMilestonesText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((title) => ({ title, targetDate: roadTargetDate || 'Upcoming' }));

    onCreateRoadmap({
      title: roadTitle.trim(),
      description: roadDesc.trim(),
      category: roadCategory,
      targetDate: roadTargetDate.trim() || 'This quarter',
      milestones,
    });
    setRoadTitle('');
    setRoadDesc('');
    setRoadMilestonesText('');
    setRoadError(null);
    setRoadmapFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="hud-layer-1 rounded-md p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#E2E2EC]">Missions</h1>
            <p className="mt-1 text-sm text-[#B9CACB]">
              Daily and weekly habits reset automatically by your local calendar while your completed history stays saved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onNavigateAtlasPlanner}
              className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-display text-xs font-semibold text-[#E2E2EC] transition-colors hover:border-[var(--hud-accent-border)] whitespace-nowrap"
            >
              <Bot className="h-3.5 w-3.5 hud-accent-text" />
              Plan with ATLAS
            </button>
            <button
              type="button"
              onClick={onOpenNewMission}
              className="hud-btn-primary flex min-h-[40px] shrink-0 items-center gap-1.5 rounded px-4 py-2 font-display text-xs font-semibold whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              New Mission
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-4">
          {(
            [
              { id: 'all', label: `All (${state.missions.length})` },
              {
                id: MissionFrequency.Daily,
                label: `Daily (${state.missions.filter((m) => m.frequency === MissionFrequency.Daily).length})`,
              },
              {
                id: MissionFrequency.Weekly,
                label: `Weekly (${state.missions.filter((m) => m.frequency === MissionFrequency.Weekly).length})`,
              },
              {
                id: MissionFrequency.Custom,
                label: `One-Time (${state.missions.filter((m) => m.frequency === MissionFrequency.Custom).length})`,
              },
              {
                id: 'roadmap',
                label: `Goal Roadmaps (${state.goalRoadmaps.length})`,
              },
              {
                id: 'history',
                label: `History (${state.completedHistory.length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFrequencyFilter(tab.id)}
              className={`min-h-[36px] rounded border px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                frequencyFilter === tab.id
                  ? 'hud-nav-active'
                  : 'border-white/10 bg-[#0C0E15] text-[#B9CACB] hover:border-white/25 hover:text-[#E2E2EC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Filters (shown for Mission and History tabs) */}
        {frequencyFilter !== 'roadmap' && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="relative sm:col-span-6">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9BA9AC]" />
              <input
                type="text"
                aria-label="Search missions"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or notes..."
                className="min-h-[40px] w-full rounded border border-white/12 bg-[#0C0E15] py-2 pl-9 pr-3 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                aria-label="Filter by skill category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | SkillCategory)}
                className="min-h-[40px] w-full rounded border border-white/12 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
              >
                <option value="all">All Skills</option>
                {ALL_SKILLS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                aria-label="Filter by difficulty"
                value={difficultyFilter}
                onChange={(e) =>
                  setDifficultyFilter(e.target.value as 'all' | MissionDifficulty)
                }
                className="min-h-[40px] w-full rounded border border-white/12 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
              >
                <option value="all">All Tiers</option>
                {Object.values(MissionDifficulty).map((diff) => (
                  <option key={diff} value={diff}>
                    {diff}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Goal Roadmaps View */}
      {frequencyFilter === 'roadmap' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-[#00F0FF]" />
              <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">
                Goal Roadmaps
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRoadmapFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded bg-[#00F0FF] px-3.5 py-2 font-display text-xs font-semibold text-[#08090C]"
            >
              <Plus className="h-3.5 w-3.5" />
              {roadmapFormOpen ? 'Close Form' : 'New Goal Roadmap'}
            </button>
          </div>

          {roadmapFormOpen && (
            <form
              onSubmit={handleSubmitRoadmap}
              className="hud-layer-2 space-y-3 rounded-md border border-[#00F0FF]/35 p-5"
            >
              {roadError && (
                <p className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/35 px-3 py-2 text-xs text-[#FFDAD6]">
                  {roadError}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="road-title"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Long-Term Goal
                  </label>
                  <input
                    id="road-title"
                    type="text"
                    maxLength={120}
                    value={roadTitle}
                    onChange={(e) => setRoadTitle(e.target.value)}
                    placeholder="e.g., Launch my portfolio website"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="road-cat"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Skill
                  </label>
                  <select
                    id="road-cat"
                    value={roadCategory}
                    onChange={(e) => setRoadCategory(e.target.value as SkillCategory)}
                    className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                  >
                    {ALL_SKILLS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="road-desc"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Why It Matters (Optional)
                  </label>
                  <input
                    id="road-desc"
                    type="text"
                    maxLength={300}
                    value={roadDesc}
                    onChange={(e) => setRoadDesc(e.target.value)}
                    placeholder="Short note"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="road-target"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Target Timeframe
                  </label>
                  <input
                    id="road-target"
                    type="text"
                    maxLength={40}
                    value={roadTargetDate}
                    onChange={(e) => setRoadTargetDate(e.target.value)}
                    placeholder="e.g., End of month"
                    className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="road-milestones"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Milestones (one per line)
                </label>
                <textarea
                  id="road-milestones"
                  rows={3}
                  value={roadMilestonesText}
                  onChange={(e) => setRoadMilestonesText(e.target.value)}
                  placeholder={'Design wireframe\nWrite project summaries\nPublish live site'}
                  className="w-full rounded border border-white/15 bg-[#0C0E15] px-3 py-2 text-sm text-[#E2E2EC] focus:border-[#00F0FF] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRoadmapFormOpen(false)}
                  className="rounded border border-white/15 bg-[#0C0E15] px-3.5 py-1.5 text-xs text-[#B9CACB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#00F0FF] px-4 py-1.5 font-display text-xs font-semibold text-[#08090C]"
                >
                  Save Goal Roadmap
                </button>
              </div>
            </form>
          )}

          {state.goalRoadmaps.length === 0 ? (
            <div className="hud-layer-1 rounded-md p-10 text-center">
              <p className="font-display text-base font-medium text-[#E2E2EC]">
                No goal roadmaps yet
              </p>
              <p className="mt-1 text-xs text-[#9BA9AC]">
                Break big goals into manageable milestones and earn +40 XP as you complete each step.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {state.goalRoadmaps.map((road) => {
                const doneCount = road.milestones.filter((m) => m.completed).length;
                const draftVal = newMilestoneDrafts[road.id] || '';
                return (
                  <div
                    key={road.id}
                    className="hud-layer-2 rounded-md border border-white/12 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg font-semibold text-[#E2E2EC]">
                            {road.title}
                          </h3>
                          <span className="font-mono text-xs font-medium hud-accent-text">
                            {road.category}
                          </span>
                          <span className="font-mono text-xs text-[#9BA9AC]">
                            · Target: {road.targetDate}
                          </span>
                        </div>
                        {road.description && (
                          <p className="mt-1 text-xs text-[#B9CACB]">{road.description}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteRoadmap(road)}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] hover:bg-[#93000A]/30 hover:text-[#FFB4AB]"
                        aria-label={`Delete ${road.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between font-mono text-xs text-[#B9CACB]">
                        <span>Milestones</span>
                        <span>
                          {doneCount}/{road.milestones.length} completed
                        </span>
                      </div>
                      <StatBar
                        value={doneCount}
                        max={Math.max(1, road.milestones.length)}
                        variant="emerald"
                        heightClass="h-1.5"
                      />
                    </div>

                    <ul className="mt-4 space-y-2">
                      {road.milestones.map((ms) => (
                        <li
                          key={ms.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/[0.06] bg-[#0C0E15] px-3 py-2"
                        >
                          <div className="flex items-center gap-2.5">
                            <CyberCheckbox
                              checked={ms.completed}
                              onChange={() => onToggleMilestone(road.id, ms.id)}
                              ariaLabel={`Toggle milestone ${ms.title}`}
                            />
                            <span
                              className={`text-sm ${
                                ms.completed ? 'line-through text-[#9BA9AC]' : 'text-[#E2E2EC]'
                              }`}
                            >
                              {ms.title}
                            </span>
                          </div>

                          {!ms.completed && (
                            <button
                              type="button"
                              onClick={() => onPromoteMilestoneToMission(road, ms)}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded border border-white/12 px-2.5 py-1 font-mono text-[11px] hud-accent-text transition-colors hover:border-[var(--hud-accent-border)] whitespace-nowrap"
                            >
                              <ArrowRightCircle className="h-3 w-3" />
                              Add as Mission
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={draftVal}
                        onChange={(e) =>
                          setNewMilestoneDrafts((prev) => ({ ...prev, [road.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && draftVal.trim()) {
                            e.preventDefault();
                            onAddMilestone(road.id, draftVal.trim(), road.targetDate);
                            setNewMilestoneDrafts((prev) => ({ ...prev, [road.id]: '' }));
                          }
                        }}
                        placeholder="Add another milestone..."
                        className="min-h-[38px] flex-1 rounded border border-white/12 bg-[#0C0E15] px-3 py-1.5 text-xs text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={!draftVal.trim()}
                        onClick={() => {
                          if (!draftVal.trim()) return;
                          onAddMilestone(road.id, draftVal.trim(), road.targetDate);
                          setNewMilestoneDrafts((prev) => ({ ...prev, [road.id]: '' }));
                        }}
                        className="min-h-[38px] rounded border border-white/15 bg-[#131622] px-3.5 py-1.5 font-mono text-xs text-[#E2E2EC] disabled:opacity-40 whitespace-nowrap"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : frequencyFilter === 'history' ? (
        <div className="hud-layer-2 rounded-md border border-white/12 p-5">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 hud-accent-text" />
            <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">
              Completed Mission Archive
            </h2>
          </div>

          {filteredHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9BA9AC]">
              No completed missions recorded yet. Check off any mission to start building your history.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 font-mono text-[11px] uppercase tracking-wider text-[#9BA9AC]">
                    <th className="py-2.5 pr-4">Date</th>
                    <th className="py-2.5 pr-4">Mission</th>
                    <th className="py-2.5 pr-4">Skill</th>
                    <th className="py-2.5 pr-4">Tier</th>
                    <th className="py-2.5 text-right">XP Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-mono text-xs text-[#B9CACB] whitespace-nowrap">
                        {item.localDate}
                      </td>
                      <td className="py-3 pr-4 font-medium text-[#E2E2EC]">{item.title}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-[#D0BCFF]">{item.category}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-[#B9CACB]">{item.difficulty}</td>
                      <td className="py-3 text-right font-mono text-xs font-semibold text-[#65F2B5] whitespace-nowrap">
                        +{item.xpEarned} XP
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMissions.length === 0 ? (
            <div className="hud-layer-1 rounded-md p-10 text-center">
              <p className="font-display text-base font-medium text-[#E2E2EC]">
                {state.missions.length === 0 ? 'No missions yet' : 'No missions match these filters'}
              </p>
              <p className="mt-1 text-xs text-[#9BA9AC]">
                {state.missions.length === 0
                  ? 'Create a mission, add a starter habit, or ask ATLAS to plan a goal.'
                  : 'Try clearing your search or switching tabs.'}
              </p>
              {state.missions.length === 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onOpenNewMission}
                    className="hud-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-4 py-2 font-display text-xs font-semibold whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create First Mission
                  </button>
                  {onQuickAddMission && (
                    <button
                      type="button"
                      onClick={() =>
                        onQuickAddMission({
                          title: '20-Minute Focused Session',
                          description: 'Pick one meaningful task and work uninterrupted.',
                          category: SkillCategory.Discipline,
                          difficulty: MissionDifficulty.Easy,
                          frequency: MissionFrequency.Daily,
                          deadline: 'Today',
                        })
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-display text-xs font-medium text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap"
                    >
                      + Quick Starter Habit
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFrequencyFilter('all');
                    setCategoryFilter('all');
                    setDifficultyFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 inline-flex min-h-[38px] items-center rounded border border-white/15 bg-[#0C0E15] px-4 py-2 font-mono text-xs text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            filteredMissions.map((mission) => (
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
      )}
    </div>
  );
};
