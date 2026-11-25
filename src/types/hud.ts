export enum ScreenId {
  Home = 'home',
  Missions = 'missions',
  Progression = 'progression',
  Leaderboard = 'leaderboard',
  Jarvis = 'jarvis',
  DataVault = 'datavault',
}

export enum SkillCategory {
  Intelligence = 'Intelligence',
  Discipline = 'Discipline',
  Leadership = 'Leadership',
  Creativity = 'Creativity',
  Fitness = 'Fitness',
}

export enum MissionDifficulty {
  Easy = 'Easy',
  Medium = 'Medium',
  Hard = 'Hard',
  Boss = 'Boss',
}

export enum MissionFrequency {
  Daily = 'daily',
  Weekly = 'weekly',
  Custom = 'custom',
}

export enum AchievementRarity {
  Common = 'Common',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

export type ThemeAccent = 'cyan' | 'violet' | 'emerald';
export type NotificationPreference = 'all' | 'important' | 'muted';
export type AvatarId =
  | 'cyan-hex'
  | 'violet-prism'
  | 'emerald-shield'
  | 'gold-crown'
  | 'cyber-visor'
  | 'orbital-node';

export interface UserPreferences {
  themeAccent: ThemeAccent;
  notifications: NotificationPreference;
  celebrationsEnabled: boolean;
  voiceRepliesEnabled: boolean;
  dailyMissionGoal: number;
  weeklyXpGoal: number;
  dailyFocusGoalMinutes: number;
  availableMinutesToday: number;
}

export interface PendingSyncOp {
  id: string;
  action: string;
  createdAt: string;
}

export interface SubObjective {
  id: string;
  label: string;
  completed: boolean;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  frequency: MissionFrequency;
  deadline: string;
  completed: boolean;
  xpAwarded: boolean;
  lastCompletedCycleKey: string | null;
  lastResetCycleKey: string | null;
  completedAt: string | null;
  createdAt: string;
  subObjectives: SubObjective[];
}

export interface MissionHistoryRecord {
  id: string;
  missionId: string;
  title: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  frequency: MissionFrequency;
  xpEarned: number;
  skillXpEarned: number;
  completedAt: string;
  localDate: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  completed: boolean;
  xpAwarded: boolean;
  completedAt: string | null;
  linkedMissionId?: string | null;
}

export interface GoalRoadmap {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  targetDate: string;
  createdAt: string;
  milestones: GoalMilestone[];
}

export type JournalEntryKind =
  | 'achievement'
  | 'level_up'
  | 'milestone'
  | 'boss_clear'
  | 'focus_milestone';

export interface JournalEntry {
  id: string;
  kind: JournalEntryKind;
  title: string;
  detail: string;
  xpEarned?: number;
  category?: SkillCategory;
  note?: string;
  recordedAt: string;
  localDate: string;
}

export interface SkillProgress {
  category: SkillCategory;
  xp: number;
  level: number;
  currentLevelXp: number;
  xpToNextLevel: number;
  missionsCompleted: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  unlocked: boolean;
  unlockedAt: string | null;
  progressCurrent: number;
  progressTarget: number;
}

export interface StreakState {
  current: number;
  longest: number;
  lastCompletedDate: string | null;
  completedDates: string[];
}

export interface FocusStats {
  totalMinutes: number;
  sessionsCompleted: number;
  selectedDurationMinutes: number;
}

export interface UserProfile {
  name: string;
  roleTitle: string;
  avatarId: AvatarId;
  leaderboardOptIn: boolean;
  onboardingCompleted: boolean;
  tutorialCompleted: boolean;
  level: number;
  totalXp: number;
  currentLevelXp: number;
  xpToNextLevel: number;
}

export interface SuggestedMissionDraft {
  id: string;
  title: string;
  description: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  frequency: MissionFrequency;
  deadline: string;
  subObjectives: string[];
  added?: boolean;
}

export interface JarvisMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedMissions?: SuggestedMissionDraft[];
}

export interface LifeRpgState {
  schemaVersion: number;
  lastSavedAt: string;
  lastSyncedAt: string | null;
  pendingSyncQueue: PendingSyncOp[];
  profile: UserProfile;
  preferences: UserPreferences;
  missions: Mission[];
  completedHistory: MissionHistoryRecord[];
  goalRoadmaps: GoalRoadmap[];
  achievementJournal: JournalEntry[];
  skills: Record<SkillCategory, SkillProgress>;
  achievements: Achievement[];
  streak: StreakState;
  focusStats: FocusStats;
  jarvisHistory: JarvisMessage[];
}

export interface NotificationBanner {
  id: string;
  title: string;
  detail: string;
  tone: 'cyan' | 'emerald' | 'violet' | 'gold' | 'error';
  celebration?: boolean;
  undoLabel?: string;
  onUndo?: () => void;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  avatarId: AvatarId;
  level: number;
  totalXp: number;
  achievementsCount: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  unlocked: boolean;
  registeredCount: number;
  threshold: number;
  entries: LeaderboardEntry[];
  myRank: number | null;
  myEntry: LeaderboardEntry | null;
  optedIn: boolean;
}

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
}
