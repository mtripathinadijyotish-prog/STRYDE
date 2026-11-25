import type {
  AvatarId,
  LeaderboardResponse,
  LifeRpgState,
  MaintenanceStatus,
  Mission,
  SuggestedMissionDraft,
  UserPreferences,
} from '../types/hud';

// Session tokens are held strictly in JS memory; HttpOnly cookies handle refresh rehydration via /api/me & /api/owner/me.
let userToken: string | null = null;
let ownerToken: string | null = null;

export function setUserToken(token: string | null): void {
  userToken = token;
}

export function getUserToken(): string | null {
  return userToken;
}

export function setOwnerToken(token: string | null): void {
  ownerToken = token;
}

export function getOwnerToken(): string | null {
  return ownerToken;
}

export class ApiError extends Error {
  status: number;
  maintenance?: boolean;
  reauthRequired?: boolean;
  sessionExpired?: boolean;
  mfaRequired?: boolean;

  constructor(
    message: string,
    status: number,
    extra?: {
      maintenance?: boolean;
      reauthRequired?: boolean;
      sessionExpired?: boolean;
      mfaRequired?: boolean;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.maintenance = extra?.maintenance;
    this.reauthRequired = extra?.reauthRequired;
    this.sessionExpired = extra?.sessionExpired;
    this.mfaRequired = extra?.mfaRequired;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  tokenOverride?: string | null
): Promise<T> {
  const token = tokenOverride !== undefined ? tokenOverride : userToken;
  const headers: Record<string, string> = {
    'X-Requested-With': 'STRYDE',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const errMsg =
      typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    throw new ApiError(errMsg, res.status, {
      maintenance: Boolean(data.maintenance),
      reauthRequired: Boolean(data.reauthRequired),
      sessionExpired: Boolean(data.sessionExpired),
      mfaRequired: Boolean(data.mfaRequired),
    });
  }

  return data as T;
}

export const api = {
  getStatus: () =>
    requestJson<{
      maintenance: MaintenanceStatus;
      registeredCount: number;
      leaderboardUnlocked: boolean;
      threshold: number;
    }>('/api/status', {}, null),

  register: (payload: {
    email: string;
    password: string;
    displayName: string;
    consentAccepted: boolean;
  }) =>
    requestJson<{ token: string; recoveryKey: string; state: LifeRpgState }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),

  login: (payload: { email: string; password: string }) =>
    requestJson<{ token: string; state: LifeRpgState }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),

  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  recoverPassword: (payload: { email: string; recoveryKey: string; newPassword: string }) =>
    requestJson<{ ok: boolean; newRecoveryKey: string; message: string }>(
      '/api/auth/recover',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),

