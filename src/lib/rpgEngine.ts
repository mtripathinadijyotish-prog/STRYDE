import {
  Achievement,
  AchievementRarity,
  GoalMilestone,
  GoalRoadmap,
  JournalEntry,
  LifeRpgState,
  Mission,
  MissionDifficulty,
  MissionFrequency,
  MissionHistoryRecord,
  SkillCategory,
  SkillProgress,
  StreakState,
} from '../types/hud';

export const CURRENT_SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'chronos_life_rpg_v2';

export const DIFFICULTY_XP: Record<MissionDifficulty, number> = {
  [MissionDifficulty.Easy]: 50,
  [MissionDifficulty.Medium]: 120,
  [MissionDifficulty.Hard]: 240,
  [MissionDifficulty.Boss]: 450,
};

export const DIFFICULTY_SKILL_XP: Record<MissionDifficulty, number> = {
  [MissionDifficulty.Easy]: 25,
  [MissionDifficulty.Medium]: 55,
  [MissionDifficulty.Hard]: 110,
  [MissionDifficulty.Boss]: 200,
};

export const ALL_SKILLS: SkillCategory[] = [
  SkillCategory.Intelligence,
  SkillCategory.Discipline,
  SkillCategory.Leadership,
  SkillCategory.Creativity,
  SkillCategory.Fitness,
];

export const SKILL_DESCRIPTIONS: Record<SkillCategory, string> = {
  [SkillCategory.Intelligence]: 'System architecture, research, coding, and analytical depth.',
  [SkillCategory.Discipline]: 'Daily habits, deep focus sprints, and consistent execution.',
  [SkillCategory.Leadership]: 'Mentorship, strategic planning, and high-trust communication.',
  [SkillCategory.Creativity]: 'Original design, writing, synthesis, and lateral problem solving.',
  [SkillCategory.Fitness]: 'Cardio conditioning, strength training, sleep, and recovery.',
};

// Local date utilities (strictly local timezone, never UTC ISO slice)
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

