import type { AvatarId, DatabaseSchema, ServerUserState } from './store.ts';

export const ALL_SKILLS = [
  'Intelligence',
  'Discipline',
  'Leadership',
  'Creativity',
  'Fitness',
] as const;

export const DIFFICULTY_XP: Record<string, number> = {
  Easy: 50,
  Medium: 120,
  Hard: 240,
  Boss: 450,
};

export const DIFFICULTY_SKILL_XP: Record<string, number> = {
  Easy: 25,
  Medium: 55,
  Hard: 110,
  Boss: 200,
};

export const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Boss']);
export const VALID_FREQUENCIES = new Set(['daily', 'weekly', 'custom']);
export const VALID_AVATARS = new Set<AvatarId>([
  'cyan-hex',
  'violet-prism',
  'emerald-shield',
  'gold-crown',
  'cyber-visor',
  'orbital-node',
]);

export const MILESTONE_XP = 40;
export const MILESTONE_SKILL_XP = 20;
export const LEADERBOARD_THRESHOLD = 10;

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousLocalDateKey(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return getLocalDateKey(new Date(Date.now() - 86400000));
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() - 1);
  return getLocalDateKey(d);
}

export function getLocalWeekKey(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = local.getDay() || 7;
  local.setDate(local.getDate() + 4 - dayNum);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((local.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${local.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getCycleKeyForFrequency(frequency: string, now: Date = new Date()): string {
  if (frequency === 'daily') return getLocalDateKey(now);
  if (frequency === 'weekly') return getLocalWeekKey(now);
  return 'once';
}

export function getXpRequiredForLevel(level: number): number {
  return Math.round(200 * Math.pow(Math.max(1, level), 1.3));
}

export function computeLevelFromTotalXp(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(totalXp) ? totalXp : 0));
  let level = 1;
  let remaining = safeXp;
  while (remaining >= getXpRequiredForLevel(level)) {
    remaining -= getXpRequiredForLevel(level);
    level += 1;
    if (level > 999) break;
  }
  return {
    level,
    totalXp: safeXp,
    currentLevelXp: remaining,
    xpToNextLevel: getXpRequiredForLevel(level),
  };
}

export function getSkillXpRequiredForLevel(level: number): number {
  return Math.round(100 * Math.pow(Math.max(1, level), 1.25));
}

export function computeSkillLevelFromXp(xp: number) {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  let remaining = safeXp;
  while (remaining >= getSkillXpRequiredForLevel(level)) {
    remaining -= getSkillXpRequiredForLevel(level);
    level += 1;
    if (level > 999) break;
  }
  return {
    level,
    xp: safeXp,
    currentLevelXp: remaining,
    xpToNextLevel: getSkillXpRequiredForLevel(level),
  };
}

interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rarity: string;
  target: number;
  evaluate: (state: ServerUserState) => number;
}

const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  {
    id: 'ach-first-mission',
    title: 'First Protocol',
    description: 'Complete your first mission in STRYDE.',
    rarity: 'Common',
    target: 1,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-five-missions',
    title: 'Momentum Vector',
    description: 'Complete 5 total missions across any category.',
    rarity: 'Common',
    target: 5,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-fifteen-missions',
    title: 'Relentless Operator',
    description: 'Complete 15 total missions and build deep operational rhythm.',
    rarity: 'Rare',
    target: 15,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-streak-3',
    title: 'Streak Ignited',
    description: 'Maintain a 3-day consecutive completion streak.',
    rarity: 'Common',
    target: 3,
    evaluate: (s) => Math.max(s.streak.current, s.streak.longest),
  },
  {
    id: 'ach-streak-7',
    title: 'Iron Consistency',
    description: 'Reach a 7-day consecutive mission completion streak.',
    rarity: 'Epic',
    target: 7,
    evaluate: (s) => Math.max(s.streak.current, s.streak.longest),
  },
  {
    id: 'ach-focus-starter',
    title: 'Neural Lock',
    description: 'Complete at least 1 timed Focus session.',
    rarity: 'Common',
    target: 1,
    evaluate: (s) => s.focusStats.sessionsCompleted,
  },
  {
    id: 'ach-focus-120',
    title: 'Deep Work Sovereign',
    description: 'Accumulate 120 minutes of focused timer execution.',
    rarity: 'Rare',
    target: 120,
    evaluate: (s) => s.focusStats.totalMinutes,
  },
  {
    id: 'ach-boss-slayer',
    title: 'Boss Slayer',
    description: 'Complete a Boss-difficulty milestone mission.',
    rarity: 'Epic',
    target: 1,
    evaluate: (s) => s.completedHistory.filter((h) => h.difficulty === 'Boss').length,
  },
  {
    id: 'ach-polymath',
    title: 'Cybernetic Polymath',
    description: 'Reach Level 2 or higher in all 5 core skills.',
    rarity: 'Legendary',
    target: 5,
    evaluate: (s) => ALL_SKILLS.filter((k) => (s.skills[k]?.level ?? 1) >= 2).length,
  },
  {
    id: 'ach-level-5',
    title: 'Ascendant Tier',
    description: 'Reach Operative Level 5 overall.',
    rarity: 'Legendary',
    target: 5,
    evaluate: (s) => s.profile.level,
  },
];

