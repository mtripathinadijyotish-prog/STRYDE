import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type AvatarId =
  | 'cyan-hex'
  | 'violet-prism'
  | 'emerald-shield'
  | 'gold-crown'
  | 'cyber-visor'
  | 'orbital-node';

export type ThemeAccent = 'cyan' | 'violet' | 'emerald';
export type NotificationPreference = 'all' | 'important' | 'muted';

export interface ServerUserState {
  schemaVersion: number;
  lastSavedAt: string;
  lastSyncedAt: string | null;
  pendingSyncQueue: Array<{ id: string; action: string; createdAt: string }>;
  profile: {
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
  };
  preferences: {
    themeAccent: ThemeAccent;
    notifications: NotificationPreference;
    celebrationsEnabled: boolean;
    voiceRepliesEnabled: boolean;
    dailyMissionGoal: number;
    weeklyXpGoal: number;
    dailyFocusGoalMinutes: number;
    availableMinutesToday: number;
  };
  missions: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    frequency: string;
    deadline: string;
    completed: boolean;
    xpAwarded: boolean;
    lastCompletedCycleKey: string | null;
    lastResetCycleKey: string | null;
    completedAt: string | null;
    createdAt: string;
    subObjectives: Array<{ id: string; label: string; completed: boolean }>;
  }>;
  completedHistory: Array<{
    id: string;
    missionId: string;
    title: string;
    category: string;
    difficulty: string;
    frequency: string;
    xpEarned: number;
    skillXpEarned: number;
    completedAt: string;
    localDate: string;
  }>;
  goalRoadmaps: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    targetDate: string;
    createdAt: string;
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      targetDate: string;
      completed: boolean;
      xpAwarded: boolean;
      completedAt: string | null;
      linkedMissionId?: string | null;
    }>;
  }>;
  achievementJournal: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string;
    xpEarned?: number;
    category?: string;
    note?: string;
    recordedAt: string;
    localDate: string;
  }>;
  skills: Record<
    string,
    {
      category: string;
      xp: number;
      level: number;
      currentLevelXp: number;
      xpToNextLevel: number;
      missionsCompleted: number;
    }
  >;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    rarity: string;
    unlocked: boolean;
    unlockedAt: string | null;
    progressCurrent: number;
    progressTarget: number;
  }>;
  streak: {
    current: number;
    longest: number;
    lastCompletedDate: string | null;
    completedDates: string[];
  };
  focusStats: {
    totalMinutes: number;
    sessionsCompleted: number;
    selectedDurationMinutes: number;
  };
  jarvisHistory: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    suggestedMissions?: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      difficulty: string;
      frequency: string;
      deadline: string;
      subObjectives: string[];
      added?: boolean;
    }>;
  }>;
}

export interface StoredUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  recoveryKeyHash: string;
  consentAcceptedAt: string;
  createdAt: string;
  lastActiveAt: string;
  lastFocusLoggedAt: string | null;
  focusMinutesDate: string | null;
  focusMinutesToday: number;
  suspended?: boolean;
  atlasRequestsDate?: string | null;
  atlasRequestsToday?: number;
  state: ServerUserState;
}

export interface StoredSession {
  tokenHash: string;
  userId: string;
  role: 'user' | 'owner' | 'admin';
  adminId?: string;
  expiresAt: number;
  lastActivityAt: number;
  recentReauthAt?: number;
  userAgent?: string;
  ipMasked?: string;
  createdAt: string;
}

