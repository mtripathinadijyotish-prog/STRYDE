import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  generateRecoveryKey,
  hashSecret,
  hashToken,
  loadDb,
  persistDb,
  verifySecret,
  type AvatarId,
  type DatabaseSchema,
  type ServerUserState,
  type StoredUserRecord,
} from './server/store.ts';
import {
  ALL_SKILLS,
  LEADERBOARD_THRESHOLD,
  VALID_AVATARS,
  VALID_DIFFICULTIES,
  VALID_FREQUENCIES,
  applyRecurringResets,
  completeFocusSession,
  computeLeaderboard,
  createCleanUserState,
  getCycleKeyForFrequency,
  getLocalDateKey,
  getLocalWeekKey,
  getPreviousLocalDateKey,
  toggleGoalMilestone,
  toggleMissionCompletion,
  undoMissionCompletion,
} from './server/rpgServer.ts';
import {
  SESSION_TTL_MS,
  asObj,
  clearSessionCookie,
  createRateLimiter,
  createSessionRecord,
  extractBearerToken,
  isValidEmail,
  sanitizeEmail,
  sanitizeText,
  setSessionCookie,
  verifyMutationOrigin,
} from './server/sessionHelpers.ts';
import { createOwnerRouter, isEmailReservedForOwner } from './server/ownerRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 10;

const authRateLimiter = createRateLimiter(5 * 60_000, 25, 'authentication');
const apiRateLimiter = createRateLimiter(60_000, 150, 'API');
const atlasRateLimiter = createRateLimiter(60_000, 20, 'ATLAS AI');