export function evaluateAchievements(state: ServerUserState, nowIso: string = new Date().toISOString()) {
  const existingMap = new Map(state.achievements.map((a) => [a.id, a]));
  const newlyUnlocked: ServerUserState['achievements'] = [];

  const updated = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const prev = existingMap.get(def.id);
    const rawProgress = Math.max(0, def.evaluate(state));
    const clampedProgress = Math.min(def.target, rawProgress);
    const meetsCondition = rawProgress >= def.target;
    const wasUnlocked = prev?.unlocked ?? false;
    const isNowUnlocked = wasUnlocked || meetsCondition;

    const record = {
      id: def.id,
      title: def.title,
      description: def.description,
      rarity: def.rarity,
      unlocked: isNowUnlocked,
      unlockedAt: isNowUnlocked ? prev?.unlockedAt ?? nowIso : null,
      progressCurrent: isNowUnlocked ? def.target : clampedProgress,
      progressTarget: def.target,
    };

    if (!wasUnlocked && isNowUnlocked) {
      newlyUnlocked.push(record);
    }
    return record;
  });

  return { achievements: updated, newlyUnlocked };
}

export function createCleanUserState(
  displayName: string,
  roleTitle: string = 'Explorer',
  avatarId: AvatarId = 'cyan-hex',
  now: Date = new Date()
): ServerUserState {
  const nowIso = now.toISOString();
  const skills: ServerUserState['skills'] = {};
  for (const cat of ALL_SKILLS) {
    skills[cat] = {
      category: cat,
      ...computeSkillLevelFromXp(0),
      missionsCompleted: 0,
    };
  }

  const draft: ServerUserState = {
    schemaVersion: 2,
    lastSavedAt: nowIso,
    lastSyncedAt: nowIso,
    pendingSyncQueue: [],
    profile: {
      name: displayName,
      roleTitle,
      avatarId,
      leaderboardOptIn: true,
      onboardingCompleted: false,
      tutorialCompleted: false,
      ...computeLevelFromTotalXp(0),
    },
    preferences: {
      themeAccent: 'cyan',
      notifications: 'all',
      celebrationsEnabled: true,
      voiceRepliesEnabled: false,
      dailyMissionGoal: 3,
      weeklyXpGoal: 500,
      dailyFocusGoalMinutes: 25,
      availableMinutesToday: 60,
    },
    missions: [],
    completedHistory: [],
    goalRoadmaps: [],
    achievementJournal: [],
    skills,
    achievements: [],
    streak: {
      current: 0,
      longest: 0,
      lastCompletedDate: null,
      completedDates: [],
    },
    focusStats: {
      totalMinutes: 0,
      sessionsCompleted: 0,
      selectedDurationMinutes: 25,
    },
    jarvisHistory: [
      {
        id: 'j-welcome',
        role: 'assistant',
        content: 'Systems online, Sir. ATLAS is ready to assist.',
        timestamp: nowIso,
      },
    ],
  };

  const { achievements } = evaluateAchievements(draft, nowIso);
  return { ...draft, achievements };
}