  regenerateRecoveryKey: (password: string) =>
    requestJson<{ recoveryKey: string }>('/api/auth/recovery-key/regenerate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  deleteAccount: (password: string) =>
    requestJson<{ ok: boolean }>('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),

  getMe: () => requestJson<{ state: LifeRpgState; resetCount: number; token?: string }>('/api/me'),

  exportAccount: () => requestJson<LifeRpgState>('/api/account/export'),

  migrateLocalMissions: (missions: Mission[]) =>
    requestJson<{ importedCount: number; state: LifeRpgState }>(
      '/api/account/migrate-local',
      { method: 'POST', body: JSON.stringify({ missions }) }
    ),

  updateProfile: (payload: {
    name?: string;
    roleTitle?: string;
    avatarId?: AvatarId;
    leaderboardOptIn?: boolean;
    onboardingCompleted?: boolean;
    tutorialCompleted?: boolean;
    selectedFocusMinutes?: number;
    preferences?: Partial<UserPreferences>;
  }) =>
    requestJson<{ state: LifeRpgState }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createMission: (payload: {
    title: string;
    description: string;
    category: string;
    difficulty: string;
    frequency: string;
    deadline: string;
    subObjectives: Array<{ label: string; completed: boolean }>;
  }) =>
    requestJson<{ mission: Mission; state: LifeRpgState }>('/api/missions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  batchCreateMissions: (drafts: SuggestedMissionDraft[], sourceMessageId?: string) =>
    requestJson<{ addedCount: number; state: LifeRpgState }>('/api/missions/batch', {
      method: 'POST',
      body: JSON.stringify({ missions: drafts, sourceMessageId }),
    }),

  restoreMission: (mission: Mission) =>
    requestJson<{ state: LifeRpgState }>('/api/missions/restore', {
      method: 'POST',
      body: JSON.stringify({ mission }),
    }),

  editMission: (
    id: string,
    payload: {
      title: string;
      description: string;
      category: string;
      difficulty: string;
      frequency: string;
      deadline: string;
      subObjectives: Array<{ id?: string; label: string; completed: boolean }>;
    }
  ) =>
    requestJson<{ mission: Mission; state: LifeRpgState }>(`/api/missions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteMission: (id: string) =>
    requestJson<{ deleted: Mission; state: LifeRpgState }>(`/api/missions/${id}`, {
      method: 'DELETE',
    }),

  toggleMission: (id: string) =>
    requestJson<{
      state: LifeRpgState;
      outcome: {
        xpGained: number;
        skillGained: number;
        leveledUp: boolean;
        newLevel: number;
        streakIncremented: boolean;
        duplicatePrevented: boolean;
        newlyUnlocked: Array<{ id: string; title: string; description: string }>;
        historyId: string | null;
      };
    }>(`/api/missions/${id}/toggle`, { method: 'POST' }),

  undoMissionCompletion: (id: string, historyId: string) =>
    requestJson<{ state: LifeRpgState }>(`/api/missions/${id}/undo`, {
      method: 'POST',
      body: JSON.stringify({ historyId }),
    }),

  toggleSubObjective: (missionId: string, subId: string) =>
    requestJson<{ state: LifeRpgState }>(
      `/api/missions/${missionId}/subobjectives/${subId}/toggle`,
      { method: 'POST' }
    ),

  completeFocus: (minutes: number) =>
    requestJson<{
      state: LifeRpgState;
      outcome: {
        xpGained: number;
        leveledUp: boolean;
        newLevel: number;
        newlyUnlocked: Array<{ id: string; title: string; description: string }>;
      };
    }>('/api/focus/complete', {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    }),

  approveSchedule: (
    blocks: Array<{ missionId: string; startLabel: string; endLabel: string }>,
    focusMinutes: number
  ) =>
    requestJson<{ state: LifeRpgState }>('/api/schedule/approve', {
      method: 'POST',
      body: JSON.stringify({ blocks, focusMinutes }),
    }),

  createRoadmap: (payload: {
    title: string;
    description: string;
    category: string;
    targetDate: string;
    milestones: Array<{ title: string; description?: string; targetDate?: string }>;
  }) =>
    requestJson<{ state: LifeRpgState }>('/api/roadmaps', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteRoadmap: (id: string) =>
    requestJson<{ state: LifeRpgState }>(`/api/roadmaps/${id}`, { method: 'DELETE' }),

  addMilestone: (roadmapId: string, payload: { title: string; targetDate?: string }) =>
    requestJson<{ state: LifeRpgState }>(`/api/roadmaps/${roadmapId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleMilestone: (roadmapId: string, milestoneId: string) =>
    requestJson<{
      state: LifeRpgState;
      outcome: {
        xpGained: number;
        leveledUp: boolean;
        newLevel: number;
        newlyUnlocked: Array<{ id: string; title: string; description: string }>;
        milestoneTitle: string;
      };
    }>(`/api/roadmaps/${roadmapId}/milestones/${milestoneId}/toggle`, { method: 'POST' }),

  updateJournalNote: (entryId: string, note: string) =>
    requestJson<{ state: LifeRpgState }>(`/api/journal/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),

  getLeaderboard: () => requestJson<LeaderboardResponse>('/api/leaderboard'),

  submitFeedback: (payload: { category: 'bug' | 'feature' | 'general'; subject: string; message: string }) =>
    requestJson<{ ok: boolean; message: string }>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  clearAtlasHistory: () =>
    requestJson<{ state: LifeRpgState }>('/api/atlas/history', { method: 'DELETE' }),

  atlasChat: (message: string, signal?: AbortSignal) =>
    requestJson<{
      reply: string;
      suggestedMissions: SuggestedMissionDraft[];
      state: LifeRpgState;
    }>('/api/atlas', {
      method: 'POST',
      body: JSON.stringify({ message }),
      signal,
    }),

  atlasBriefing: (availableMinutes: number) =>
    requestJson<{
      headline: string;
      priorities: Array<{ title: string; reason: string; estimatedMinutes: number }>;
      suggestedFocusMinutes: number;
      encouragement: string;
    }>('/api/atlas/briefing', {
      method: 'POST',
      body: JSON.stringify({ availableMinutes }),
    }),

  atlasPlan: (payload: { goal: string; timeframe: string; dailyMinutes: number }) =>
    requestJson<{
      summary: string;
      missions: Array<Omit<SuggestedMissionDraft, 'id' | 'added'>>;
    }>('/api/atlas/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Owner Administration endpoints (strictly isolated token)
  ownerStatus: () =>
    requestJson<{
      configured: boolean;
      mode: 'env' | 'claimed' | 'unclaimed';
      hasPasskeys: boolean;
      prefillEmail?: string;
    }>('/api/owner/status', {}, null),

  ownerMe: () =>
    requestJson<{
      token: string;
      admin: OwnerAdminProfile;
      recentReauthValid: boolean;
      unacknowledgedAlerts: number;
    }>('/api/owner/me', {}, ownerToken),

  ownerClaim: (payload: { email: string; displayName: string; password: string }) =>
    requestJson<{
      token: string;
      admin: OwnerAdminProfile;
      recoveryKey: string;
      verificationCodeNotice: string;
    }>('/api/owner/claim', { method: 'POST', body: JSON.stringify(payload) }, null),

  ownerVerifyEmail: (code: string) =>
    requestJson<{ ok: boolean; admin: OwnerAdminProfile }>(
      '/api/owner/verify-email',
      { method: 'POST', body: JSON.stringify({ code }) },
      ownerToken
    ),

  ownerResendVerification: () =>
    requestJson<{ ok: boolean; verificationCodeNotice: string; message: string }>(
      '/api/owner/resend-verification',
      { method: 'POST' },
      ownerToken
    ),

  ownerLogin: (email: string, password: string) =>
    requestJson<
      | { token: string; admin: OwnerAdminProfile; mfaRequired?: false }
      | { mfaRequired: true; challengeToken: string; methods: string[] }
    >('/api/owner/login', { method: 'POST', body: JSON.stringify({ email, password }) }, null),

  ownerLoginMfa: (challengeToken: string, code: string) =>
    requestJson<{ token: string; admin: OwnerAdminProfile }>(
      '/api/owner/login/mfa',
      { method: 'POST', body: JSON.stringify({ challengeToken, code }) },
      null
    ),

  ownerRecover: (payload: {
    email: string;
    recoveryKey: string;
    mfaCode?: string;
    newPassword: string;
  }) =>
    requestJson<{ ok: boolean; newRecoveryKey: string; message: string }>(
      '/api/owner/recover',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),

  ownerReauth: (payload: { password?: string; totpCode?: string }) =>
    requestJson<{ ok: boolean; recentReauthValid: boolean }>(
      '/api/owner/reauth',
      { method: 'POST', body: JSON.stringify(payload) },
      ownerToken
    ),

  ownerPasskeyRegisterOptions: () =>
    requestJson<Record<string, unknown>>(
      '/api/owner/passkeys/register/options',
      { method: 'POST' },
      ownerToken
    ),

  ownerPasskeyRegisterVerify: (name: string, response: unknown) =>
    requestJson<{ admin: OwnerAdminProfile }>(
      '/api/owner/passkeys/register/verify',
      { method: 'POST', body: JSON.stringify({ name, response }) },
      ownerToken
    ),

  ownerPasskeyAuthOptions: (email?: string) =>
    requestJson<{ challengeId: string; optionsJSON: Record<string, unknown> }>(
      '/api/owner/passkeys/auth/options',
      { method: 'POST', body: JSON.stringify({ email: email || '' }) },
      null
    ),

  ownerPasskeyAuthVerify: (challengeId: string, response: unknown) =>
    requestJson<{ token: string; admin: OwnerAdminProfile }>(
      '/api/owner/passkeys/auth/verify',
      { method: 'POST', body: JSON.stringify({ challengeId, response }) },
      null
    ),

  ownerDeletePasskey: (id: string) =>
    requestJson<{ admin: OwnerAdminProfile }>(
      `/api/owner/passkeys/${id}`,
      { method: 'DELETE' },
      ownerToken
    ),

  ownerMfaSetup: () =>
    requestJson<{ secret: string; otpauthUri: string; qrDataUrl: string }>(
      '/api/owner/mfa/setup',
      { method: 'POST' },
      ownerToken
    ),

  ownerMfaEnable: (code: string) =>
    requestJson<{ admin: OwnerAdminProfile; backupCodes: string[] }>(
      '/api/owner/mfa/enable',
      { method: 'POST', body: JSON.stringify({ code }) },
      ownerToken
    ),

  ownerMfaDisable: () =>
    requestJson<{ admin: OwnerAdminProfile }>(
      '/api/owner/mfa/disable',
      { method: 'POST' },
      ownerToken
    ),

  ownerMfaRegenerateCodes: () =>
    requestJson<{ admin: OwnerAdminProfile; backupCodes: string[] }>(
      '/api/owner/mfa/recovery-codes',
      { method: 'POST' },
      ownerToken
    ),

  ownerRegenerateRecoveryKey: () =>
    requestJson<{ recoveryKey: string }>(
      '/api/owner/recovery-key/regenerate',
      { method: 'POST' },
      ownerToken
    ),

  ownerChangePassword: (currentPassword: string, newPassword: string) =>
    requestJson<{ ok: boolean }>(
      '/api/owner/password',
      { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
      ownerToken
    ),

  ownerSessions: () =>
    requestJson<{ sessions: OwnerSessionInfo[] }>('/api/owner/sessions', {}, ownerToken),

  ownerRevokeAllSessions: (includeCurrent = false) =>
    requestJson<{ ok: boolean; revokedCount: number; signedOut: boolean }>(
      '/api/owner/sessions/revoke-all',
      { method: 'POST', body: JSON.stringify({ includeCurrent }) },
      ownerToken
    ),

  ownerLogout: () =>
    requestJson<{ ok: boolean }>('/api/owner/logout', { method: 'POST' }, ownerToken),

  ownerDashboard: () => requestJson<OwnerDashboardPayload>('/api/owner/dashboard', {}, ownerToken),

  ownerUsers: () => requestJson<{ users: OwnerUserSummary[] }>('/api/owner/users', {}, ownerToken),

  ownerUpdateUser: (id: string, payload: { suspended?: boolean; revokeSessions?: boolean }) =>
    requestJson<{ ok: boolean; suspended: boolean }>(
      `/api/owner/users/${id}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      ownerToken
    ),

  ownerDeleteUser: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/owner/users/${id}`, { method: 'DELETE' }, ownerToken),

  ownerAddAdmin: (payload: { email: string; displayName: string; password: string }) =>
    requestJson<{
      admin: OwnerAdminProfile;
      recoveryKey: string;
      verificationCodeNotice: string;
    }>('/api/owner/admins', { method: 'POST', body: JSON.stringify(payload) }, ownerToken),

  ownerRemoveAdmin: (id: string) =>
    requestJson<{ ok: boolean; admins: OwnerAdminProfile[] }>(
      `/api/owner/admins/${id}`,
      { method: 'DELETE' },
      ownerToken
    ),

  ownerUpdateConfig: (payload: Partial<OwnerAppConfig>) =>
    requestJson<{ appConfig: OwnerAppConfig }>(
      '/api/owner/config',
      { method: 'PATCH', body: JSON.stringify(payload) },
      ownerToken
    ),

  ownerSetMaintenance: (enabled: boolean, message: string) =>
    requestJson<{ maintenance: MaintenanceStatus }>(
      '/api/owner/maintenance',
      { method: 'POST', body: JSON.stringify({ enabled, message }) },
      ownerToken
    ),

  ownerToggleFeedbackStatus: (id: string) =>
    requestJson<{ ok: boolean; status: string }>(
      `/api/owner/feedback/${id}`,
      { method: 'PATCH' },
      ownerToken
    ),

  ownerAcknowledgeAlerts: () =>
    requestJson<{ ok: boolean }>('/api/owner/alerts/ack', { method: 'POST' }, ownerToken),
};

export interface OwnerPasskeyInfo {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface OwnerAdminProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'primary' | 'admin';
  emailVerified: boolean;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  passkeys: OwnerPasskeyInfo[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface OwnerAppConfig {
  aiEnabled: boolean;
  aiModel: 'gemini-4-hydrogen' | 'gemini-4-neon';
  dailyAtlasQuota: number;
  atlasSystemNote: string;
  registrationOpen: boolean;
  leaderboardThreshold: number;
  ownerSessionIdleMinutes: number;
}

export interface OwnerActivityEntry {
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

export interface OwnerSessionInfo {
  id: string;
  current: boolean;
  userAgent: string;
  ipMasked: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface OwnerUserSummary {
  id: string;
  email: string;
  displayName: string;
  level: number;
  totalXp: number;
  missionsCount: number;
  completedCount: number;
  suspended: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface OwnerDashboardPayload {
  admin: OwnerAdminProfile;
  recentReauthValid: boolean;
  admins: OwnerAdminProfile[];
  activeOwnerSessions: number;
  totalRegisteredUsers: number;
  suspendedUsersCount: number;
  activeUsers24h: number;
  activeUsers7d: number;
  leaderboardUnlocked: boolean;
  leaderboardThreshold: number;
  registrationTrend: Array<{ date: string; count: number }>;
  usageStats: {
    totalMissions: number;
    totalCompletedMissions: number;
    totalFocusMinutes: number;
  };
  health: {
    status: string;
    uptimeSeconds: number;
    memoryMb: number;
    geminiConfigured: boolean;
    activeSessionsTotal: number;
  };
  appConfig: OwnerAppConfig;
  maintenance: MaintenanceStatus;
  activityLogs: OwnerActivityEntry[];
  unacknowledgedAlerts: number;
  feedback: Array<{
    id: string;
    category: string;
    subject: string;
    message: string;
    createdAt: string;
    status: string;
  }>;
  errorLog: Array<{
    id: string;
    route: string;
    statusCode: number;
    message: string;
    timestamp: string;
  }>;
}