function sanitizeNum(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : fallback;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

// SSE subscribers for real-time leaderboard unlocks & live rank updates
const sseClients = new Set<Response>();

function broadcastLeaderboardSnapshot(db: DatabaseSchema): void {
  if (sseClients.size === 0) return;
  const registeredCount = Object.keys(db.users).length;
  const threshold = db.appConfig?.leaderboardThreshold ?? LEADERBOARD_THRESHOLD;
  const payload = JSON.stringify({
    registeredCount,
    unlocked: registeredCount >= threshold,
    threshold,
    updatedAt: new Date().toISOString(),
  });

  for (const client of sseClients) {
    try {
      client.write(`event: leaderboard\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function logServerError(
  db: DatabaseSchema,
  route: string,
  statusCode: number,
  message: string
): Promise<void> {
  const safeMsg = sanitizeText(message, 160);
  db.errorLog.unshift({
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    route: sanitizeText(route, 80),
    statusCode,
    message: safeMsg,
    timestamp: new Date().toISOString(),
  });
  db.errorLog = db.errorLog.slice(0, 50);
  await persistDb(db);
}

function createSessionForUser(db: DatabaseSchema, userId: string): string {
  return createSessionRecord(db, { userId, role: 'user' });
}

async function authenticateUser(
  req: Request,
  db: DatabaseSchema
): Promise<{ user: StoredUserRecord; tokenHash: string; rawToken: string } | null> {
  if (!verifyMutationOrigin(req)) return null;
  const rawToken = extractBearerToken(req, 'chronos_session');
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = db.sessions[tokenHash];
  if (!session || session.role !== 'user' || session.expiresAt <= Date.now()) {
    return null;
  }
  const user = db.users[session.userId];
  if (!user || user.suspended) return null;
  const now = Date.now();
  session.lastActivityAt = now;
  // Sliding session renewal when less than half the TTL remains
  if (session.expiresAt - now < SESSION_TTL_MS / 2) {
    session.expiresAt = now + SESSION_TTL_MS;
  }
  return { user, tokenHash, rawToken };
}

function buildAiContextFromUserState(state: ServerUserState) {
  const todayKey = getLocalDateKey();
  const weekKey = getLocalWeekKey();
  const todayRecords = state.completedHistory.filter((h) => h.localDate === todayKey);
  const weeklyRecords = state.completedHistory.filter((h) => {
    const d = new Date(h.completedAt);
    return !Number.isNaN(d.getTime()) && getLocalWeekKey(d) === weekKey;
  });
  const todayMissions = state.missions.filter((m) => m.frequency === 'daily' || !m.completed);

  return {
    localDate: todayKey,
    profile: {
      name: state.profile.name,
      roleTitle: state.profile.roleTitle,
      level: state.profile.level,
      totalXp: state.profile.totalXp,
      currentLevelXp: state.profile.currentLevelXp,
      xpToNextLevel: state.profile.xpToNextLevel,
    },
    streak: {
      current: state.streak.current,
      longest: state.streak.longest,
      lastCompletedDate: state.streak.lastCompletedDate,
    },
    skills: ALL_SKILLS.map((cat) => ({
      name: cat,
      level: state.skills[cat]?.level ?? 1,
      xp: state.skills[cat]?.xp ?? 0,
      xpToNext: state.skills[cat]?.xpToNextLevel ?? 100,
      missionsCompleted: state.skills[cat]?.missionsCompleted ?? 0,
    })),
    missions: state.missions.slice(0, 40).map((m) => ({
      title: m.title,
      category: m.category,
      difficulty: m.difficulty,
      frequency: m.frequency,
      deadline: m.deadline,
      completed: m.completed,
    })),
    progressSummary: {
      todayCompletedCount: todayRecords.length,
      todayTotalCount: todayMissions.length,
      todayXpEarned: todayRecords.reduce((sum, r) => sum + r.xpEarned, 0),
      weeklyCompletedCount: weeklyRecords.length,
      weeklyXpEarned: weeklyRecords.reduce((sum, r) => sum + r.xpEarned, 0),
    },
    achievements: {
      unlockedCount: state.achievements.filter((a) => a.unlocked).length,
      totalCount: state.achievements.length,
      unlockedTitles: state.achievements.filter((a) => a.unlocked).map((a) => a.title),
      nextLockedTitles: state.achievements.filter((a) => !a.unlocked).map((a) => a.title),
    },
    focusStats: {
      totalMinutes: state.focusStats.totalMinutes,
      sessionsCompleted: state.focusStats.sessionsCompleted,
    },
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  // Ensure DB initializes cleanly at startup
  await loadDb();

  // ============================================================================
  // PUBLIC HEALTH, MAINTENANCE STATUS & LIVE LEADERBOARD STREAM
  // ============================================================================
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/status', async (_req: Request, res: Response) => {
    const db = await loadDb();
    const registeredCount = Object.keys(db.users).length;
    const threshold = db.appConfig?.leaderboardThreshold ?? LEADERBOARD_THRESHOLD;
    res.json({
      maintenance: db.maintenance,
      registeredCount,
      leaderboardUnlocked: registeredCount >= threshold,
      threshold,
      registrationOpen: db.appConfig?.registrationOpen ?? true,
    });
  });

  app.get('/api/leaderboard', apiRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const auth = await authenticateUser(req, db);
    res.json(computeLeaderboard(db, auth ? auth.user.id : null));
  });

  app.get('/api/leaderboard/stream', async (req: Request, res: Response) => {
    const db = await loadDb();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const registeredCount = Object.keys(db.users).length;
    const threshold = db.appConfig?.leaderboardThreshold ?? LEADERBOARD_THRESHOLD;
    res.write(
      `event: leaderboard\ndata: ${JSON.stringify({
        registeredCount,
        unlocked: registeredCount >= threshold,
        threshold,
        updatedAt: new Date().toISOString(),
      })}\n\n`
    );

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // ============================================================================
  // AUTHENTICATION, ACCOUNT RECOVERY & ACCOUNT DELETION
  // ============================================================================
  app.post('/api/auth/register', authRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    if (db.maintenance.enabled) {
      res.status(503).json({
        maintenance: true,
        error: db.maintenance.message,
      });
      return;
    }
    if (!db.appConfig.registrationOpen) {
      res.status(403).json({
        error: 'New member registration is currently closed by the administrator.',
      });
      return;
    }

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = sanitizeText(body.displayName, 40) || 'New Member';
    const consentAccepted = Boolean(body.consentAccepted);

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      return;
    }
    if (!consentAccepted) {
      res.status(400).json({
        error: 'Please accept the Terms of Service and Privacy Policy to create an account.',
      });
      return;
    }
    if (isEmailReservedForOwner(db, email)) {
      res.status(403).json({
        error: 'This email is reserved for system administration. Please use a personal email.',
      });
      return;
    }

    const duplicate = Object.values(db.users).some((u) => u.email === email);
    if (duplicate) {
      res.status(409).json({
        error: 'An account with this email already exists. Please log in instead.',
      });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const userId = `usr-${crypto.randomUUID()}`;
    const recoveryKey = generateRecoveryKey();

    const userRecord: StoredUserRecord = {
      id: userId,
      email,
      passwordHash: hashSecret(password),
      recoveryKeyHash: hashSecret(recoveryKey),
      consentAcceptedAt: nowIso,
      createdAt: nowIso,
      lastActiveAt: nowIso,
      lastFocusLoggedAt: null,
      focusMinutesDate: getLocalDateKey(now),
      focusMinutesToday: 0,
      state: createCleanUserState(displayName, 'Explorer', 'cyan-hex', now),
    };

    db.users[userId] = userRecord;
    db.registrationDates.push(getLocalDateKey(now));
    const token = createSessionForUser(db, userId);
    await persistDb(db);
    broadcastLeaderboardSnapshot(db);
    setSessionCookie(req, res, 'chronos_session', token);

    res.status(201).json({
      token,
      recoveryKey,
      state: userRecord.state,
    });
  });

  app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    if (db.maintenance.enabled) {
      res.status(503).json({
        maintenance: true,
        error: db.maintenance.message,
      });
      return;
    }

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Please enter both email and password.' });
      return;
    }

    const user = Object.values(db.users).find((u) => u.email === email);
    if (!user || !verifySecret(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.suspended) {
      res.status(403).json({ error: 'This account has been suspended by an administrator.' });
      return;
    }

    const now = new Date();
    const { state: resetState, changed } = applyRecurringResets(user.state, now);
    user.state = changed ? resetState : user.state;
    user.lastActiveAt = now.toISOString();

    const token = createSessionForUser(db, user.id);
    await persistDb(db);
    setSessionCookie(req, res, 'chronos_session', token);

    res.json({
      token,
      state: user.state,
    });
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const db = await loadDb();
    const rawToken = extractBearerToken(req, 'chronos_session');
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      if (db.sessions[tokenHash]) {
        delete db.sessions[tokenHash];
        await persistDb(db);
      }
    }
    clearSessionCookie(req, res, 'chronos_session');
    res.json({ ok: true });
  });

  app.post('/api/auth/recover', authRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    if (db.maintenance.enabled) {
      res.status(503).json({ maintenance: true, error: db.maintenance.message });
      return;
    }

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const recoveryKey = sanitizeText(body.recoveryKey, 40).toUpperCase();
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!isValidEmail(email) || !recoveryKey) {
      res.status(400).json({ error: 'Please provide your email and personal recovery key.' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const user = Object.values(db.users).find((u) => u.email === email);
    if (!user || !verifySecret(recoveryKey, user.recoveryKeyHash)) {
      res.status(401).json({
        error: 'Recovery verification failed. Check your email and personal recovery key.',
      });
      return;
    }

    const nextRecoveryKey = generateRecoveryKey();
    user.passwordHash = hashSecret(newPassword);
    user.recoveryKeyHash = hashSecret(nextRecoveryKey);
    user.lastActiveAt = new Date().toISOString();

    // Revoke all existing sessions for this account for security
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.userId === user.id) delete db.sessions[k];
    }

    await persistDb(db);
    res.json({
      ok: true,
      newRecoveryKey: nextRecoveryKey,
      message: 'Password reset complete. Save your new recovery key and log in.',
    });
  });

  app.post('/api/auth/recovery-key/regenerate', authRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const auth = await authenticateUser(req, db);
    if (!auth) {
      res.status(401).json({ error: 'Please log in to continue.' });
      return;
    }
    const body = asObj(req.body);
    const currentPassword = typeof body.password === 'string' ? body.password : '';
    if (!verifySecret(currentPassword, auth.user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    const nextRecoveryKey = generateRecoveryKey();
    auth.user.recoveryKeyHash = hashSecret(nextRecoveryKey);
    await persistDb(db);
    res.json({ recoveryKey: nextRecoveryKey });
  });

  app.delete('/api/account', authRateLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const auth = await authenticateUser(req, db);
    if (!auth) {
      res.status(401).json({ error: 'Please log in to delete your account.' });
      return;
    }
    const body = asObj(req.body);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!verifySecret(password, auth.user.passwordHash)) {
      res.status(401).json({ error: 'Password confirmation failed.' });
      return;
    }

    const uid = auth.user.id;
    delete db.users[uid];
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.userId === uid) delete db.sessions[k];
    }
    await persistDb(db);
    broadcastLeaderboardSnapshot(db);
    clearSessionCookie(req, res, 'chronos_session');
    res.json({ ok: true });
  });

  // Middleware helper for authenticated user actions
  const requireUser = async (req: Request, res: Response) => {
    const db = await loadDb();
    if (db.maintenance.enabled) {
      res.status(503).json({ maintenance: true, error: db.maintenance.message });
      return null;
    }
    const auth = await authenticateUser(req, db);
    if (!auth) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return null;
    }
    auth.user.lastActiveAt = new Date().toISOString();
    return { db, user: auth.user, rawToken: auth.rawToken };
  };

  // ============================================================================
  // USER STATE, PROFILE, ONBOARDING, MIGRATION, EXPORT
  // ============================================================================
  app.get('/api/me', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user, rawToken } = ctx;
    const { state: resetState, resetCount, changed } = applyRecurringResets(user.state, new Date());
    if (changed) {
      user.state = resetState;
    }
    await persistDb(db);
    res.json({
      state: user.state,
      resetCount,
      token: rawToken,
    });
  });

  app.get('/api/account/export', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    res.json(ctx.user.state);
  });

  app.patch('/api/profile', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);

    const prevName = user.state.profile.name;
    const prevOptIn = user.state.profile.leaderboardOptIn;

    if (typeof body.name === 'string') {
      const cleanName = sanitizeText(body.name, 40);
      if (!cleanName) {
        res.status(400).json({ error: 'Display name cannot be empty.' });
        return;
      }
      user.state.profile.name = cleanName;
    }
    if (typeof body.roleTitle === 'string') {
      user.state.profile.roleTitle = sanitizeText(body.roleTitle, 40) || 'Explorer';
    }
    if (typeof body.avatarId === 'string' && VALID_AVATARS.has(body.avatarId as AvatarId)) {
      user.state.profile.avatarId = body.avatarId as AvatarId;
    }
    if (typeof body.leaderboardOptIn === 'boolean') {
      user.state.profile.leaderboardOptIn = body.leaderboardOptIn;
    }
    if (typeof body.onboardingCompleted === 'boolean') {
      user.state.profile.onboardingCompleted = body.onboardingCompleted;
    }
    if (typeof body.tutorialCompleted === 'boolean') {
      user.state.profile.tutorialCompleted = body.tutorialCompleted;
    }
    if (typeof body.selectedFocusMinutes === 'number' && Number.isFinite(body.selectedFocusMinutes)) {
      user.state.focusStats.selectedDurationMinutes = Math.max(
        1,
        Math.min(180, Math.round(body.selectedFocusMinutes))
      );
    }

    if (body.preferences && typeof body.preferences === 'object') {
      const p = asObj(body.preferences);
      if (p.themeAccent === 'cyan' || p.themeAccent === 'violet' || p.themeAccent === 'emerald') {
        user.state.preferences.themeAccent = p.themeAccent;
      }
      if (p.notifications === 'all' || p.notifications === 'important' || p.notifications === 'muted') {
        user.state.preferences.notifications = p.notifications;
      }
      if (typeof p.celebrationsEnabled === 'boolean') {
        user.state.preferences.celebrationsEnabled = p.celebrationsEnabled;
      }
      if (typeof p.voiceRepliesEnabled === 'boolean') {
        user.state.preferences.voiceRepliesEnabled = p.voiceRepliesEnabled;
      }
      if (typeof p.dailyMissionGoal === 'number' && Number.isFinite(p.dailyMissionGoal)) {
        user.state.preferences.dailyMissionGoal = Math.max(1, Math.min(20, Math.round(p.dailyMissionGoal)));
      }
      if (typeof p.weeklyXpGoal === 'number' && Number.isFinite(p.weeklyXpGoal)) {
        user.state.preferences.weeklyXpGoal = Math.max(100, Math.min(10000, Math.round(p.weeklyXpGoal)));
      }
      if (typeof p.dailyFocusGoalMinutes === 'number' && Number.isFinite(p.dailyFocusGoalMinutes)) {
        user.state.preferences.dailyFocusGoalMinutes = Math.max(
          10,
          Math.min(480, Math.round(p.dailyFocusGoalMinutes))
        );
      }
      if (typeof p.availableMinutesToday === 'number' && Number.isFinite(p.availableMinutesToday)) {
        user.state.preferences.availableMinutesToday = Math.max(
          15,
          Math.min(600, Math.round(p.availableMinutesToday))
        );
      }
    }

    const nowIso = new Date().toISOString();
    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);

    if (
      user.state.profile.name !== prevName ||
      user.state.profile.leaderboardOptIn !== prevOptIn
    ) {
      broadcastLeaderboardSnapshot(db);
    }

    res.json({ state: user.state });
  });

  // Safe local mission/roadmap migration without accepting arbitrary client XP totals
  app.post('/api/account/migrate-local', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const rawMissions = Array.isArray(body.missions) ? body.missions.slice(0, 40) : [];
    const now = new Date();
    const nowIso = now.toISOString();

    let importedCount = 0;
    const existingTitles = new Set(
      user.state.missions.map((m) => m.title.trim().toLowerCase())
    );

    for (const item of rawMissions) {
      const m = asObj(item);
      const title = sanitizeText(m.title, 120);
      if (!title || existingTitles.has(title.toLowerCase())) continue;
      existingTitles.add(title.toLowerCase());

      const category = ALL_SKILLS.includes(m.category as (typeof ALL_SKILLS)[number])
        ? String(m.category)
        : 'Discipline';
      const difficulty = VALID_DIFFICULTIES.has(String(m.difficulty))
        ? String(m.difficulty)
        : 'Medium';
      const frequency = VALID_FREQUENCIES.has(String(m.frequency))
        ? String(m.frequency)
        : 'custom';
      const subObjectives = Array.isArray(m.subObjectives)
        ? m.subObjectives.slice(0, 12).map((s, idx) => {
            const sub = asObj(s);
            return {
              id: `sub-mig-${Date.now()}-${idx}`,
              label: sanitizeText(sub.label, 140) || `Step ${idx + 1}`,
              completed: false,
            };
          })
        : [];

      user.state.missions.unshift({
        id: `m-mig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description: sanitizeText(m.description, 500),
        category,
        difficulty,
        frequency,
        deadline: sanitizeText(m.deadline, 40) || 'Today',
        completed: false,
        xpAwarded: false,
        lastCompletedCycleKey: null,
        lastResetCycleKey:
          frequency === 'custom' ? null : getCycleKeyForFrequency(frequency, now),
        completedAt: null,
        createdAt: nowIso,
        subObjectives,
      });
      importedCount += 1;
    }

    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.json({ importedCount, state: user.state });
  });

  // ============================================================================
  // SERVER-AUTHORITATIVE MISSIONS, UNDO, FOCUS, ROADMAPS & JOURNAL
  // ============================================================================
  app.post('/api/missions', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);

    const title = sanitizeText(body.title, 120);
    if (!title) {
      res.status(400).json({ error: 'Mission title is required.' });
      return;
    }

    const category = ALL_SKILLS.includes(body.category as (typeof ALL_SKILLS)[number])
      ? String(body.category)
      : 'Discipline';
    const difficulty = VALID_DIFFICULTIES.has(String(body.difficulty))
      ? String(body.difficulty)
      : 'Medium';
    const frequency = VALID_FREQUENCIES.has(String(body.frequency))
      ? String(body.frequency)
      : 'daily';
    const deadline = sanitizeText(body.deadline, 40) || 'Today';
    const description = sanitizeText(body.description, 500);
    const subObjectives = Array.isArray(body.subObjectives)
      ? body.subObjectives
          .slice(0, 15)
          .map((s, idx) => {
            const sub = typeof s === 'string' ? { label: s } : asObj(s);
            const label = sanitizeText(sub.label, 140);
            if (!label) return null;
            return {
              id: `sub-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
              label,
              completed: Boolean(sub.completed),
            };
          })
          .filter((s): s is { id: string; label: string; completed: boolean } => Boolean(s))
      : [];

    const now = new Date();
    const nowIso = now.toISOString();
    const newMission = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description,
      category,
      difficulty,
      frequency,
      deadline,
      completed: false,
      xpAwarded: false,
      lastCompletedCycleKey: null,
      lastResetCycleKey: frequency === 'custom' ? null : getCycleKeyForFrequency(frequency, now),
      completedAt: null,
      createdAt: nowIso,
      subObjectives,
    };

    user.state.missions.unshift(newMission);
    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.status(201).json({ mission: newMission, state: user.state });
  });

  app.post('/api/missions/batch', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const rawList = Array.isArray(body.missions) ? body.missions.slice(0, 10) : [];
    const sourceMessageId = sanitizeText(body.sourceMessageId, 80);
    const now = new Date();
    const nowIso = now.toISOString();
    const existingTitles = new Set(user.state.missions.map((m) => m.title.trim().toLowerCase()));
    const approvedDraftIds = new Set<string>();
    const approvedDraftTitles = new Set<string>();
    let addedCount = 0;

    for (const item of rawList) {
      const m = asObj(item);
      const draftId = sanitizeText(m.id, 80);
      const title = sanitizeText(m.title, 120);
      if (!title) continue;
      if (draftId) approvedDraftIds.add(draftId);
      approvedDraftTitles.add(title.toLowerCase());
      if (existingTitles.has(title.toLowerCase())) continue;
      existingTitles.add(title.toLowerCase());
      const category = ALL_SKILLS.includes(m.category as (typeof ALL_SKILLS)[number])
        ? String(m.category)
        : 'Discipline';
      const difficulty = VALID_DIFFICULTIES.has(String(m.difficulty))
        ? String(m.difficulty)
        : 'Medium';
      const frequency = VALID_FREQUENCIES.has(String(m.frequency))
        ? String(m.frequency)
        : 'daily';
      const subObjectives = Array.isArray(m.subObjectives)
        ? m.subObjectives
            .slice(0, 10)
            .map((label, idx) => {
              const clean = sanitizeText(label, 140);
              return clean
                ? { id: `sub-b-${Date.now()}-${idx}`, label: clean, completed: false }
                : null;
            })
            .filter((s): s is { id: string; label: string; completed: boolean } => Boolean(s))
        : [];

      user.state.missions.unshift({
        id: `m-atlas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        description: sanitizeText(m.description, 500),
        category,
        difficulty,
        frequency,
        deadline: sanitizeText(m.deadline, 40) || 'Today',
        completed: false,
        xpAwarded: false,
        lastCompletedCycleKey: null,
        lastResetCycleKey: frequency === 'custom' ? null : getCycleKeyForFrequency(frequency, now),
        completedAt: null,
        createdAt: nowIso,
        subObjectives,
      });
      addedCount += 1;
    }

    if (sourceMessageId) {
      user.state.jarvisHistory = user.state.jarvisHistory.map((msg) => {
        if (msg.id !== sourceMessageId || !Array.isArray(msg.suggestedMissions)) {
          return msg;
        }
        return {
          ...msg,
          suggestedMissions: msg.suggestedMissions.map((draft) =>
            approvedDraftIds.has(draft.id) ||
            approvedDraftTitles.has(draft.title.trim().toLowerCase())
              ? { ...draft, added: true }
              : draft
          ),
        };
      });
    }

    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.status(201).json({ addedCount, state: user.state });
  });

  app.post('/api/missions/restore', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const m = asObj(body.mission);
    const id = sanitizeText(m.id, 60);
    const title = sanitizeText(m.title, 120);
    if (!id || !title) {
      res.status(400).json({ error: 'Invalid mission payload to restore.' });
      return;
    }
    if (!user.state.missions.some((existing) => existing.id === id)) {
      user.state.missions.unshift({
        id,
        title,
        description: sanitizeText(m.description, 500),
        category: ALL_SKILLS.includes(m.category as (typeof ALL_SKILLS)[number])
          ? String(m.category)
          : 'Discipline',
        difficulty: VALID_DIFFICULTIES.has(String(m.difficulty))
          ? String(m.difficulty)
          : 'Medium',
        frequency: VALID_FREQUENCIES.has(String(m.frequency))
          ? String(m.frequency)
          : 'custom',
        deadline: sanitizeText(m.deadline, 40) || 'Today',
        completed: Boolean(m.completed),
        xpAwarded: Boolean(m.xpAwarded),
        lastCompletedCycleKey:
          typeof m.lastCompletedCycleKey === 'string' ? m.lastCompletedCycleKey : null,
        lastResetCycleKey:
          typeof m.lastResetCycleKey === 'string' ? m.lastResetCycleKey : null,
        completedAt: typeof m.completedAt === 'string' ? m.completedAt : null,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
        subObjectives: Array.isArray(m.subObjectives)
          ? m.subObjectives.slice(0, 15).map((s, idx) => {
              const sub = asObj(s);
              return {
                id: sanitizeText(sub.id, 60) || `sub-res-${idx}`,
                label: sanitizeText(sub.label, 140),
                completed: Boolean(sub.completed),
              };
            })
          : [],
      });
      await persistDb(db);
    }
    res.json({ state: user.state });
  });

  app.patch('/api/missions/:id', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const target = user.state.missions.find((m) => m.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Mission not found.' });
      return;
    }

    const body = asObj(req.body);
    if (typeof body.title === 'string') {
      const cleanTitle = sanitizeText(body.title, 120);
      if (!cleanTitle) {
        res.status(400).json({ error: 'Mission title cannot be empty.' });
        return;
      }
      target.title = cleanTitle;
    }
    if (typeof body.description === 'string') {
      target.description = sanitizeText(body.description, 500);
    }
    if (typeof body.category === 'string' && ALL_SKILLS.includes(body.category as (typeof ALL_SKILLS)[number])) {
      target.category = body.category;
    }
    if (typeof body.difficulty === 'string' && VALID_DIFFICULTIES.has(body.difficulty)) {
      target.difficulty = body.difficulty;
    }
    if (typeof body.frequency === 'string' && VALID_FREQUENCIES.has(body.frequency)) {
      target.frequency = body.frequency;
    }
    if (typeof body.deadline === 'string') {
      target.deadline = sanitizeText(body.deadline, 40) || 'Today';
    }
    if (Array.isArray(body.subObjectives)) {
      target.subObjectives = body.subObjectives
        .slice(0, 15)
        .map((s, idx) => {
          const sub = asObj(s);
          const label = sanitizeText(sub.label, 140);
          if (!label) return null;
          return {
            id: sanitizeText(sub.id, 60) || `sub-${Date.now()}-${idx}`,
            label,
            completed: Boolean(sub.completed),
          };
        })
        .filter((s): s is { id: string; label: string; completed: boolean } => Boolean(s));
    }

    const nowIso = new Date().toISOString();
    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.json({ mission: target, state: user.state });
  });

  app.delete('/api/missions/:id', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const deleted = user.state.missions.find((m) => m.id === req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Mission not found.' });
      return;
    }
    user.state.missions = user.state.missions.filter((m) => m.id !== req.params.id);
    const nowIso = new Date().toISOString();
    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.json({ deleted, state: user.state });
  });

  app.post('/api/missions/:id/toggle', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const outcome = toggleMissionCompletion(user.state, req.params.id, new Date());
    if (!outcome) {
      res.status(404).json({ error: 'Mission not found.' });
      return;
    }
    user.state = outcome.nextState;
    await persistDb(db);
    if (outcome.xpGained > 0) {
      broadcastLeaderboardSnapshot(db);
    }
    res.json({
      state: user.state,
      outcome: {
        xpGained: outcome.xpGained,
        skillGained: outcome.skillGained,
        leveledUp: outcome.leveledUp,
        newLevel: outcome.newLevel,
        streakIncremented: outcome.streakIncremented,
        duplicatePrevented: outcome.duplicatePrevented,
        newlyUnlocked: outcome.newlyUnlocked,
        historyId: outcome.historyId,
      },
    });
  });

  app.post('/api/missions/:id/undo', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const historyId = sanitizeText(body.historyId, 80);
    if (!historyId) {
      res.status(400).json({ error: 'Missing completion reference to undo.' });
      return;
    }
    const nextState = undoMissionCompletion(user.state, req.params.id, historyId, new Date());
    if (!nextState) {
      res.status(404).json({ error: 'Completion record could not be undone.' });
      return;
    }
    user.state = nextState;
    await persistDb(db);
    broadcastLeaderboardSnapshot(db);
    res.json({ state: user.state });
  });

  app.post(
    '/api/missions/:id/subobjectives/:subId/toggle',
    apiRateLimiter,
    async (req: Request, res: Response) => {
      const ctx = await requireUser(req, res);
      if (!ctx) return;
      const { db, user } = ctx;
      const target = user.state.missions.find((m) => m.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Mission not found.' });
        return;
      }
      target.subObjectives = target.subObjectives.map((s) =>
        s.id === req.params.subId ? { ...s, completed: !s.completed } : s
      );
      user.state.lastSavedAt = new Date().toISOString();
      await persistDb(db);
      res.json({ state: user.state });
    }
  );

  app.post('/api/focus/complete', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const minutes = Math.round(Number(body.minutes));

    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
      res.status(400).json({ error: 'Focus duration must be between 1 and 180 minutes.' });
      return;
    }

    const now = new Date();
    const todayKey = getLocalDateKey(now);

    // Server-side anti-cheat cooldown & daily focus XP cap
    if (user.lastFocusLoggedAt) {
      const elapsedMs = now.getTime() - new Date(user.lastFocusLoggedAt).getTime();
      if (elapsedMs < 5_000) {
        res.status(429).json({ error: 'Please allow your focus session timer to finish normally.' });
        return;
      }
    }
    if (user.focusMinutesDate !== todayKey) {
      user.focusMinutesDate = todayKey;
      user.focusMinutesToday = 0;
    }
    if (user.focusMinutesToday + minutes > 480) {
      res.status(400).json({ error: 'Daily focus XP cap (480 minutes) reached for today.' });
      return;
    }

    const outcome = completeFocusSession(user.state, minutes, now);
    user.state = outcome.nextState;
    user.lastFocusLoggedAt = now.toISOString();
    user.focusMinutesToday += minutes;
    await persistDb(db);
    broadcastLeaderboardSnapshot(db);

    res.json({
      state: user.state,
      outcome: {
        xpGained: outcome.xpGained,
        leveledUp: outcome.leveledUp,
        newLevel: outcome.newLevel,
        newlyUnlocked: outcome.newlyUnlocked,
      },
    });
  });

  // Goal Roadmap routes
  app.post('/api/roadmaps', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const title = sanitizeText(body.title, 120);
    if (!title) {
      res.status(400).json({ error: 'Goal title is required.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const milestones = Array.isArray(body.milestones)
      ? body.milestones
          .slice(0, 20)
          .map((m, idx) => {
            const ms = typeof m === 'string' ? { title: m } : asObj(m);
            const msTitle = sanitizeText(ms.title, 140);
            if (!msTitle) return null;
            return {
              id: `ms-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
              title: msTitle,
              description: sanitizeText(ms.description, 300),
              targetDate: sanitizeText(ms.targetDate, 40) || 'Upcoming',
              completed: false,
              xpAwarded: false,
              completedAt: null,
              linkedMissionId: null,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
      : [];

    const roadmap = {
      id: `road-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      description: sanitizeText(body.description, 400),
      category: ALL_SKILLS.includes(body.category as (typeof ALL_SKILLS)[number])
        ? String(body.category)
        : 'Discipline',
      targetDate: sanitizeText(body.targetDate, 40) || 'This quarter',
      createdAt: nowIso,
      milestones,
    };

    user.state.goalRoadmaps.unshift(roadmap);
    user.state.lastSavedAt = nowIso;
    user.state.lastSyncedAt = nowIso;
    await persistDb(db);
    res.status(201).json({ roadmap, state: user.state });
  });

  app.delete('/api/roadmaps/:id', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    user.state.goalRoadmaps = user.state.goalRoadmaps.filter((g) => g.id !== req.params.id);
    user.state.lastSavedAt = new Date().toISOString();
    await persistDb(db);
    res.json({ state: user.state });
  });

  app.post('/api/roadmaps/:id/milestones', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const roadmap = user.state.goalRoadmaps.find((g) => g.id === req.params.id);
    if (!roadmap) {
      res.status(404).json({ error: 'Goal roadmap not found.' });
      return;
    }
    const body = asObj(req.body);
    const title = sanitizeText(body.title, 140);
    if (!title) {
      res.status(400).json({ error: 'Milestone title is required.' });
      return;
    }
    roadmap.milestones.push({
      id: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title,
      description: sanitizeText(body.description, 300),
      targetDate: sanitizeText(body.targetDate, 40) || roadmap.targetDate,
      completed: false,
      xpAwarded: false,
      completedAt: null,
      linkedMissionId: null,
    });
    user.state.lastSavedAt = new Date().toISOString();
    await persistDb(db);
    res.status(201).json({ state: user.state });
  });

  app.post(
    '/api/roadmaps/:id/milestones/:msId/toggle',
    apiRateLimiter,
    async (req: Request, res: Response) => {
      const ctx = await requireUser(req, res);
      if (!ctx) return;
      const { db, user } = ctx;
      const outcome = toggleGoalMilestone(user.state, req.params.id, req.params.msId, new Date());
      if (!outcome) {
        res.status(404).json({ error: 'Milestone not found.' });
        return;
      }
      user.state = outcome.nextState;
      await persistDb(db);
      if (outcome.xpGained > 0) broadcastLeaderboardSnapshot(db);
      res.json({
        state: user.state,
        outcome: {
          xpGained: outcome.xpGained,
          leveledUp: outcome.leveledUp,
          newLevel: outcome.newLevel,
          newlyUnlocked: outcome.newlyUnlocked,
          milestoneTitle: outcome.milestoneTitle,
        },
      });
    }
  );

  app.patch('/api/journal/:id', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const entry = user.state.achievementJournal.find((j) => j.id === req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Journal entry not found.' });
      return;
    }
    const body = asObj(req.body);
    entry.note = sanitizeText(body.note, 300);
    user.state.lastSavedAt = new Date().toISOString();
    await persistDb(db);
    res.json({ state: user.state });
  });

  // Schedule confirmation endpoint (explicit user approval updates mission deadlines & focus timer)
  app.post('/api/schedule/approve', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);
    const blocks = Array.isArray(body.blocks) ? body.blocks : [];
    const focusMinutes = Math.max(1, Math.min(180, Math.round(Number(body.focusMinutes) || 25)));

    const slotMap = new Map<string, string>();
    for (const b of blocks) {
      const obj = asObj(b);
      const mid = sanitizeText(obj.missionId, 60);
      const start = sanitizeText(obj.startLabel, 10);
      const end = sanitizeText(obj.endLabel, 10);
      if (mid && start && end) {
        slotMap.set(mid, `Today · ${start}–${end}`);
      }
    }

    user.state.missions = user.state.missions.map((m) =>
      slotMap.has(m.id) ? { ...m, deadline: slotMap.get(m.id)! } : m
    );
    user.state.focusStats.selectedDurationMinutes = focusMinutes;
    user.state.lastSavedAt = new Date().toISOString();
    await persistDb(db);
    res.json({ state: user.state });
  });

  // ============================================================================
  // PRIVATE FEEDBACK & BUG REPORTING
  // ============================================================================
  app.post('/api/feedback', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const body = asObj(req.body);

    const category =
      body.category === 'bug' || body.category === 'feature' ? body.category : 'general';
    const subject = sanitizeText(body.subject, 100);
    const message = sanitizeText(body.message, 1500);

    if (!subject || message.length < 5) {
      res.status(400).json({
        error: 'Please enter a subject and at least a short description of your feedback.',
      });
      return;
    }

    db.feedback.unshift({
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      category,
      subject,
      message,
      createdAt: new Date().toISOString(),
      status: 'new',
    });
    db.feedback = db.feedback.slice(0, 200);
    await persistDb(db);

    res.status(201).json({
      ok: true,
      message: 'Thank you. Your private feedback has been delivered to the platform owner.',
    });
  });

  // ============================================================================
  // ATLAS AI ENDPOINTS (STRICTLY ISOLATED PER AUTHENTICATED USER)
  // ============================================================================
  const checkAtlasPolicyAndQuota = (
    db: DatabaseSchema,
    user: StoredUserRecord,
    res: Response
  ): boolean => {
    if (!db.appConfig.aiEnabled) {
      res.status(503).json({
        error: 'ATLAS AI is currently paused by the platform owner.',
      });
      return false;
    }
    const today = getLocalDateKey();
    if (user.atlasRequestsDate !== today) {
      user.atlasRequestsDate = today;
      user.atlasRequestsToday = 0;
    }
    const count = user.atlasRequestsToday ?? 0;
    if (count >= db.appConfig.dailyAtlasQuota) {
      res.status(429).json({
        error: `Daily ATLAS AI limit (${db.appConfig.dailyAtlasQuota} requests/day) reached. Try again tomorrow.`,
      });
      return false;
    }
    user.atlasRequestsToday = count + 1;
    return true;
  };

  const handleAtlasChat = async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    if (!checkAtlasPolicyAndQuota(db, user, res)) return;

    try {
      const body = asObj(req.body);
      const sanitizedMessage = sanitizeText(body.message, MAX_MESSAGE_CHARS);
      if (!sanitizedMessage) {
        res.status(400).json({ error: 'Please enter a valid non-empty message for ATLAS.' });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'ATLAS AI is currently unavailable because GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI assistance.',
        });
        return;
      }

      const safeContext = buildAiContextFromUserState(user.state);
      const ownerNote = db.appConfig.atlasSystemNote
        ? `\nADMIN GUIDANCE: ${db.appConfig.atlasSystemNote}`
        : '';
      const systemInstruction = [
        'You are ATLAS (Adaptive Thinking & Life Assistance System), the personal productivity assistant inside STRYDE.',
        'Personality: Intelligent, calm, professional, helpful, and concise.',
        `You are speaking exclusively with ${user.state.profile.name}. Address them naturally by name when appropriate.`,
        'Always refer to yourself strictly as ATLAS—never JARVIS.',
        'Never claim access to other users or administrative accounts.',
        ownerNote,
        '',
        'SYSTEM RULES:',
        '- 5 Skills: Intelligence, Discipline, Leadership, Creativity, Fitness.',
        '- Difficulties & XP: Easy (+50 XP), Medium (+120 XP), Hard (+240 XP), Boss (+450 XP).',
        '- IMPORTANT: Never modify, delete, or complete missions automatically. Populate "suggestedMissions" only if the user asks to create tasks or break down goals.',
        '',
        'USER AUTHENTICATED PROGRESS CONTEXT:',
        JSON.stringify(safeContext, null, 2),
      ].join('\n');

      const trimmedHistory = user.state.jarvisHistory
        .slice(-MAX_HISTORY_TURNS)
        .map((turn) => `${turn.role === 'user' ? 'User' : 'ATLAS'}: ${sanitizeText(turn.content, 800)}`)
        .join('\n');

      const prompt = trimmedHistory
        ? `Conversation history:\n${trimmedHistory}\n\nUser: ${sanitizedMessage}`
        : sanitizedMessage;

      const response = await ai.models.generateContent({
        model: db.appConfig.aiModel || 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              suggestedMissions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      enum: ['Intelligence', 'Discipline', 'Leadership', 'Creativity', 'Fitness'],
                    },
                    difficulty: {
                      type: Type.STRING,
                      enum: ['Easy', 'Medium', 'Hard', 'Boss'],
                    },
                    frequency: {
                      type: Type.STRING,
                      enum: ['daily', 'weekly', 'custom'],
                    },
                    deadline: { type: Type.STRING },
                    subObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    'title',
                    'description',
                    'category',
                    'difficulty',
                    'frequency',
                    'deadline',
                    'subObjectives',
                  ],
                },
              },
            },
            required: ['reply', 'suggestedMissions'],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        res.status(502).json({ error: 'ATLAS received an empty response. Please try again.' });
        return;
      }

      let parsed: { reply?: string; suggestedMissions?: unknown[] };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText, suggestedMissions: [] };
      }

      const replyText =
        typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : rawText;

      const existingTitles = new Set(user.state.missions.map((m) => m.title.trim().toLowerCase()));
      const drafts = Array.isArray(parsed.suggestedMissions)
        ? parsed.suggestedMissions
            .filter((d) => {
              const obj = asObj(d);
              const t = sanitizeText(obj.title, 120);
              return t.length > 0 && !existingTitles.has(t.toLowerCase());
            })
            .slice(0, 5)
            .map((d, idx) => {
              const obj = asObj(d);
              return {
                id: `draft-${Date.now()}-${idx}`,
                title: sanitizeText(obj.title, 120),
                description: sanitizeText(obj.description, 400),
                category: ALL_SKILLS.includes(obj.category as (typeof ALL_SKILLS)[number])
                  ? String(obj.category)
                  : 'Discipline',
                difficulty: VALID_DIFFICULTIES.has(String(obj.difficulty))
                  ? String(obj.difficulty)
                  : 'Medium',
                frequency: VALID_FREQUENCIES.has(String(obj.frequency))
                  ? String(obj.frequency)
                  : 'daily',
                deadline: sanitizeText(obj.deadline, 40) || 'Today',
                subObjectives: Array.isArray(obj.subObjectives)
                  ? obj.subObjectives.slice(0, 8).map((s) => sanitizeText(s, 140)).filter(Boolean)
                  : [],
                added: false,
              };
            })
        : [];

      const nowIso = new Date().toISOString();
      user.state.jarvisHistory = [
        ...user.state.jarvisHistory,
        {
          id: `j-u-${Date.now()}`,
          role: 'user' as const,
          content: sanitizedMessage,
          timestamp: nowIso,
        },
        {
          id: `j-a-${Date.now() + 1}`,
          role: 'assistant' as const,
          content: replyText,
          timestamp: nowIso,
          suggestedMissions: drafts,
        },
      ].slice(-40);
      user.state.lastSavedAt = nowIso;
      await persistDb(db);

      res.json({
        reply: replyText,
        suggestedMissions: drafts,
        state: user.state,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ATLAS error';
      await logServerError(db, '/api/atlas', 500, msg);
      const lower = msg.toLowerCase();
      if (lower.includes('api key') || lower.includes('permission') || lower.includes('unauth')) {
        res.status(503).json({
          error: 'ATLAS AI could not authenticate with the Gemini model service. Please check GEMINI_API_KEY configuration.',
        });
        return;
      }
      res.status(500).json({ error: 'AI service is temporarily unavailable. Please try again shortly.' });
    }
  };

  app.post('/api/atlas', atlasRateLimiter, handleAtlasChat);
  app.post('/api/jarvis', atlasRateLimiter, handleAtlasChat);

  app.delete('/api/atlas/history', apiRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    const nowIso = new Date().toISOString();
    user.state.jarvisHistory = [
      {
        id: `j-reset-${Date.now()}`,
        role: 'assistant',
        content: 'Systems online, Sir. ATLAS is ready to assist. Conversation cleared.',
        timestamp: nowIso,
      },
    ];
    user.state.lastSavedAt = nowIso;
    await persistDb(db);
    res.json({ state: user.state });
  });

  app.post('/api/atlas/briefing', atlasRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    if (!checkAtlasPolicyAndQuota(db, user, res)) return;
    const body = asObj(req.body);
    const availableMinutes = Math.max(15, Math.min(600, sanitizeNum(body.availableMinutes, 60)));

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'ATLAS AI briefing requires GEMINI_API_KEY in Settings > Secrets. Smart local briefing remains active.',
      });
      return;
    }

    try {
      const safeContext = buildAiContextFromUserState(user.state);
      const response = await ai.models.generateContent({
        model: db.appConfig.aiModel || 'gemini-4-hydrogen',
        contents: `Generate a calm daily briefing for ${user.state.profile.name} with ${availableMinutes} minutes available today.`,
        config: {
          systemInstruction: [
            'You are ATLAS (Adaptive Thinking & Life Assistance System).',
            'Focus constructively on realistic next steps. Never reveal or reference other users.',
            `CONTEXT:\n${JSON.stringify(safeContext, null, 2)}`,
          ].join('\n'),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              priorities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                  },
                  required: ['title', 'reason', 'estimatedMinutes'],
                },
              },
              suggestedFocusMinutes: { type: Type.INTEGER },
              encouragement: { type: Type.STRING },
            },
            required: ['headline', 'priorities', 'suggestedFocusMinutes', 'encouragement'],
          },
        },
      });
      const rawText = response.text?.trim();
      if (!rawText) {
        res.status(502).json({ error: 'ATLAS returned an empty briefing.' });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err: unknown) {
      await logServerError(
        db,
        '/api/atlas/briefing',
        500,
        err instanceof Error ? err.message : 'Briefing error'
      );
      res.status(500).json({ error: 'Unable to generate AI briefing right now.' });
    }
  });

  app.post('/api/atlas/plan', atlasRateLimiter, async (req: Request, res: Response) => {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { db, user } = ctx;
    if (!checkAtlasPolicyAndQuota(db, user, res)) return;
    const body = asObj(req.body);
    const goal = sanitizeText(body.goal, 400);
    const timeframe = sanitizeText(body.timeframe, 80) || 'This week';
    const dailyMinutes = Math.max(15, Math.min(360, sanitizeNum(body.dailyMinutes, 60)));

    if (!goal) {
      res.status(400).json({ error: 'Please describe the goal you want ATLAS to break down.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'ATLAS Smart Planner requires GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    try {
      const existingTitles = user.state.missions.map((m) => m.title);
      const response = await ai.models.generateContent({
        model: db.appConfig.aiModel || 'gemini-4-hydrogen',
        contents: `Break down this goal into 3 to 5 realistic, distinct missions:\nGoal: ${goal}\nTimeframe: ${timeframe}\nDaily time budget: ${dailyMinutes} minutes.`,
        config: {
          systemInstruction: [
            'You are ATLAS (Adaptive Thinking & Life Assistance System).',
            'Break large goals into concrete, realistic missions without duplicating these existing titles:',
            JSON.stringify(existingTitles),
          ].join('\n'),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              missions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      enum: ['Intelligence', 'Discipline', 'Leadership', 'Creativity', 'Fitness'],
                    },
                    difficulty: {
                      type: Type.STRING,
                      enum: ['Easy', 'Medium', 'Hard', 'Boss'],
                    },
                    frequency: {
                      type: Type.STRING,
                      enum: ['daily', 'weekly', 'custom'],
                    },
                    deadline: { type: Type.STRING },
                    subObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    'title',
                    'description',
                    'category',
                    'difficulty',
                    'frequency',
                    'deadline',
                    'subObjectives',
                  ],
                },
              },
            },
            required: ['summary', 'missions'],
          },
        },
      });
      const rawText = response.text?.trim();
      if (!rawText) {
        res.status(502).json({ error: 'ATLAS returned an empty plan.' });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err: unknown) {
      await logServerError(
        db,
        '/api/atlas/plan',
        500,
        err instanceof Error ? err.message : 'Planner error'
      );
      res.status(500).json({ error: 'Unable to generate Smart Mission Plan right now.' });
    }
  });

  // ============================================================================
  // PROTECTED OWNER ADMINISTRATION PORTAL (NEVER ACCESSIBLE TO REGULAR USERS)
  // ============================================================================
  app.use(
    '/api/owner',
    createOwnerRouter({
      isGeminiConfigured: () => Boolean(getGeminiClient()),
      onMaintenanceOrConfigChanged: (db) => broadcastLeaderboardSnapshot(db),
    })
  );

  // ============================================================================
  // VITE DEV / PRODUCTION STATIC FRONTEND
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STRYDE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