export function reconcileStreakForDate(streak: ServerUserState['streak'], now: Date = new Date()) {
  const today = getLocalDateKey(now);
  const yesterday = getPreviousLocalDateKey(today);
  const completedDates = Array.from(new Set(streak.completedDates)).sort();

  if (!streak.lastCompletedDate) {
    return {
      current: 0,
      longest: Math.max(0, streak.longest),
      lastCompletedDate: null,
      completedDates,
    };
  }

  const isActive = streak.lastCompletedDate === today || streak.lastCompletedDate === yesterday;
  return {
    current: isActive ? Math.max(1, streak.current) : 0,
    longest: Math.max(streak.longest, isActive ? streak.current : 0),
    lastCompletedDate: streak.lastCompletedDate,
    completedDates,
  };
}

function applyStreakCompletion(streak: ServerUserState['streak'], now: Date = new Date()) {
  const today = getLocalDateKey(now);
  const yesterday = getPreviousLocalDateKey(today);
  const reconciled = reconcileStreakForDate(streak, now);

  if (reconciled.lastCompletedDate === today) {
    return { streak: reconciled, streakIncremented: false };
  }

  const nextCurrent = reconciled.lastCompletedDate === yesterday ? reconciled.current + 1 : 1;
  const nextLongest = Math.max(reconciled.longest, nextCurrent);
  const nextDates = reconciled.completedDates.includes(today)
    ? reconciled.completedDates
    : [...reconciled.completedDates, today].sort();

  return {
    streak: {
      current: nextCurrent,
      longest: nextLongest,
      lastCompletedDate: today,
      completedDates: nextDates,
    },
    streakIncremented: true,
  };
}

export function applyRecurringResets(state: ServerUserState, now: Date = new Date()) {
  const todayKey = getLocalDateKey(now);
  const weekKey = getLocalWeekKey(now);
  let resetCount = 0;
  let missionsChanged = false;

  const nextMissions = state.missions.map((mission) => {
    if (mission.frequency === 'daily' && mission.lastResetCycleKey !== todayKey) {
      missionsChanged = true;
      if (mission.completed) resetCount += 1;
      return {
        ...mission,
        completed: false,
        xpAwarded: false,
        lastResetCycleKey: todayKey,
        subObjectives: mission.subObjectives.map((sub) => ({ ...sub, completed: false })),
      };
    }
    if (mission.frequency === 'weekly' && mission.lastResetCycleKey !== weekKey) {
      missionsChanged = true;
      if (mission.completed) resetCount += 1;
      return {
        ...mission,
        completed: false,
        xpAwarded: false,
        lastResetCycleKey: weekKey,
        subObjectives: mission.subObjectives.map((sub) => ({ ...sub, completed: false })),
      };
    }
    return mission;
  });

  const nextStreak = reconcileStreakForDate(state.streak, now);
  const streakChanged =
    nextStreak.current !== state.streak.current ||
    nextStreak.longest !== state.streak.longest ||
    nextStreak.lastCompletedDate !== state.streak.lastCompletedDate;

  if (!missionsChanged && !streakChanged) {
    return { state, resetCount: 0, changed: false };
  }

  return {
    state: {
      ...state,
      missions: missionsChanged ? nextMissions : state.missions,
      streak: streakChanged ? nextStreak : state.streak,
    },
    resetCount,
    changed: true,
  };
}

