import React, { useMemo, useState } from 'react';
import { Award, BookOpen, Check, Edit3, Lock, Sparkles } from 'lucide-react';
import { ALL_SKILLS, SKILL_DESCRIPTIONS } from '../lib/rpgEngine';
import {
  AchievementRarity,
  JournalEntryKind,
  LifeRpgState,
  SkillCategory,
} from '../types/hud';
import { SkillRadar } from './SkillRadar';
import { StatBar } from './StatBar';

interface ProgressionScreenProps {
  state: LifeRpgState;
  onUpdateJournalNote: (entryId: string, note: string) => void;
}

const SKILL_ACCENT: Record<
  SkillCategory,
  { variant: 'cyan' | 'violet' | 'emerald' | 'gold'; border: string; badge: string }
> = {
  [SkillCategory.Intelligence]: {
    variant: 'cyan',
    border: 'border-[#00F0FF]/30',
    badge: 'text-[#DBFCFF] border-[#00F0FF]/35 bg-[#00F0FF]/10',
  },
  [SkillCategory.Discipline]: {
    variant: 'violet',
    border: 'border-[#8B5CF6]/30',
    badge: 'text-[#D0BCFF] border-[#8B5CF6]/35 bg-[#8B5CF6]/10',
  },
  [SkillCategory.Leadership]: {
    variant: 'gold',
    border: 'border-[#F59E0B]/30',
    badge: 'text-[#FCD34D] border-[#F59E0B]/35 bg-[#F59E0B]/10',
  },
  [SkillCategory.Creativity]: {
    variant: 'violet',
    border: 'border-[#8B5CF6]/30',
    badge: 'text-[#D0BCFF] border-[#8B5CF6]/35 bg-[#8B5CF6]/10',
  },
  [SkillCategory.Fitness]: {
    variant: 'emerald',
    border: 'border-[#10B981]/30',
    badge: 'text-[#65F2B5] border-[#10B981]/35 bg-[#10B981]/10',
  },
};

const RARITY_STYLES: Record<AchievementRarity, string> = {
  [AchievementRarity.Common]: 'border-white/20 text-[#B9CACB] bg-[#131622]',
  [AchievementRarity.Rare]: 'border-[#00F0FF]/50 text-[#DBFCFF] bg-[#00F0FF]/10',
  [AchievementRarity.Epic]: 'border-[#8B5CF6]/55 text-[#D0BCFF] bg-[#8B5CF6]/15',
  [AchievementRarity.Legendary]: 'hud-legendary-chip border-[#F59E0B]/65 text-[#FCD34D]',
};

const KIND_LABELS: Record<JournalEntryKind, string> = {
  achievement: 'Achievement',
  level_up: 'Level Up',
  milestone: 'Milestone',
  boss_clear: 'Boss Clear',
  focus_milestone: 'Focus',
};