// Local ISO week key (Monday-start week in local timezone): e.g. "2026-W48"
export function getLocalWeekKey(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = local.getDay() || 7; // Sunday -> 7
  local.setDate(local.getDate() + 4 - dayNum);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((local.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${local.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getCycleKeyForFrequency(frequency: MissionFrequency, now: Date = new Date()): string {
  if (frequency === MissionFrequency.Daily) return getLocalDateKey(now);
  if (frequency === MissionFrequency.Weekly) return getLocalWeekKey(now);
  return 'once';
}

// XP Progression Math
export function getXpRequiredForLevel(level: number): number {
  return Math.round(200 * Math.pow(Math.max(1, level), 1.3));
}

export function computeLevelFromTotalXp(totalXp: number): {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  xpToNextLevel: number;
} {
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

export function computeSkillLevelFromXp(xp: number): {
  level: number;
  xp: number;
  currentLevelXp: number;
  xpToNextLevel: number;
} {
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

// Streak logic: strictly one increment per local calendar day
export function reconcileStreakForDate(streak: StreakState, now: Date = new Date()): StreakState {
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

  // If last completion was today or yesterday, streak remains active; otherwise broken -> 0
  const isActive = streak.lastCompletedDate === today || streak.lastCompletedDate === yesterday;
  return {
    current: isActive ? Math.max(1, streak.current) : 0,
    longest: Math.max(streak.longest, isActive ? streak.current : 0),
    lastCompletedDate: streak.lastCompletedDate,
    completedDates,
  };
}

export function applyStreakCompletion(
  streak: StreakState,
  now: Date = new Date()
): { streak: StreakState; streakIncremented: boolean } {
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

// Achievement definitions & evaluator
interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  target: number;
  evaluate: (state: LifeRpgState) => number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  {
    id: 'ach-first-mission',
    title: 'First Protocol',
    description: 'Complete your first mission in STRYDE.',
    rarity: AchievementRarity.Common,
    target: 1,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-five-missions',
    title: 'Momentum Vector',
    description: 'Complete 5 total missions across any category.',
    rarity: AchievementRarity.Common,
    target: 5,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-fifteen-missions',
    title: 'Relentless Operator',
    description: 'Complete 15 total missions and build deep operational rhythm.',
    rarity: AchievementRarity.Rare,
    target: 15,
    evaluate: (s) => s.completedHistory.length,
  },
  {
    id: 'ach-streak-3',
    title: 'Streak Ignited',
    description: 'Maintain a 3-day consecutive completion streak.',
    rarity: AchievementRarity.Common,
    target: 3,
    evaluate: (s) => Math.max(s.streak.current, s.streak.longest),
  },
  {
    id: 'ach-streak-7',
    title: 'Iron Consistency',
    description: 'Reach a 7-day consecutive mission completion streak.',
    rarity: AchievementRarity.Epic,
    target: 7,
    evaluate: (s) => Math.max(s.streak.current, s.streak.longest),
  },
  {
    id: 'ach-focus-starter',
    title: 'Neural Lock',
    description: 'Complete at least 1 timed Focus session.',
    rarity: AchievementRarity.Common,
    target: 1,
    evaluate: (s) => s.focusStats.sessionsCompleted,
  },
  {
    id: 'ach-focus-120',
    title: 'Deep Work Sovereign',
    description: 'Accumulate 120 minutes of focused timer execution.',
    rarity: AchievementRarity.Rare,
    target: 120,
    evaluate: (s) => s.focusStats.totalMinutes,
  },
  {
    id: 'ach-boss-slayer',
    title: 'Boss Slayer',
    description: 'Complete a Boss-difficulty milestone mission.',
    rarity: AchievementRarity.Epic,
    target: 1,
    evaluate: (s) =>
      s.completedHistory.filter((h) => h.difficulty === MissionDifficulty.Boss).length,
  },
  {
    id: 'ach-polymath',
    title: 'Cybernetic Polymath',
    description: 'Reach Level 2 or higher in all 5 core skills.',
    rarity: AchievementRarity.Legendary,
    target: 5,
    evaluate: (s) => ALL_SKILLS.filter((k) => s.skills[k].level >= 2).length,
  },
  {
    id: 'ach-level-5',
    title: 'Ascendant Tier',
    description: 'Reach Operative Level 5 overall.',
    rarity: AchievementRarity.Legendary,
    target: 5,
    evaluate: (s) => s.profile.level,
  },
];

export function evaluateAchievements(
  state: LifeRpgState,
  nowIso: string = new Date().toISOString()
): { achievements: Achievement[]; newlyUnlocked: Achievement[] } {
  const existingMap = new Map(state.achievements.map((a) => [a.id, a]));
  const newlyUnlocked: Achievement[] = [];

  const updated = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const prev = existingMap.get(def.id);
    const rawProgress = Math.max(0, def.evaluate(state));
    const clampedProgress = Math.min(def.target, rawProgress);
    const meetsCondition = rawProgress >= def.target;
    const wasUnlocked = prev?.unlocked ?? false;
    const isNowUnlocked = wasUnlocked || meetsCondition;

    const record: Achievement = {
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

// Daily & Weekly local-date reset engine
export function applyRecurringResets(
  state: LifeRpgState,
  now: Date = new Date()
): { state: LifeRpgState; resetCount: number; changed: boolean } {
  const todayKey = getLocalDateKey(now);
  const weekKey = getLocalWeekKey(now);
  let resetCount = 0;
  let missionsChanged = false;

  const nextMissions = state.missions.map((mission) => {
    if (mission.frequency === MissionFrequency.Daily) {
      const needsReset = mission.lastResetCycleKey !== todayKey;
      if (needsReset) {
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
    } else if (mission.frequency === MissionFrequency.Weekly) {
      const needsReset = mission.lastResetCycleKey !== weekKey;
      if (needsReset) {
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

// Complete / Uncomplete Mission with strict duplicate reward prevention
export function toggleMissionCompletion(
  state: LifeRpgState,
  missionId: string,
  now: Date = new Date()
): {
  nextState: LifeRpgState;
  xpGained: number;
  skillGained: number;
  leveledUp: boolean;
  newLevel: number;
  streakIncremented: boolean;
  duplicatePrevented: boolean;
  newlyUnlocked: Achievement[];
} {
  const target = state.missions.find((m) => m.id === missionId);
  if (!target) {
    return {
      nextState: state,
      xpGained: 0,
      skillGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      streakIncremented: false,
      duplicatePrevented: false,
      newlyUnlocked: [],
    };
  }

  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);
  const currentCycleKey = getCycleKeyForFrequency(target.frequency, now);

  // Uncompleting: preserve xpAwarded & lastCompletedCycleKey so re-completing cannot duplicate rewards
  if (target.completed) {
    const nextMissions = state.missions.map((m) =>
      m.id === missionId ? { ...m, completed: false } : m
    );
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        missions: nextMissions,
      },
      xpGained: 0,
      skillGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      streakIncremented: false,
      duplicatePrevented: false,
      newlyUnlocked: [],
    };
  }

  // Completing: verify if this mission cycle was already rewarded
  const alreadyRewarded =
    target.xpAwarded &&
    (target.frequency === MissionFrequency.Custom ||
      target.lastCompletedCycleKey === currentCycleKey);

  if (alreadyRewarded) {
    const nextMissions = state.missions.map((m) =>
      m.id === missionId
        ? {
            ...m,
            completed: true,
            completedAt: nowIso,
          }
        : m
    );
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        missions: nextMissions,
      },
      xpGained: 0,
      skillGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      streakIncremented: false,
      duplicatePrevented: true,
      newlyUnlocked: [],
    };
  }

  const xpGained = DIFFICULTY_XP[target.difficulty];
  const skillGained = DIFFICULTY_SKILL_XP[target.difficulty];

  const oldLevel = state.profile.level;
  const nextLevelCalc = computeLevelFromTotalXp(state.profile.totalXp + xpGained);

  const prevSkill = state.skills[target.category];
  const nextSkillCalc = computeSkillLevelFromXp(prevSkill.xp + skillGained);
  const nextSkills: Record<SkillCategory, SkillProgress> = {
    ...state.skills,
    [target.category]: {
      category: target.category,
      xp: nextSkillCalc.xp,
      level: nextSkillCalc.level,
      currentLevelXp: nextSkillCalc.currentLevelXp,
      xpToNextLevel: nextSkillCalc.xpToNextLevel,
      missionsCompleted: prevSkill.missionsCompleted + 1,
    },
  };

  const { streak: nextStreak, streakIncremented } = applyStreakCompletion(state.streak, now);

  const historyRecord: MissionHistoryRecord = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
          lastResetCycleKey:
            m.frequency === MissionFrequency.Custom ? m.lastResetCycleKey : currentCycleKey,
          completedAt: nowIso,
        }
      : m
  );

  const draftState: LifeRpgState = {
    ...state,
    lastSavedAt: nowIso,
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
  const newJournalEntries: JournalEntry[] = [];

  if (target.difficulty === MissionDifficulty.Boss || target.difficulty === MissionDifficulty.Hard) {
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
  };
}

// Award XP & Discipline skill when Focus Timer finishes
export function completeFocusSession(
  state: LifeRpgState,
  durationMinutes: number,
  now: Date = new Date()
): {
  nextState: LifeRpgState;
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
  newlyUnlocked: Achievement[];
} {
  const safeMinutes = Math.max(1, Math.min(180, Math.round(durationMinutes)));
  const xpGained = safeMinutes * 2;
  const skillGained = safeMinutes;
  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);

  const oldLevel = state.profile.level;
  const nextLevelCalc = computeLevelFromTotalXp(state.profile.totalXp + xpGained);

  const prevDiscipline = state.skills[SkillCategory.Discipline];
  const nextDisciplineCalc = computeSkillLevelFromXp(prevDiscipline.xp + skillGained);

  const historyRecord: MissionHistoryRecord = {
    id: `hist-focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    missionId: 'focus-timer',
    title: `${safeMinutes}m Focus Sprint`,
    category: SkillCategory.Discipline,
    difficulty: safeMinutes >= 45 ? MissionDifficulty.Hard : MissionDifficulty.Medium,
    frequency: MissionFrequency.Custom,
    xpEarned: xpGained,
    skillXpEarned: skillGained,
    completedAt: nowIso,
    localDate: todayKey,
  };

  const draftState: LifeRpgState = {
    ...state,
    lastSavedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    completedHistory: [historyRecord, ...state.completedHistory],
    skills: {
      ...state.skills,
      [SkillCategory.Discipline]: {
        ...prevDiscipline,
        xp: nextDisciplineCalc.xp,
        level: nextDisciplineCalc.level,
        currentLevelXp: nextDisciplineCalc.currentLevelXp,
        xpToNextLevel: nextDisciplineCalc.xpToNextLevel,
      },
    },
    focusStats: {
      ...state.focusStats,
      totalMinutes: state.focusStats.totalMinutes + safeMinutes,
      sessionsCompleted: state.focusStats.sessionsCompleted + 1,
    },
  };

  const { achievements, newlyUnlocked } = evaluateAchievements(draftState, nowIso);
  const newJournalEntries: JournalEntry[] = [];

  if (safeMinutes >= 25) {
    newJournalEntries.push({
      id: `jr-focus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'focus_milestone',
      title: `Completed ${safeMinutes}m Focus Sprint`,
      detail: `Discipline +${skillGained} Skill XP`,
      xpEarned: xpGained,
      category: SkillCategory.Discipline,
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

// Validation & normalization for persisted & imported JSON data
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isEnumValue<T extends string>(val: unknown, enumObj: Record<string, T>): val is T {
  return typeof val === 'string' && Object.values(enumObj).includes(val as T);
}

export interface ValidationResult {
  valid: boolean;
  state: LifeRpgState | null;
  errors: string[];
  warnings: string[];
}

export function validateAndNormalizeState(
  raw: unknown,
  fallbackState: LifeRpgState,
  strictImport: boolean = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(raw)) {
    return {
      valid: false,
      state: strictImport ? null : fallbackState,
      errors: ['Backup payload is not a valid JSON object.'],
      warnings,
    };
  }

  if (strictImport) {
    if (!isPlainObject(raw.profile)) errors.push('Missing or invalid "profile" section.');
    if (!Array.isArray(raw.missions)) errors.push('Missing or invalid "missions" array.');
    if (!isPlainObject(raw.skills)) errors.push('Missing or invalid "skills" object.');
    if (errors.length > 0) {
      return { valid: false, state: null, errors, warnings };
    }
  }

  const rawProfile = isPlainObject(raw.profile) ? raw.profile : {};
  if (
    strictImport &&
    (typeof rawProfile.totalXp !== 'number' ||
      !Number.isFinite(rawProfile.totalXp) ||
      rawProfile.totalXp < 0)
  ) {
    return {
      valid: false,
      state: null,
      errors: ['Invalid "profile.totalXp" value in backup file.'],
      warnings,
    };
  }

  const rawTotalXp =
    typeof rawProfile.totalXp === 'number' && Number.isFinite(rawProfile.totalXp)
      ? Math.max(0, rawProfile.totalXp)
      : fallbackState.profile.totalXp;
  const levelCalc = computeLevelFromTotalXp(rawTotalXp);

  const validAvatars = new Set([
    'cyan-hex',
    'violet-prism',
    'emerald-shield',
    'gold-crown',
    'cyber-visor',
    'orbital-node',
  ]);

  const profile = {
    name:
      typeof rawProfile.name === 'string' && rawProfile.name.trim()
        ? rawProfile.name.trim().slice(0, 60)
        : fallbackState.profile.name,
    roleTitle:
      typeof rawProfile.roleTitle === 'string' && rawProfile.roleTitle.trim()
        ? rawProfile.roleTitle.trim().slice(0, 60)
        : fallbackState.profile.roleTitle,
    avatarId:
      typeof rawProfile.avatarId === 'string' && validAvatars.has(rawProfile.avatarId)
        ? (rawProfile.avatarId as LifeRpgState['profile']['avatarId'])
        : fallbackState.profile.avatarId,
    leaderboardOptIn:
      typeof rawProfile.leaderboardOptIn === 'boolean'
        ? rawProfile.leaderboardOptIn
        : fallbackState.profile.leaderboardOptIn,
    onboardingCompleted:
      typeof rawProfile.onboardingCompleted === 'boolean'
        ? rawProfile.onboardingCompleted
        : fallbackState.profile.onboardingCompleted,
    tutorialCompleted:
      typeof rawProfile.tutorialCompleted === 'boolean'
        ? rawProfile.tutorialCompleted
        : fallbackState.profile.tutorialCompleted,
    ...levelCalc,
  };

  // Validate missions
  const missions: Mission[] = [];
  if (Array.isArray(raw.missions)) {
    const seenIds = new Set<string>();
    for (const item of raw.missions) {
      if (!isPlainObject(item) || typeof item.title !== 'string' || !item.title.trim()) {
        warnings.push('Skipped malformed mission entry.');
        continue;
      }
      const id =
        typeof item.id === 'string' && item.id.trim() && !seenIds.has(item.id)
          ? item.id
          : `m-rec-${missions.length}-${Date.now()}`;
      seenIds.add(id);

      const category = isEnumValue(item.category, SkillCategory)
        ? item.category
        : SkillCategory.Discipline;
      const difficulty = isEnumValue(item.difficulty, MissionDifficulty)
        ? item.difficulty
        : MissionDifficulty.Medium;
      const frequency = isEnumValue(item.frequency, MissionFrequency)
        ? item.frequency
        : MissionFrequency.Custom;

      const subObjectives = Array.isArray(item.subObjectives)
        ? item.subObjectives
            .filter((s): s is Record<string, unknown> => isPlainObject(s) && typeof s.label === 'string')
            .map((s, idx) => ({
              id: typeof s.id === 'string' ? s.id : `${id}-sub-${idx}`,
              label: String(s.label).slice(0, 140),
              completed: Boolean(s.completed),
            }))
        : [];

      missions.push({
        id,
        title: item.title.trim().slice(0, 120),
        description:
          typeof item.description === 'string' ? item.description.slice(0, 500) : '',
        category,
        difficulty,
        frequency,
        deadline:
          typeof item.deadline === 'string' && item.deadline.trim()
            ? item.deadline.trim().slice(0, 40)
            : 'No deadline',
        completed: Boolean(item.completed),
        xpAwarded: Boolean(item.xpAwarded),
        lastCompletedCycleKey:
          typeof item.lastCompletedCycleKey === 'string' ? item.lastCompletedCycleKey : null,
        lastResetCycleKey:
          typeof item.lastResetCycleKey === 'string' ? item.lastResetCycleKey : null,
        completedAt: typeof item.completedAt === 'string' ? item.completedAt : null,
        createdAt:
          typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        subObjectives,
      });
    }
    if (strictImport && raw.missions.length > 0 && missions.length === 0) {
      return {
        valid: false,
        state: null,
        errors: ['All mission entries in backup file were invalid or corrupted.'],
        warnings,
      };
    }
  } else {
    missions.push(...fallbackState.missions);
  }

  // Validate completedHistory
  const completedHistory: MissionHistoryRecord[] = [];
  if (Array.isArray(raw.completedHistory)) {
    for (const h of raw.completedHistory) {
      if (!isPlainObject(h) || typeof h.title !== 'string') continue;
      completedHistory.push({
        id:
          typeof h.id === 'string'
            ? h.id
            : `hist-${completedHistory.length}-${Date.now()}`,
        missionId: typeof h.missionId === 'string' ? h.missionId : 'unknown',
        title: h.title.slice(0, 140),
        category: isEnumValue(h.category, SkillCategory)
          ? h.category
          : SkillCategory.Discipline,
        difficulty: isEnumValue(h.difficulty, MissionDifficulty)
          ? h.difficulty
          : MissionDifficulty.Medium,
        frequency: isEnumValue(h.frequency, MissionFrequency)
          ? h.frequency
          : MissionFrequency.Custom,
        xpEarned:
          typeof h.xpEarned === 'number' && Number.isFinite(h.xpEarned)
            ? Math.max(0, h.xpEarned)
            : 0,
        skillXpEarned:
          typeof h.skillXpEarned === 'number' && Number.isFinite(h.skillXpEarned)
            ? Math.max(0, h.skillXpEarned)
            : 0,
        completedAt:
          typeof h.completedAt === 'string' ? h.completedAt : new Date().toISOString(),
        localDate:
          typeof h.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.localDate)
            ? h.localDate
            : getLocalDateKey(),
      });
    }
  } else if (!strictImport) {
    completedHistory.push(...fallbackState.completedHistory);
  }

  // Validate skills
  const rawSkills = isPlainObject(raw.skills) ? raw.skills : {};
  const skills = {} as Record<SkillCategory, SkillProgress>;
  for (const cat of ALL_SKILLS) {
    const rawSkill = isPlainObject(rawSkills[cat]) ? rawSkills[cat] : {};
    const xp =
      typeof rawSkill.xp === 'number' && Number.isFinite(rawSkill.xp)
        ? Math.max(0, rawSkill.xp)
        : fallbackState.skills[cat].xp;
    const calc = computeSkillLevelFromXp(xp);
    const missionsCompleted =
      typeof rawSkill.missionsCompleted === 'number' &&
      Number.isFinite(rawSkill.missionsCompleted)
        ? Math.max(0, Math.floor(rawSkill.missionsCompleted))
        : fallbackState.skills[cat].missionsCompleted;
    skills[cat] = {
      category: cat,
      ...calc,
      missionsCompleted,
    };
  }

  // Validate streak
  const rawStreak = isPlainObject(raw.streak) ? raw.streak : {};
  const completedDates = Array.isArray(rawStreak.completedDates)
    ? rawStreak.completedDates.filter(
        (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      )
    : fallbackState.streak.completedDates;

  const streak = reconcileStreakForDate({
    current:
      typeof rawStreak.current === 'number' && Number.isFinite(rawStreak.current)
        ? Math.max(0, Math.floor(rawStreak.current))
        : fallbackState.streak.current,
    longest:
      typeof rawStreak.longest === 'number' && Number.isFinite(rawStreak.longest)
        ? Math.max(0, Math.floor(rawStreak.longest))
        : fallbackState.streak.longest,
    lastCompletedDate:
      typeof rawStreak.lastCompletedDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(rawStreak.lastCompletedDate)
        ? rawStreak.lastCompletedDate
        : null,
    completedDates,
  });

  // Validate focusStats
  const rawFocus = isPlainObject(raw.focusStats) ? raw.focusStats : {};
  const focusStats = {
    totalMinutes:
      typeof rawFocus.totalMinutes === 'number' && Number.isFinite(rawFocus.totalMinutes)
        ? Math.max(0, Math.floor(rawFocus.totalMinutes))
        : fallbackState.focusStats.totalMinutes,
    sessionsCompleted:
      typeof rawFocus.sessionsCompleted === 'number' &&
      Number.isFinite(rawFocus.sessionsCompleted)
        ? Math.max(0, Math.floor(rawFocus.sessionsCompleted))
        : fallbackState.focusStats.sessionsCompleted,
    selectedDurationMinutes:
      typeof rawFocus.selectedDurationMinutes === 'number' &&
      Number.isFinite(rawFocus.selectedDurationMinutes)
        ? Math.max(1, Math.min(180, Math.floor(rawFocus.selectedDurationMinutes)))
        : 25,
  };

  // Validate jarvisHistory
  const jarvisHistory = Array.isArray(raw.jarvisHistory)
    ? raw.jarvisHistory
        .filter(
          (m): m is Record<string, unknown> =>
            isPlainObject(m) &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        )
        .slice(-40)
        .map((m, i) => ({
          id: typeof m.id === 'string' ? m.id : `j-${i}-${Date.now()}`,
          role: m.role as 'user' | 'assistant',
          content: String(m.content),
          timestamp:
            typeof m.timestamp === 'string' ? m.timestamp : new Date().toISOString(),
        }))
    : fallbackState.jarvisHistory;

  // Preserve existing achievement unlock timestamps if valid
  const rawAchievements = Array.isArray(raw.achievements)
    ? raw.achievements
        .filter((a): a is Record<string, unknown> => isPlainObject(a) && typeof a.id === 'string')
        .map((a) => ({
          id: String(a.id),
          title: typeof a.title === 'string' ? a.title : '',
          description: typeof a.description === 'string' ? a.description : '',
          rarity: isEnumValue(a.rarity, AchievementRarity)
            ? a.rarity
            : AchievementRarity.Common,
          unlocked: Boolean(a.unlocked),
          unlockedAt: typeof a.unlockedAt === 'string' ? a.unlockedAt : null,
          progressCurrent:
            typeof a.progressCurrent === 'number' ? Math.max(0, a.progressCurrent) : 0,
          progressTarget:
            typeof a.progressTarget === 'number' ? Math.max(1, a.progressTarget) : 1,
        }))
    : fallbackState.achievements;

  // Validate preferences (backward-compatible with older backups)
  const rawPrefs = isPlainObject(raw.preferences) ? raw.preferences : {};
  const themeAccent =
    rawPrefs.themeAccent === 'violet' ||
    rawPrefs.themeAccent === 'emerald' ||
    rawPrefs.themeAccent === 'cyan'
      ? rawPrefs.themeAccent
      : fallbackState.preferences.themeAccent;
  const notifications =
    rawPrefs.notifications === 'important' ||
    rawPrefs.notifications === 'muted' ||
    rawPrefs.notifications === 'all'
      ? rawPrefs.notifications
      : fallbackState.preferences.notifications;

  const clampInt = (val: unknown, min: number, max: number, def: number) =>
    typeof val === 'number' && Number.isFinite(val)
      ? Math.max(min, Math.min(max, Math.round(val)))
      : def;

  const preferences = {
    themeAccent,
    notifications,
    celebrationsEnabled:
      typeof rawPrefs.celebrationsEnabled === 'boolean'
        ? rawPrefs.celebrationsEnabled
        : fallbackState.preferences.celebrationsEnabled,
    voiceRepliesEnabled:
      typeof rawPrefs.voiceRepliesEnabled === 'boolean'
        ? rawPrefs.voiceRepliesEnabled
        : fallbackState.preferences.voiceRepliesEnabled,
    dailyMissionGoal: clampInt(rawPrefs.dailyMissionGoal, 1, 20, fallbackState.preferences.dailyMissionGoal),
    weeklyXpGoal: clampInt(rawPrefs.weeklyXpGoal, 100, 10000, fallbackState.preferences.weeklyXpGoal),
    dailyFocusGoalMinutes: clampInt(
      rawPrefs.dailyFocusGoalMinutes,
      10,
      480,
      fallbackState.preferences.dailyFocusGoalMinutes
    ),
    availableMinutesToday: clampInt(
      rawPrefs.availableMinutesToday,
      15,
      600,
      fallbackState.preferences.availableMinutesToday
    ),
  };

  // Validate goalRoadmaps (backward-compatible)
  const goalRoadmaps: GoalRoadmap[] = Array.isArray(raw.goalRoadmaps)
    ? raw.goalRoadmaps
        .filter((g): g is Record<string, unknown> => isPlainObject(g) && typeof g.title === 'string' && g.title.trim().length > 0)
        .slice(0, 30)
        .map((g, gIdx) => {
          const milestones: GoalMilestone[] = Array.isArray(g.milestones)
            ? g.milestones
                .filter((ms): ms is Record<string, unknown> => isPlainObject(ms) && typeof ms.title === 'string' && ms.title.trim().length > 0)
                .slice(0, 30)
                .map((ms, mIdx) => ({
                  id: typeof ms.id === 'string' ? ms.id : `ms-${gIdx}-${mIdx}-${Date.now()}`,
                  title: String(ms.title).trim().slice(0, 140),
                  description: typeof ms.description === 'string' ? ms.description.slice(0, 300) : '',
                  targetDate: typeof ms.targetDate === 'string' && ms.targetDate.trim() ? ms.targetDate.trim().slice(0, 40) : 'Upcoming',
                  completed: Boolean(ms.completed),
                  xpAwarded: Boolean(ms.xpAwarded),
                  completedAt: typeof ms.completedAt === 'string' ? ms.completedAt : null,
                  linkedMissionId: typeof ms.linkedMissionId === 'string' ? ms.linkedMissionId : null,
                }))
            : [];
          return {
            id: typeof g.id === 'string' ? g.id : `road-${gIdx}-${Date.now()}`,
            title: String(g.title).trim().slice(0, 120),
            description: typeof g.description === 'string' ? g.description.slice(0, 400) : '',
            category: isEnumValue(g.category, SkillCategory) ? g.category : SkillCategory.Discipline,
            targetDate: typeof g.targetDate === 'string' && g.targetDate.trim() ? g.targetDate.trim().slice(0, 40) : 'This quarter',
            createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
            milestones,
          };
        })
    : fallbackState.goalRoadmaps;

  // Validate achievementJournal (or reconstruct cleanly from legacy unlocked achievements)
  let achievementJournal: JournalEntry[] = [];
  if (Array.isArray(raw.achievementJournal)) {
    const validKinds = new Set(['achievement', 'level_up', 'milestone', 'boss_clear', 'focus_milestone']);
    achievementJournal = raw.achievementJournal
      .filter((j): j is Record<string, unknown> => isPlainObject(j) && typeof j.title === 'string')
      .slice(0, 150)
      .map((j, idx) => ({
        id: typeof j.id === 'string' ? j.id : `jr-${idx}-${Date.now()}`,
        kind: validKinds.has(String(j.kind))
          ? (j.kind as JournalEntry['kind'])
          : 'milestone',
        title: String(j.title).slice(0, 140),
        detail: typeof j.detail === 'string' ? j.detail.slice(0, 240) : '',
        xpEarned: typeof j.xpEarned === 'number' && Number.isFinite(j.xpEarned) ? Math.max(0, j.xpEarned) : undefined,
        category: isEnumValue(j.category, SkillCategory) ? j.category : undefined,
        note: typeof j.note === 'string' ? j.note.slice(0, 300) : undefined,
        recordedAt: typeof j.recordedAt === 'string' ? j.recordedAt : new Date().toISOString(),
        localDate:
          typeof j.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.localDate)
            ? j.localDate
            : getLocalDateKey(),
      }));
  } else if (strictImport) {
    // Reconstruct chronological milestone journal from imported legacy backup
    rawAchievements
      .filter((a) => a.unlocked)
      .forEach((a, idx) => {
        const at = a.unlockedAt || new Date().toISOString();
        achievementJournal.push({
          id: `jr-imp-ach-${idx}-${a.id}`,
          kind: 'achievement',
          title: `Unlocked: ${a.title}`,
          detail: a.description,
          recordedAt: at,
          localDate: getLocalDateKey(new Date(at)),
        });
      });
    completedHistory
      .filter((h) => h.difficulty === MissionDifficulty.Boss || h.difficulty === MissionDifficulty.Hard)
      .slice(0, 20)
      .forEach((h, idx) => {
        achievementJournal.push({
          id: `jr-imp-hist-${idx}-${h.id}`,
          kind: 'boss_clear',
          title: `${h.difficulty} Mission Cleared: ${h.title}`,
          detail: `${h.category} (+${h.xpEarned} XP)`,
          xpEarned: h.xpEarned,
          category: h.category,
          recordedAt: h.completedAt,
          localDate: h.localDate,
        });
      });
    achievementJournal.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  } else {
    achievementJournal = fallbackState.achievementJournal;
  }

  const pendingSyncQueue = Array.isArray(raw.pendingSyncQueue)
    ? raw.pendingSyncQueue
        .filter(
          (op): op is Record<string, unknown> =>
            isPlainObject(op) && typeof op.id === 'string' && typeof op.action === 'string'
        )
        .slice(-50)
        .map((op) => ({
          id: String(op.id),
          action: String(op.action).slice(0, 80),
          createdAt: typeof op.createdAt === 'string' ? op.createdAt : new Date().toISOString(),
        }))
    : [];

  const baseState: LifeRpgState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lastSavedAt:
      typeof raw.lastSavedAt === 'string' ? raw.lastSavedAt : new Date().toISOString(),
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : null,
    pendingSyncQueue,
    profile,
    preferences,
    missions,
    completedHistory,
    goalRoadmaps,
    achievementJournal,
    skills,
    achievements: rawAchievements,
    streak,
    focusStats,
    jarvisHistory,
  };

  const { state: resetState } = applyRecurringResets(baseState);
  const { achievements } = evaluateAchievements(resetState);

  return {
    valid: true,
    state: {
      ...resetState,
      achievements,
    },
    errors,
    warnings,
  };
}

// Estimated minutes per difficulty for realistic time-budget planning
export const DIFFICULTY_ESTIMATED_MINUTES: Record<MissionDifficulty, number> = {
  [MissionDifficulty.Easy]: 15,
  [MissionDifficulty.Medium]: 35,
  [MissionDifficulty.Hard]: 60,
  [MissionDifficulty.Boss]: 90,
};

export interface DailyBriefingData {
  headline: string;
  recommendedMissions: Array<{
    missionId: string;
    title: string;
    category: SkillCategory;
    difficulty: MissionDifficulty;
    estimatedMinutes: number;
    reason: string;
  }>;
  suggestedFocusMinutes: number;
  totalEstimatedMinutes: number;
  encouragement: string;
}

export function generateLocalDailyBriefing(
  state: LifeRpgState,
  availableMinutes: number
): DailyBriefingData {
  const openMissions = state.missions.filter((m) => !m.completed);
  const todayKey = getLocalDateKey();
  const completedToday = state.completedHistory.filter((h) => h.localDate === todayKey).length;

  const weight = (m: Mission) => {
    let score = 0;
    if (m.deadline.toLowerCase().includes('today') || m.deadline.includes(todayKey)) score += 40;
    if (m.frequency === MissionFrequency.Daily) score += 25;
    if (m.difficulty === MissionDifficulty.Boss) score += 20;
    else if (m.difficulty === MissionDifficulty.Hard) score += 15;
    else if (m.difficulty === MissionDifficulty.Medium) score += 10;
    return score;
  };

  const sorted = [...openMissions].sort((a, b) => weight(b) - weight(a));
  const selected: DailyBriefingData['recommendedMissions'] = [];
  let usedMinutes = 0;

  for (const m of sorted) {
    const est = DIFFICULTY_ESTIMATED_MINUTES[m.difficulty];
    if (selected.length === 0 || usedMinutes + est <= availableMinutes) {
      const reason =
        m.deadline.toLowerCase().includes('today') || m.deadline.includes(todayKey)
          ? `Due ${m.deadline}`
          : m.frequency === MissionFrequency.Daily
            ? 'Daily priority'
            : `${m.difficulty} tier impact`;
      selected.push({
        missionId: m.id,
        title: m.title,
        category: m.category,
        difficulty: m.difficulty,
        estimatedMinutes: est,
        reason,
      });
      usedMinutes += est;
      if (selected.length >= 4) break;
    }
  }

  const suggestedFocusMinutes = availableMinutes >= 90 ? 45 : availableMinutes >= 45 ? 25 : 15;

  const headline =
    openMissions.length === 0
      ? 'All active missions are clear for now. Use a short focus block or add a new goal when ready.'
      : `With ${availableMinutes} minutes available, prioritize ${selected.length} high-leverage mission${selected.length === 1 ? '' : 's'} (~${usedMinutes}m).`;

  const encouragement =
    completedToday >= state.preferences.dailyMissionGoal
      ? `You have already met your daily goal of ${state.preferences.dailyMissionGoal} missions. Maintain a steady pace.`
      : `Complete ${Math.max(1, state.preferences.dailyMissionGoal - completedToday)} more mission${state.preferences.dailyMissionGoal - completedToday === 1 ? '' : 's'} to reach today's personal target.`;

  return {
    headline,
    recommendedMissions: selected,
    suggestedFocusMinutes,
    totalEstimatedMinutes: usedMinutes,
    encouragement,
  };
}

export interface WeeklyReportSummary {
  weekKey: string;
  completedCount: number;
  pendingCount: number;
  xpEarned: number;
  xpGoal: number;
  skillBreakdown: Array<{ category: SkillCategory; xp: number; count: number }>;
  suggestions: string[];
}

export function computeWeeklyReport(
  state: LifeRpgState,
  now: Date = new Date()
): WeeklyReportSummary {
  const weekKey = getLocalWeekKey(now);
  const weekRecords = state.completedHistory.filter((h) => {
    const d = new Date(h.completedAt);
    return !Number.isNaN(d.getTime()) && getLocalWeekKey(d) === weekKey;
  });

  const xpEarned = weekRecords.reduce((sum, r) => sum + r.xpEarned, 0);
  const completedCount = weekRecords.length;
  const pendingCount = state.missions.filter((m) => !m.completed).length;

  const skillMap = new Map<SkillCategory, { xp: number; count: number }>();
  for (const cat of ALL_SKILLS) {
    skillMap.set(cat, { xp: 0, count: 0 });
  }
  for (const r of weekRecords) {
    const cur = skillMap.get(r.category);
    if (cur) {
      cur.xp += r.skillXpEarned;
      cur.count += 1;
    }
  }

  const skillBreakdown = ALL_SKILLS.map((cat) => ({
    category: cat,
    xp: skillMap.get(cat)?.xp ?? 0,
    count: skillMap.get(cat)?.count ?? 0,
  }));

  const lowestSkill = [...skillBreakdown].sort((a, b) => a.xp - b.xp)[0];
  const suggestions: string[] = [];

  if (xpEarned < state.preferences.weeklyXpGoal) {
    const remaining = state.preferences.weeklyXpGoal - xpEarned;
    suggestions.push(
      `You are ${remaining} XP away from your weekly goal (${state.preferences.weeklyXpGoal} XP). Clearing 1–2 medium missions will close most of that gap.`
    );
  } else {
    suggestions.push(
      `Weekly XP target reached (${xpEarned} / ${state.preferences.weeklyXpGoal} XP). Keep sessions sustainable without overextending.`
    );
  }

  if (lowestSkill) {
    suggestions.push(
      `${lowestSkill.category} has the lightest activity this week (${lowestSkill.xp} XP). Consider scheduling one short ${lowestSkill.category} mission.`
    );
  }

  if (pendingCount > 6) {
    suggestions.push(
      `You have ${pendingCount} open missions. Use ATLAS Smart Planner or trim low-value tasks to keep daily execution focused.`
    );
  }

  return {
    weekKey,
    completedCount,
    pendingCount,
    xpEarned,
    xpGoal: state.preferences.weeklyXpGoal,
    skillBreakdown,
    suggestions,
  };
}

export function isDuplicateMissionTitle(title: string, existing: Mission[]): boolean {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return existing.some(
    (m) => m.title.trim().toLowerCase().replace(/\s+/g, ' ') === normalized
  );
}

// Goal Roadmap Milestone Toggle (awards +40 XP & +20 Skill XP strictly once)
export const MILESTONE_XP = 40;
export const MILESTONE_SKILL_XP = 20;

export function toggleGoalMilestone(
  state: LifeRpgState,
  roadmapId: string,
  milestoneId: string,
  now: Date = new Date()
): {
  nextState: LifeRpgState;
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
  newlyUnlocked: Achievement[];
  roadmapTitle: string;
  milestoneTitle: string;
} {
  const roadmap = state.goalRoadmaps.find((g) => g.id === roadmapId);
  const milestone = roadmap?.milestones.find((m) => m.id === milestoneId);

  if (!roadmap || !milestone) {
    return {
      nextState: state,
      xpGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      newlyUnlocked: [],
      roadmapTitle: '',
      milestoneTitle: '',
    };
  }

  const nowIso = now.toISOString();
  const todayKey = getLocalDateKey(now);

  if (milestone.completed) {
    const nextRoadmaps = state.goalRoadmaps.map((g) =>
      g.id === roadmapId
        ? {
            ...g,
            milestones: g.milestones.map((m) =>
              m.id === milestoneId ? { ...m, completed: false } : m
            ),
          }
        : g
    );
    return {
      nextState: {
        ...state,
        lastSavedAt: nowIso,
        goalRoadmaps: nextRoadmaps,
      },
      xpGained: 0,
      leveledUp: false,
      newLevel: state.profile.level,
      newlyUnlocked: [],
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
  const nextSkillCalc = computeSkillLevelFromXp(prevSkill.xp + skillGained);
  const nextSkills = shouldAwardXp
    ? {
        ...state.skills,
        [roadmap.category]: {
          ...prevSkill,
          xp: nextSkillCalc.xp,
          level: nextSkillCalc.level,
          currentLevelXp: nextSkillCalc.currentLevelXp,
          xpToNextLevel: nextSkillCalc.xpToNextLevel,
        },
      }
    : state.skills;

  const nextRoadmaps = state.goalRoadmaps.map((g) =>
    g.id === roadmapId
      ? {
          ...g,
          milestones: g.milestones.map((m) =>
            m.id === milestoneId
              ? {
                  ...m,
                  completed: true,
                  xpAwarded: true,
                  completedAt: nowIso,
                }
              : m
          ),
        }
      : g
  );

  const draftState: LifeRpgState = {
    ...state,
    lastSavedAt: nowIso,
    profile: {
      ...state.profile,
      ...nextLevelCalc,
    },
    skills: nextSkills,
    goalRoadmaps: nextRoadmaps,
  };

  const { achievements, newlyUnlocked } = evaluateAchievements(draftState, nowIso);
  const newJournalEntries: JournalEntry[] = [];

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

// Smart Scheduling Engine: builds realistic chronological time blocks from deadlines & priorities
export interface ScheduledBlock {
  missionId: string;
  title: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  deadline: string;
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
  urgencyLabel: 'Due Today' | 'Daily Habit' | 'This Week' | 'Priority';
}

export interface SmartScheduleResult {
  blocks: ScheduledBlock[];
  totalScheduledMinutes: number;
  deferredCount: number;
}

function formatClockMinutes(totalMinutesFromMidnight: number): string {
  const wrapped = ((totalMinutesFromMidnight % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateSmartSchedule(
  state: LifeRpgState,
  availableMinutes: number,
  startTimeOption: 'now' | '09:00' | '13:00' | '18:00' = 'now',
  now: Date = new Date()
): SmartScheduleResult {
  const openMissions = state.missions.filter((m) => !m.completed);
  const todayKey = getLocalDateKey(now);

  const getUrgencyScore = (m: Mission): { score: number; label: ScheduledBlock['urgencyLabel'] } => {
    const dl = m.deadline.toLowerCase();
    const isToday = dl.includes('today') || dl.includes(todayKey);
    const isWeek = dl.includes('week') || dl.includes('friday') || dl.includes('thursday') || dl.includes('tomorrow');

    let score = 0;
    let label: ScheduledBlock['urgencyLabel'] = 'Priority';
    if (isToday) {
      score += 50;
      label = 'Due Today';
    } else if (m.frequency === MissionFrequency.Daily) {
      score += 35;
      label = 'Daily Habit';
    } else if (isWeek) {
      score += 22;
      label = 'This Week';
    }

    if (m.difficulty === MissionDifficulty.Boss) score += 20;
    else if (m.difficulty === MissionDifficulty.Hard) score += 15;
    else if (m.difficulty === MissionDifficulty.Medium) score += 10;
    else score += 5;

    return { score, label };
  };

  const ranked = [...openMissions]
    .map((m) => ({ mission: m, ...getUrgencyScore(m) }))
    .sort((a, b) => b.score - a.score);

  let cursorMinutes: number;
  if (startTimeOption === 'now') {
    const rawMins = now.getHours() * 60 + now.getMinutes();
    cursorMinutes = Math.ceil(rawMins / 5) * 5;
  } else {
    const [hh, mm] = startTimeOption.split(':').map(Number);
    cursorMinutes = (hh || 9) * 60 + (mm || 0);
  }

  const blocks: ScheduledBlock[] = [];
  let usedMinutes = 0;
  let deferredCount = 0;
  const breakMinutes = 5;

  for (const item of ranked) {
    const m = item.mission;
    const rawEst = DIFFICULTY_ESTIMATED_MINUTES[m.difficulty];
    // Cap individual block realistically to availableMinutes if it's the first item
    const blockDuration =
      blocks.length === 0 ? Math.min(rawEst, Math.max(15, availableMinutes)) : rawEst;
    const overhead = blocks.length > 0 ? breakMinutes : 0;

    if (usedMinutes + overhead + blockDuration <= availableMinutes && blocks.length < 5) {
      cursorMinutes += overhead;
      const startLabel = formatClockMinutes(cursorMinutes);
      cursorMinutes += blockDuration;
      const endLabel = formatClockMinutes(cursorMinutes);
      usedMinutes += overhead + blockDuration;

      blocks.push({
        missionId: m.id,
        title: m.title,
        category: m.category,
        difficulty: m.difficulty,
        deadline: m.deadline,
        startLabel,
        endLabel,
        durationMinutes: blockDuration,
        urgencyLabel: item.label,
      });
    } else {
      deferredCount += 1;
    }
  }

  return {
    blocks,
    totalScheduledMinutes: usedMinutes,
    deferredCount,
  };
}