export function toggleMissionCompletion(
  state: ServerUserState,
  missionId: string,
  now: Date = new Date()
) {
  const target = state.missions.find((m) => m.id === missionId);
  if (!target) return null;

  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);
  const currentCycleKey = getCycleKeyForFrequency(target.frequency, now);

  if (target.completed) {
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        lastSyncedAt: nowIso,
        missions: state.missions.map((m) => (m.id === missionId ? { ...m, completed: false } : m)),
      },
      xpGained: 0,
      skillGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      streakIncremented: false,
      duplicatePrevented: false,
      newlyUnlocked: [] as ServerUserState['achievements'],
      historyId: null as string | null,
    };
  }

  const alreadyRewarded =
    target.xpAwarded &&
    (target.frequency === 'custom' || target.lastCompletedCycleKey === currentCycleKey);

  if (alreadyRewarded) {
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        lastSyncedAt: nowIso,
        missions: state.missions.map((m) =>
          m.id === missionId ? { ...m, completed: true, completedAt: nowIso } : m
        ),
      },
      xpGained: 0,
      skillGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      streakIncremented: false,
      duplicatePrevented: true,
      newlyUnlocked: [] as ServerUserState['achievements'],
      historyId: null as string | null,
    };
  }

  const xpGained = DIFFICULTY_XP[target.difficulty] ?? 120;
  const skillGained = DIFFICULTY_SKILL_XP[target.difficulty] ?? 55;
  const oldLevel = state.profile.level;
  const nextLevelCalc = computeLevelFromTotalXp(state.profile.totalXp + xpGained);

  const prevSkill = state.skills[target.category] ?? {
    category: target.category,
    xp: 0,
    level: 1,
    currentLevelXp: 0,
    xpToNextLevel: 100,
    missionsCompleted: 0,
  };
  const nextSkillCalc = computeSkillLevelFromXp(prevSkill.xp + skillGained);
  const nextSkills = {
    ...state.skills,
    [target.category]: {
      category: target.category,
      ...nextSkillCalc,
      missionsCompleted: prevSkill.missionsCompleted + 1,
    },
  };

  const { streak: nextStreak, streakIncremented } = applyStreakCompletion(state.streak, now);
  const historyId = `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const historyRecord = {
    id: historyId,
    missionId: target.id,
    title: target.title,
    category: target.category,
    difficulty: target.difficulty,
    frequency: target.frequency,
    xpEarned: xpGained,
    skillXpEarned: skillGained,
    completedAt: nowIso,
    localDate: todayKey,
  };

  const nextMissions = state.missions.map((m) =>
    m.id === missionId
      ? {
          ...m,
          completed: true,
          xpAwarded: true,
          lastCompletedCycleKey: currentCycleKey,
          lastResetCycleKey: m.frequency === 'custom' ? m.lastResetCycleKey : currentCycleKey,
          completedAt: nowIso,
        }
      : m
  );

  const draftState: ServerUserState = {
    ...state,
    lastSavedAt: nowIso,
    lastSyncedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    missions: nextMissions,
    completedHistory: [historyRecord, ...state.completedHistory],
    skills: nextSkills,
    streak: nextStreak,
  };

  const { achievements, newlyUnlocked } = evaluateAchievements(draftState, nowIso);
  const newJournalEntries: ServerUserState['achievementJournal'] = [];

  if (target.difficulty === 'Boss' || target.difficulty === 'Hard') {
    newJournalEntries.push({
      id: `jr-clear-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'boss_clear',
      title: `${target.difficulty} Mission Cleared: ${target.title}`,
      detail: `${target.category} (+${xpGained} XP)`,
      xpEarned: xpGained,
      category: target.category,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  if (nextLevelCalc.level > oldLevel) {
    newJournalEntries.push({
      id: `jr-lvl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'level_up',
      title: `Reached Operative Level ${nextLevelCalc.level}`,
      detail: `Advanced via "${target.title}"`,
      xpEarned: xpGained,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  newlyUnlocked.forEach((ach, idx) => {
    newJournalEntries.push({
      id: `jr-ach-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'achievement',
      title: `Unlocked: ${ach.title}`,
      detail: ach.description,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  });

  return {
    nextState: {
      ...draftState,
      achievements,
      achievementJournal: [...newJournalEntries, ...state.achievementJournal].slice(0, 150),
    },
    xpGained,
    skillGained,
    leveledUp: nextLevelCalc.level > oldLevel,
    newLevel: nextLevelCalc.level,
    streakIncremented,
    duplicatePrevented: false,
    newlyUnlocked,
    historyId,
  };
}