export const ProgressionScreen: React.FC<ProgressionScreenProps> = ({
  state,
  onUpdateJournalNote,
}) => {
  const [sectionTab, setSectionTab] = useState<'skills' | 'achievements' | 'journal'>('skills');
  const [achFilter, setAchFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [journalFilter, setJournalFilter] = useState<'all' | JournalEntryKind>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const unlockedCount = state.achievements.filter((a) => a.unlocked).length;

  const filteredAchievements = useMemo(
    () =>
      state.achievements.filter((a) => {
        if (achFilter === 'unlocked') return a.unlocked;
        if (achFilter === 'locked') return !a.unlocked;
        return true;
      }),
    [state.achievements, achFilter]
  );

  const filteredJournal = useMemo(
    () =>
      state.achievementJournal.filter((entry) =>
        journalFilter === 'all' ? true : entry.kind === journalFilter
      ),
    [state.achievementJournal, journalFilter]
  );

  return (
    <div className="space-y-6">
      {/* Header & Section Tabs */}
      <div className="hud-layer-1 rounded-md p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#E2E2EC]">
              Skills &amp; Achievements
            </h1>
            <p className="mt-1 text-sm text-[#B9CACB]">
              Track your five core skills, milestone badges, and achievement journal.
            </p>
          </div>
          <span className="font-mono text-xs hud-accent-text">
            Total Skill XP:{' '}
            {ALL_SKILLS.reduce((acc, k) => acc + state.skills[k].xp, 0).toLocaleString()}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={() => setSectionTab('skills')}
            className={`min-h-[36px] rounded border px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
              sectionTab === 'skills'
                ? 'hud-nav-active'
                : 'border-white/10 bg-[#0C0E15] text-[#B9CACB] hover:text-[#E2E2EC]'
            }`}
          >
            Core Skills (5)
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('achievements')}
            className={`min-h-[36px] rounded border px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
              sectionTab === 'achievements'
                ? 'hud-nav-active'
                : 'border-white/10 bg-[#0C0E15] text-[#B9CACB] hover:text-[#E2E2EC]'
            }`}
          >
            Achievements ({unlockedCount}/{state.achievements.length})
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('journal')}
            className={`min-h-[36px] rounded border px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
              sectionTab === 'journal'
                ? 'hud-nav-active'
                : 'border-white/10 bg-[#0C0E15] text-[#B9CACB] hover:text-[#E2E2EC]'
            }`}
          >
            Journal ({state.achievementJournal.length})
          </button>
        </div>
      </div>

      {/* Skills Tab */}
      {sectionTab === 'skills' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            {ALL_SKILLS.map((cat) => {
              const skill = state.skills[cat];
              const style = SKILL_ACCENT[cat];
              const pct = Math.round(
                (skill.currentLevelXp / Math.max(1, skill.xpToNextLevel)) * 100
              );
              return (
                <div key={cat} className={`hud-layer-2 rounded-md border p-5 ${style.border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">{cat}</h2>
                      <p className="mt-1 text-xs leading-relaxed text-[#B9CACB]">
                        {SKILL_DESCRIPTIONS[cat]}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-sm border px-2.5 py-1 font-mono text-xs font-semibold ${style.badge}`}
                    >
                      Lv.{skill.level}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                      <span className="text-[#9BA9AC]">
                        {skill.missionsCompleted} completed
                      </span>
                      <span className="text-[#E2E2EC]">
                        {skill.currentLevelXp}/{skill.xpToNextLevel} XP ({pct}%)
                      </span>
                    </div>
                    <StatBar
                      value={skill.currentLevelXp}
                      max={skill.xpToNextLevel}
                      variant={style.variant}
                      heightClass="h-2"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="hud-layer-2 flex flex-col items-center justify-center rounded-md border border-white/12 p-5 lg:col-span-4">
            <h3 className="mb-2 font-display text-sm font-semibold text-[#E2E2EC]">
              Skill Balance
            </h3>
            <SkillRadar skills={state.skills} />
          </aside>
        </div>
      )}

      {/* Achievements Tab */}
      {sectionTab === 'achievements' && (
        <section className="hud-layer-1 rounded-md p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FCD34D]">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">
                  Achievements
                </h2>
                <p className="font-mono text-xs text-[#B9CACB]">
                  {unlockedCount} of {state.achievements.length} unlocked
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
              {(
                [
                  { id: 'all', label: `All (${state.achievements.length})` },
                  { id: 'unlocked', label: `Unlocked (${unlockedCount})` },
                  {
                    id: 'locked',
                    label: `Locked (${state.achievements.length - unlockedCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAchFilter(tab.id)}
                  className={`min-h-[34px] rounded-sm px-3 py-1 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                    achFilter === tab.id
                      ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                      : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredAchievements.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9BA9AC]">
              {achFilter === 'unlocked'
                ? 'Complete missions and focus sessions to unlock your first achievement.'
                : 'Every achievement has been unlocked.'}
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredAchievements.map((ach) => {
                const pct = Math.round(
                  (ach.progressCurrent / Math.max(1, ach.progressTarget)) * 100
                );
                return (
                  <div
                    key={ach.id}
                    className={`rounded-md border p-4 transition-colors ${
                      ach.unlocked
                        ? 'hud-layer-2 border-[#10B981]/45'
                        : 'border-white/[0.07] bg-[#0C0E15]/80 opacity-85'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border ${
                            ach.unlocked
                              ? 'border-[#10B981]/50 bg-[#10B981]/15 text-[#65F2B5]'
                              : 'border-white/15 bg-[#131622] text-[#9BA9AC]'
                          }`}
                        >
                          {ach.unlocked ? (
                            <Sparkles className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-display text-base font-semibold text-[#E2E2EC]">
                            {ach.title}
                          </h3>
                          <p className="mt-0.5 text-xs leading-relaxed text-[#B9CACB]">
                            {ach.description}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider ${
                          ach.rarity === AchievementRarity.Legendary
                            ? 'text-[#FCD34D]'
                            : ach.rarity === AchievementRarity.Epic
                              ? 'text-[#D0BCFF]'
                              : ach.rarity === AchievementRarity.Rare
                                ? 'hud-accent-text'
                                : 'text-[#9BA9AC]'
                        }`}
                      >
                        {ach.rarity}
                      </span>
                    </div>

                    <div className="mt-3.5">
                      <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
                        <span className={ach.unlocked ? 'text-[#65F2B5]' : 'text-[#9BA9AC]'}>
                          {ach.unlocked && ach.unlockedAt
                            ? `Unlocked · ${new Date(ach.unlockedAt).toLocaleDateString()}`
                            : 'In Progress'}
                        </span>
                        <span className="text-[#E2E2EC]">
                          {ach.progressCurrent}/{ach.progressTarget} ({pct}%)
                        </span>
                      </div>
                      <StatBar
                        value={ach.progressCurrent}
                        max={ach.progressTarget}
                        variant={ach.unlocked ? 'emerald' : 'cyan'}
                        heightClass="h-1.5"
                        showBeam={ach.unlocked}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Achievement Journal Tab */}
      {sectionTab === 'journal' && (
        <section className="hud-layer-1 rounded-md p-5 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 hud-accent-text" />
              <div>
                <h2 className="font-display text-lg font-semibold text-[#E2E2EC]">
                  Achievement Journal
                </h2>
                <p className="text-xs text-[#B9CACB]">
                  A timeline of your unlocked achievements, level-ups, and completed milestones.
                </p>
              </div>
            </div>

            <select
              aria-label="Filter journal entries"
              value={journalFilter}
              onChange={(e) => setJournalFilter(e.target.value as 'all' | JournalEntryKind)}
              className="min-h-[38px] rounded border border-white/15 bg-[#0C0E15] px-3 py-1.5 font-mono text-xs text-[#E2E2EC]"
            >
              <option value="all">All Entries</option>
              <option value="achievement">Achievements</option>
              <option value="level_up">Level Ups</option>
              <option value="milestone">Milestones</option>
              <option value="boss_clear">Boss Clears</option>
              <option value="focus_milestone">Focus</option>
            </select>
          </div>

          {filteredJournal.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9BA9AC]">
              Your journal is empty right now. As you level up, unlock badges, or finish milestones, entries appear here automatically.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredJournal.map((entry) => {
                const isEditing = editingNoteId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="rounded border border-white/10 bg-[#0C0E15] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider hud-accent-text">
                            {KIND_LABELS[entry.kind]}
                          </span>
                          <span className="text-[#9BA9AC]" aria-hidden="true">·</span>
                          <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                            {entry.title}
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-[#B9CACB]">{entry.detail}</p>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px] text-[#9BA9AC]">
                        <span>{entry.localDate}</span>
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(entry.id);
                              setNoteDraft(entry.note || '');
                            }}
                            className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded p-1.5 text-[#9BA9AC] hover:text-[var(--hud-accent)]"
                            aria-label="Edit reflection note"
                            title="Add or edit reflection note"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {entry.note && !isEditing && (
                      <p className="mt-2.5 rounded border border-white/[0.06] bg-[#131622] px-3 py-2 text-xs italic text-[#E2E2EC]">
                        {entry.note}
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          maxLength={300}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Write a short reflection note..."
                          className="min-h-[38px] flex-1 rounded border border-white/15 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateJournalNote(entry.id, noteDraft.trim());
                              setEditingNoteId(null);
                            }}
                            className="hud-btn-primary inline-flex min-h-[36px] items-center gap-1 rounded px-3 py-1.5 font-display text-xs font-semibold whitespace-nowrap"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="min-h-[36px] rounded border border-white/15 px-3 py-1.5 text-xs text-[#B9CACB] hover:text-[#E2E2EC] whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