export interface OwnerPasskeyRecord {
  id: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface OwnerAdminRecord {
  id: string;
  email: string;
  displayName: string;
  role: 'primary' | 'admin';
  passwordHash: string | null;
  emailVerified: boolean;
  verificationCodeHash: string | null;
  verificationExpiresAt: number | null;
  totpEnabled: boolean;
  totpSecret: string | null;
  pendingTotpSecret: string | null;
  recoveryKeyHash: string | null;
  recoveryCodesHash: string[];
  passkeys: OwnerPasskeyRecord[];
  failedAttempts: number;
  lockedUntil: number | null;
  knownFingerprints: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AppConfig {
  aiEnabled: boolean;
  aiModel: 'gemini-4-hydrogen' | 'gemini-4-neon';
  dailyAtlasQuota: number;
  atlasSystemNote: string;
  registrationOpen: boolean;
  leaderboardThreshold: number;
  ownerSessionIdleMinutes: number;
}

export interface OwnerActivityLog {
  id: string;
  actorEmail: string;
  event: string;
  outcome: 'success' | 'failure' | 'alert';
  detail: string;
  ipMasked: string;
  suspicious: boolean;
  acknowledged?: boolean;
  timestamp: string;
}

export interface FeedbackRecord {
  id: string;
  userId: string;
  category: 'bug' | 'feature' | 'general';
  subject: string;
  message: string;
  createdAt: string;
  status: 'new' | 'reviewed';
}

export interface ErrorLogRecord {
  id: string;
  route: string;
  statusCode: number;
  message: string;
  timestamp: string;
}

export interface DatabaseSchema {
  owner: {
    email: string;
    passcodeHash: string | null;
    claimedAt: string | null;
  };
  ownerAdmins: OwnerAdminRecord[];
  appConfig: AppConfig;
  ownerActivityLogs: OwnerActivityLog[];
  maintenance: {
    enabled: boolean;
    message: string;
    updatedAt: string | null;
  };
  users: Record<string, StoredUserRecord>;
  sessions: Record<string, StoredSession>;
  feedback: FeedbackRecord[];
  errorLog: ErrorLogRecord[];
  registrationDates: string[];
}

const DEFAULT_OWNER_EMAIL = (process.env.ADMIN_EMAIL || 'mtripathinadijyotish@gmail.com')
  .trim()
  .toLowerCase();

function getDataFilePath(): string {
  const dir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  return path.join(dir, 'chronos-store.json');
}

export function createDefaultAppConfig(): AppConfig {
  return {
    aiEnabled: true,
    aiModel: 'gemini-4-hydrogen',
    dailyAtlasQuota: 40,
    atlasSystemNote: '',
    registrationOpen: true,
    leaderboardThreshold: 10,
    ownerSessionIdleMinutes: 30,
  };
}

function createEmptyDb(): DatabaseSchema {
  return {
    owner: {
      email: DEFAULT_OWNER_EMAIL,
      passcodeHash: null,
      claimedAt: null,
    },
    ownerAdmins: [],
    appConfig: createDefaultAppConfig(),
    ownerActivityLogs: [],
    maintenance: {
      enabled: false,
      message:
        'STRYDE is undergoing scheduled maintenance to improve reliability. Normal access will return shortly.',
      updatedAt: null,
    },
    users: {},
    sessions: {},
    feedback: [],
    errorLog: [],
    registrationDates: [],
  };
}

function normalizeAdminRecord(raw: Partial<OwnerAdminRecord>): OwnerAdminRecord | null {
  if (!raw || typeof raw.email !== 'string' || !raw.email.trim()) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `adm-${crypto.randomUUID()}`,
    email: raw.email.trim().toLowerCase(),
    displayName: typeof raw.displayName === 'string' && raw.displayName.trim() ? raw.displayName.trim() : 'Primary Owner',
    role: raw.role === 'admin' ? 'admin' : 'primary',
    passwordHash: typeof raw.passwordHash === 'string' ? raw.passwordHash : null,
    emailVerified: Boolean(raw.emailVerified),
    verificationCodeHash: typeof raw.verificationCodeHash === 'string' ? raw.verificationCodeHash : null,
    verificationExpiresAt: typeof raw.verificationExpiresAt === 'number' ? raw.verificationExpiresAt : null,
    totpEnabled: Boolean(raw.totpEnabled),
    totpSecret: typeof raw.totpSecret === 'string' ? raw.totpSecret : null,
    pendingTotpSecret: typeof raw.pendingTotpSecret === 'string' ? raw.pendingTotpSecret : null,
    recoveryKeyHash: typeof raw.recoveryKeyHash === 'string' ? raw.recoveryKeyHash : null,
    recoveryCodesHash: Array.isArray(raw.recoveryCodesHash)
      ? raw.recoveryCodesHash.filter((s): s is string => typeof s === 'string')
      : [],
    passkeys: Array.isArray(raw.passkeys) ? raw.passkeys : [],
    failedAttempts: typeof raw.failedAttempts === 'number' ? raw.failedAttempts : 0,
    lockedUntil: typeof raw.lockedUntil === 'number' ? raw.lockedUntil : null,
    knownFingerprints: Array.isArray(raw.knownFingerprints)
      ? raw.knownFingerprints.filter((s): s is string => typeof s === 'string').slice(-10)
      : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    lastLoginAt: typeof raw.lastLoginAt === 'string' ? raw.lastLoginAt : null,
  };
}

let cachedDb: DatabaseSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadDb(): Promise<DatabaseSchema> {
  if (cachedDb) return cachedDb;
  const filePath = getDataFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    const base = createEmptyDb();
    const ownerObj = parsed.owner?.email
      ? {
          email: String(parsed.owner.email).toLowerCase(),
          passcodeHash:
            typeof parsed.owner.passcodeHash === 'string' ? parsed.owner.passcodeHash : null,
          claimedAt: typeof parsed.owner.claimedAt === 'string' ? parsed.owner.claimedAt : null,
        }
      : base.owner;

    const admins: OwnerAdminRecord[] = Array.isArray(parsed.ownerAdmins)
      ? parsed.ownerAdmins
          .map((a) => normalizeAdminRecord(a))
          .filter((a): a is OwnerAdminRecord => Boolean(a))
      : [];

    // Backward-compatible migration: if legacy owner was claimed without ownerAdmins entry
    if (admins.length === 0 && ownerObj.passcodeHash) {
      admins.push({
        id: 'owner-primary',
        email: ownerObj.email,
        displayName: 'Primary Owner',
        role: 'primary',
        passwordHash: ownerObj.passcodeHash,
        emailVerified: true,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        totpEnabled: false,
        totpSecret: null,
        pendingTotpSecret: null,
        recoveryKeyHash: null,
        recoveryCodesHash: [],
        passkeys: [],
        failedAttempts: 0,
        lockedUntil: null,
        knownFingerprints: [],
        createdAt: ownerObj.claimedAt || new Date().toISOString(),
        lastLoginAt: null,
      });
    }

    const rawSessions =
      parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    const normalizedSessions: Record<string, StoredSession> = {};
    for (const [k, s] of Object.entries(rawSessions)) {
      if (!s || typeof s !== 'object') continue;
      normalizedSessions[k] = {
        ...s,
        lastActivityAt:
          typeof s.lastActivityAt === 'number'
            ? s.lastActivityAt
            : s.createdAt
              ? new Date(s.createdAt).getTime() || Date.now()
              : Date.now(),
      };
    }

    const defaultCfg = createDefaultAppConfig();
    const rawCfg = parsed.appConfig;
    const appConfig: AppConfig = {
      aiEnabled: rawCfg && typeof rawCfg.aiEnabled === 'boolean' ? rawCfg.aiEnabled : defaultCfg.aiEnabled,
      aiModel:
        rawCfg?.aiModel === 'gemini-4-neon' ? 'gemini-4-neon' : defaultCfg.aiModel,
      dailyAtlasQuota:
        rawCfg && typeof rawCfg.dailyAtlasQuota === 'number' && rawCfg.dailyAtlasQuota >= 1
          ? Math.min(500, Math.round(rawCfg.dailyAtlasQuota))
          : defaultCfg.dailyAtlasQuota,
      atlasSystemNote:
        rawCfg && typeof rawCfg.atlasSystemNote === 'string'
          ? rawCfg.atlasSystemNote.slice(0, 400)
          : defaultCfg.atlasSystemNote,
      registrationOpen:
        rawCfg && typeof rawCfg.registrationOpen === 'boolean'
          ? rawCfg.registrationOpen
          : defaultCfg.registrationOpen,
      leaderboardThreshold:
        rawCfg &&
        typeof rawCfg.leaderboardThreshold === 'number' &&
        rawCfg.leaderboardThreshold >= 2
          ? Math.min(1000, Math.round(rawCfg.leaderboardThreshold))
          : defaultCfg.leaderboardThreshold,
      ownerSessionIdleMinutes:
        rawCfg &&
        typeof rawCfg.ownerSessionIdleMinutes === 'number' &&
        rawCfg.ownerSessionIdleMinutes >= 5
          ? Math.min(120, Math.round(rawCfg.ownerSessionIdleMinutes))
          : defaultCfg.ownerSessionIdleMinutes,
    };

    cachedDb = {
      owner: ownerObj,
      ownerAdmins: admins,
      appConfig,
      ownerActivityLogs: Array.isArray(parsed.ownerActivityLogs)
        ? parsed.ownerActivityLogs.slice(0, 200)
        : [],
      maintenance: parsed.maintenance
        ? {
            enabled: Boolean(parsed.maintenance.enabled),
            message:
              typeof parsed.maintenance.message === 'string' && parsed.maintenance.message.trim()
                ? parsed.maintenance.message
                : base.maintenance.message,
            updatedAt:
              typeof parsed.maintenance.updatedAt === 'string'
                ? parsed.maintenance.updatedAt
                : null,
          }
        : base.maintenance,
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      sessions: normalizedSessions,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      errorLog: Array.isArray(parsed.errorLog) ? parsed.errorLog : [],
      registrationDates: Array.isArray(parsed.registrationDates) ? parsed.registrationDates : [],
    };
    return cachedDb;
  } catch {
    cachedDb = createEmptyDb();
    await persistDb(cachedDb);
    return cachedDb;
  }
}

export async function persistDb(db: DatabaseSchema): Promise<void> {
  cachedDb = db;
  const filePath = getDataFilePath();
  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  const op = writeQueue.then(async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  });

  writeQueue = op.catch((err) => {
    console.error('Database write error:', err instanceof Error ? err.message : 'Unknown');
  });

  await op;
}

export function resetDbCacheForTests(): void {
  cachedDb = null;
}

// Cryptographic primitives (scrypt + timingSafeEqual + SHA-256 token hashing)
export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(plain: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(plain, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => {
    let out = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  };
  return `STRYDE-${group()}-${group()}-${group()}`;
}