// Reverses a specific recent history record safely so accidental clicks can be undone without XP drift
export function undoMissionCompletion(
  state: ServerUserState,
  missionId: string,
  historyId: string,
  now: Date = new Date()
) {
  const target = state.missions.find((m) => m.id === missionId);
  const histIdx = state.completedHistory.findIndex(
    (h) => h.id === historyId && h.missionId === missionId
  );
  if (!target || histIdx === -1) return null;

  const hist = state.completedHistory[histIdx];
  const nowIso = now.toISOString();
  const nextTotalXp = Math.max(0, state.profile.totalXp - hist.xpEarned);
  const nextLevelCalc = computeLevelFromTotalXp(nextTotalXp);

  const prevSkill = state.skills[hist.category];
  const nextSkills = prevSkill
    ? {
        ...state.skills,
        [hist.category]: {
          category: hist.category,
          ...computeSkillLevelFromXp(Math.max(0, prevSkill.xp - hist.skillXpEarned)),
          missionsCompleted: Math.max(0, prevSkill.missionsCompleted - 1),
        },
      }
    : state.skills;

  const nextHistory = state.completedHistory.filter((h) => h.id !== historyId);
  const nextMissions = state.missions.map((m) =>
    m.id === missionId
      ? {
          ...m,
          completed: false,
          xpAwarded: false,
          lastCompletedCycleKey: null,
          completedAt: null,
        }
      : m
  );

  // Clean journal entry created alongside that clear if exact match
  const nextJournal = state.achievementJournal.filter(
    (j) =>
      !(
        j.recordedAt === hist.completedAt &&
        (j.kind === 'boss_clear' || j.kind === 'level_up')
      )
  );

  const draft: ServerUserState = {
    ...state,
    lastSavedAt: nowIso,
    lastSyncedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    missions: nextMissions,
    completedHistory: nextHistory,
    achievementJournal: nextJournal,
    skills: nextSkills,
  };

  const { achievements } = evaluateAchievements(draft, nowIso);
  return {
    ...draft,
    achievements,
  };
}

export function completeFocusSession(
  state: ServerUserState,
  durationMinutes: number,
  now: Date = new Date()
) {
  const safeMinutes = Math.max(1, Math.min(180, Math.round(durationMinutes)));
  const xpGained = safeMinutes * 2;
  const skillGained = safeMinutes;
  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);

  const oldLevel = state.profile.level;
  const nextLevelCalc = computeLevelFromTotalXp(state.profile.totalXp + xpGained);

  const prevDiscipline = state.skills['Discipline'] ?? {
    category: 'Discipline',
    xp: 0,
    level: 1,
    currentLevelXp: 0,
    xpToNextLevel: 100,
    missionsCompleted: 0,
  };
  const nextDisciplineCalc = computeSkillLevelFromXp(prevDiscipline.xp + skillGained);

  const historyRecord = {
    id: `hist-focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    missionId: 'focus-timer',
    title: `${safeMinutes}m Focus Sprint`,
    category: 'Discipline',
    difficulty: safeMinutes >= 45 ? 'Hard' : 'Medium',
    frequency: 'custom',
    xpEarned: xpGained,
    skillXpEarned: skillGained,
    completedAt: nowIso,
    localDate: todayKey,
  };

  const draftState: ServerUserState = {
    ...state,
    lastSavedAt: nowIso,
    lastSyncedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    completedHistory: [historyRecord, ...state.completedHistory],
    skills: {
      ...state.skills,
      Discipline: {
        ...prevDiscipline,
        ...nextDisciplineCalc,
      },
    },
    focusStats: {
      ...state.focusStats,
      totalMinutes: state.focusStats.totalMinutes + safeMinutes,
      sessionsCompleted: state.focusStats.sessionsCompleted + 1,
    },
  };

  const { achievements, newlyUnlocked } = evaluateAchievements(draftState, nowIso);
  const newJournalEntries: ServerUserState['achievementJournal'] = [];

  if (safeMinutes >= 25) {
    newJournalEntries.push({
      id: `jr-focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'focus_milestone',
      title: `Completed ${safeMinutes}m Focus Sprint`,
      detail: `Discipline +${skillGained} Skill XP`,
      xpEarned: xpGained,
      category: 'Discipline',
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  if (nextLevelCalc.level > oldLevel) {
    newJournalEntries.push({
      id: `jr-lvl-f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'level_up',
      title: `Reached Operative Level ${nextLevelCalc.level}`,
      detail: `Advanced via ${safeMinutes}m Focus Sprint`,
      xpEarned: xpGained,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  newlyUnlocked.forEach((ach, idx) => {
    newJournalEntries.push({
      id: `jr-ach-f-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'achievement',
      title: `Unlocked: ${ach.title}`,
      detail: ach.description,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  });

  return {
    nextState: {
      ...draftState,
      achievements,
      achievementJournal: [...newJournalEntries, ...state.achievementJournal].slice(0, 150),
    },
    xpGained,
    leveledUp: nextLevelCalc.level > oldLevel,
    newLevel: nextLevelCalc.level,
    newlyUnlocked,
  };
}

export function toggleGoalMilestone(
  state: ServerUserState,
  roadmapId: string,
  milestoneId: string,
  now: Date = new Date()
) {
  const roadmap = state.goalRoadmaps.find((g) => g.id === roadmapId);
  const milestone = roadmap?.milestones.find((m) => m.id === milestoneId);
  if (!roadmap || !milestone) return null;

  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);

  if (milestone.completed) {
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        lastSyncedAt: nowIso,
        goalRoadmaps: state.goalRoadmaps.map((g) =>
          g.id === roadmapId
            ? {
                ...g,
                milestones: g.milestones.map((m) =>
                  m.id === milestoneId ? { ...m, completed: false } : m
                ),
              }
            : g
        ),
      },
      xpGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      newlyUnlocked: [] as ServerUserState['achievements'],
      roadmapTitle: roadmap.title,
      milestoneTitle: milestone.title,
    };
  }

  const shouldAwardXp = !milestone.xpAwarded;
  const xpGained = shouldAwardXp ? MILESTONE_XP : 0;
  const skillGained = shouldAwardXp ? MILESTONE_SKILL_XP : 0;

  const oldLevel = state.profile.level;
  const nextLevelCalc = computeLevelFromTotalXp(state.profile.totalXp + xpGained);

  const prevSkill = state.skills[roadmap.category];
  const nextSkills =
    shouldAwardXp && prevSkill
      ? {
          ...state.skills,
          [roadmap.category]: {
            ...prevSkill,
            ...computeSkillLevelFromXp(prevSkill.xp + skillGained),
          },
        }
      : state.skills;

  const nextRoadmaps = state.goalRoadmaps.map((g) =>
    g.id === roadmapId
      ? {
          ...g,
          milestones: g.milestones.map((m) =>
            m.id === milestoneId
              ? { ...m, completed: true, xpAwarded: true, completedAt: nowIso }
              : m
          ),
        }
      : g
  );

  const draftState: ServerUserState = {
    ...state,
    lastSavedAt: nowIso,
    lastSyncedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    skills: nextSkills,
    goalRoadmaps: nextRoadmaps,
  };

  const { achievements, newlyUnlocked } = evaluateAchievements(draftState, nowIso);
  const newJournalEntries: ServerUserState['achievementJournal'] = [];

  if (shouldAwardXp) {
    newJournalEntries.push({
      id: `jr-ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'milestone',
      title: `Milestone Complete: ${milestone.title}`,
      detail: `Goal "${roadmap.title}" · ${roadmap.category} (+${xpGained} XP)`,
      xpEarned: xpGained,
      category: roadmap.category,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  if (nextLevelCalc.level > oldLevel) {
    newJournalEntries.push({
      id: `jr-lvl-ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'level_up',
      title: `Reached Operative Level ${nextLevelCalc.level}`,
      detail: `Advanced via milestone "${milestone.title}"`,
      xpEarned: xpGained,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  }

  newlyUnlocked.forEach((ach, idx) => {
    newJournalEntries.push({
      id: `jr-ach-ms-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'achievement',
      title: `Unlocked: ${ach.title}`,
      detail: ach.description,
      recordedAt: nowIso,
      localDate: todayKey,
    });
  });

  return {
    nextState: {
      ...draftState,
      achievements,
      achievementJournal: [...newJournalEntries, ...state.achievementJournal].slice(0, 150),
    },
    xpGained,
    leveledUp: nextLevelCalc.level > oldLevel,
    newLevel: nextLevelCalc.level,
    newlyUnlocked,
    roadmapTitle: roadmap.title,
    milestoneTitle: milestone.title,
  };
}

export function computeLeaderboard(db: DatabaseSchema, viewerUserId: string | null) {
  const allUsers = Object.values(db.users).filter((u) => !u.suspended);
  const registeredCount = Object.keys(db.users).length;
  const threshold = db.appConfig?.leaderboardThreshold ?? LEADERBOARD_THRESHOLD;
  const unlocked = registeredCount >= threshold;
  const viewer = viewerUserId ? db.users[viewerUserId] : null;

  if (!unlocked) {
    return {
      unlocked: false,
      registeredCount,
      threshold,
      entries: [],
      myRank: null,
      myEntry: null,
      optedIn: viewer ? viewer.state.profile.leaderboardOptIn : true,
    };
  }

  const eligible = allUsers
    .filter((u) => u.state.profile.leaderboardOptIn !== false)
    .map((u) => ({
      userId: u.id,
      displayName: u.state.profile.name,
      avatarId: u.state.profile.avatarId,
      level: u.state.profile.level,
      totalXp: u.state.profile.totalXp,
      achievementsCount: u.state.achievements.filter((a) => a.unlocked).length,
      createdAt: u.createdAt,
    }))
    .sort((a, b) => {
      if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
      if (b.level !== a.level) return b.level - a.level;
      if (b.achievementsCount !== a.achievementsCount)
        return b.achievementsCount - a.achievementsCount;
      return a.createdAt.localeCompare(b.createdAt);
    });

  let currentRank = 0;
  let lastXp = -1;
  const entries = eligible.map((item, index) => {
    if (item.totalXp !== lastXp) {
      currentRank = index + 1;
      lastXp = item.totalXp;
    }
    return {
      rank: currentRank,
      displayName: item.displayName,
      avatarId: item.avatarId,
      level: item.level,
      totalXp: item.totalXp,
      achievementsCount: item.achievementsCount,
      isCurrentUser: viewerUserId ? item.userId === viewerUserId : false,
    };
  });

  const myEntry = entries.find((e) => e.isCurrentUser) ?? null;

  return {
    unlocked: true,
    registeredCount,
    threshold,
    entries,
    myRank: myEntry ? myEntry.rank : null,
    myEntry,
    optedIn: viewer ? viewer.state.profile.leaderboardOptIn : true,
  };
}
