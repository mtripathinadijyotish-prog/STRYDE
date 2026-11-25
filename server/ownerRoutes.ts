import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import QRCode from 'qrcode';
import {
  hashSecret,
  hashToken,
  loadDb,
  persistDb,
  verifySecret,
  type DatabaseSchema,
  type OwnerAdminRecord,
  type OwnerPasskeyRecord,
} from './store.ts';
import { LEADERBOARD_THRESHOLD, getLocalDateKey, getPreviousLocalDateKey } from './rpgServer.ts';
import {
  appendOwnerLog,
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateBase32Secret,
  generateOneTimeCodes,
  generateOwnerRecoveryKey,
  generateVerificationCode,
  getWebAuthnRpContext,
  maskIp,
  validateStrongPassword,
  verifyTotpCode,
} from './ownerSecurity.ts';
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
  timingSafeCompareStr,
  verifyMutationOrigin,
} from './sessionHelpers.ts';

const OWNER_COOKIE = 'chronos_owner_session';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const REAUTH_WINDOW_MS = 5 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;

interface MfaChallenge {
  id: string;
  adminId: string;
  userAgent: string;
  ipMasked: string;
  expiresAt: number;
}

interface WebAuthnRegChallenge {
  challenge: string;
  adminId: string;
  expiresAt: number;
}

interface WebAuthnAuthChallenge {
  id: string;
  challenge: string;
  adminId?: string;
  expiresAt: number;
}

const mfaChallenges = new Map<string, MfaChallenge>();
const webauthnRegChallenges = new Map<string, WebAuthnRegChallenge>();
const webauthnAuthChallenges = new Map<string, WebAuthnAuthChallenge>();

function pruneChallenges(): void {
  const now = Date.now();
  for (const [k, v] of mfaChallenges.entries()) if (v.expiresAt <= now) mfaChallenges.delete(k);
  for (const [k, v] of webauthnRegChallenges.entries()) if (v.expiresAt <= now) webauthnRegChallenges.delete(k);
  for (const [k, v] of webauthnAuthChallenges.entries()) if (v.expiresAt <= now) webauthnAuthChallenges.delete(k);
}

const ownerAuthLimiter = createRateLimiter(15 * 60_000, 15, 'owner authentication');
const ownerApiLimiter = createRateLimiter(60_000, 120, 'owner administration');

export function isEmailReservedForOwner(db: DatabaseSchema, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized === db.owner.email) return true;
  return db.ownerAdmins.some((a) => a.email === normalized);
}

function serializeAdmin(admin: OwnerAdminRecord) {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    emailVerified: admin.emailVerified,
    totpEnabled: admin.totpEnabled,
    recoveryCodesRemaining: admin.recoveryCodesHash.length,
    passkeys: admin.passkeys.map((pk) => ({
      id: pk.id,
      name: pk.name,
      deviceType: pk.deviceType,
      backedUp: pk.backedUp,
      createdAt: pk.createdAt,
      lastUsedAt: pk.lastUsedAt,
    })),
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt,
  };
}

function computeClientFingerprint(req: Request): string {
  const ua = sanitizeText(req.headers['user-agent'] || 'unknown', 140);
  const ip = maskIp(req.ip);
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
}

function ensureEnvAdminBootstrapped(db: DatabaseSchema): OwnerAdminRecord | null {
  const existingPrimary = db.ownerAdmins.find((a) => a.role === 'primary');
  if (existingPrimary) return existingPrimary;
  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  if (!envPasscode) return null;
  const primary: OwnerAdminRecord = {
    id: 'owner-primary',
    email: db.owner.email,
    displayName: 'Primary Owner',
    role: 'primary',
    passwordHash: hashSecret(envPasscode),
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
    createdAt: db.owner.claimedAt || new Date().toISOString(),
    lastLoginAt: null,
  };
  db.ownerAdmins.unshift(primary);
  return primary;
}

interface OwnerAuthContext {
  admin: OwnerAdminRecord;
  sessionHash: string;
  rawToken: string;
  recentReauthValid: boolean;
}

async function requireOwnerSession(
  req: Request,
  res: Response,
  db: DatabaseSchema,
  options: { requirePrimary?: boolean; requireRecentReauth?: boolean } = {}
): Promise<OwnerAuthContext | null> {
  if (!verifyMutationOrigin(req)) {
    res.status(403).json({ error: 'Request origin rejected.' });
    return null;
  }

  const rawToken = extractBearerToken(req, OWNER_COOKIE);
  if (!rawToken) {
    res.status(403).json({ error: 'Owner authorization required.' });
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const session = db.sessions[tokenHash];
  if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
    res.status(403).json({ error: 'Owner authorization required.' });
    return null;
  }

  const now = Date.now();
  if (session.expiresAt <= now) {
    delete db.sessions[tokenHash];
    await persistDb(db);
    res.status(401).json({ error: 'Owner session has expired. Please sign in again.', sessionExpired: true });
    return null;
  }

  const idleLimitMs = (db.appConfig?.ownerSessionIdleMinutes ?? 30) * 60_000;
  if (now - session.lastActivityAt > idleLimitMs) {
    delete db.sessions[tokenHash];
    await persistDb(db);
    clearSessionCookie(req, res, OWNER_COOKIE);
    res.status(401).json({
      error: 'Admin session expired due to inactivity. Please sign in again.',
      sessionExpired: true,
    });
    return null;
  }

  const admin =
    (session.adminId ? db.ownerAdmins.find((a) => a.id === session.adminId) : undefined) ||
    db.ownerAdmins.find((a) => a.role === 'primary');

  if (!admin) {
    res.status(403).json({ error: 'Owner account record not found.' });
    return null;
  }

  if (options.requirePrimary && admin.role !== 'primary') {
    res.status(403).json({ error: 'Only the Primary Owner can perform this action.' });
    return null;
  }

  const recentReauthValid = Boolean(
    session.recentReauthAt && now - session.recentReauthAt <= REAUTH_WINDOW_MS
  );
  if (options.requireRecentReauth && !recentReauthValid) {
    res.status(403).json({
      error: 'Recent verification required. Please confirm your password or authenticator code.',
      reauthRequired: true,
    });
    return null;
  }

  session.lastActivityAt = now;
  if (session.expiresAt - now < SESSION_TTL_MS / 2) {
    session.expiresAt = now + SESSION_TTL_MS;
  }

  return { admin, sessionHash: tokenHash, rawToken, recentReauthValid };
}

function finalizeAdminLogin(
  req: Request,
  res: Response,
  db: DatabaseSchema,
  admin: OwnerAdminRecord,
  methodLabel: string
) {
  const now = new Date();
  const ua = sanitizeText(req.headers['user-agent'] || 'Browser session', 140);
  const ipMasked = maskIp(req.ip);
  const fp = computeClientFingerprint(req);

  const isKnownDevice = admin.knownFingerprints.length === 0 || admin.knownFingerprints.includes(fp);
  if (!admin.knownFingerprints.includes(fp)) {
    admin.knownFingerprints = [...admin.knownFingerprints, fp].slice(-10);
  }
  if (!isKnownDevice) {
    appendOwnerLog(db, {
      actorEmail: admin.email,
      event: 'New device or IP sign-in',
      outcome: 'alert',
      detail: `Signed in via ${methodLabel} from an unrecognized device/network (${ipMasked}).`,
      ipMasked,
      suspicious: true,
      acknowledged: false,
    });
  } else {
    appendOwnerLog(db, {
      actorEmail: admin.email,
      event: 'Owner sign-in',
      outcome: 'success',
      detail: `Authenticated via ${methodLabel}.`,
      ipMasked,
      suspicious: false,
    });
  }

  admin.failedAttempts = 0;
  admin.lockedUntil = null;
  admin.lastLoginAt = now.toISOString();

  const token = createSessionRecord(db, {
    userId: admin.id,
    role: admin.role === 'primary' ? 'owner' : 'admin',
    adminId: admin.id,
    recentReauthAt: now.getTime(),
    userAgent: ua,
    ipMasked,
  });

  setSessionCookie(req, res, OWNER_COOKIE, token);
  return token;
}

function recordFailedAttempt(
  db: DatabaseSchema,
  admin: OwnerAdminRecord,
  req: Request,
  eventLabel: string
): boolean {
  admin.failedAttempts += 1;
  const ipMasked = maskIp(req.ip);
  const lockedNow = admin.failedAttempts >= MAX_FAILED_ATTEMPTS;
  if (lockedNow) {
    admin.lockedUntil = Date.now() + LOCKOUT_MS;
    appendOwnerLog(db, {
      actorEmail: admin.email,
      event: 'Account temporarily locked',
      outcome: 'alert',
      detail: `${MAX_FAILED_ATTEMPTS} consecutive failed ${eventLabel} attempts. Locked for 15 minutes.`,
      ipMasked,
      suspicious: true,
      acknowledged: false,
    });
  } else {
    appendOwnerLog(db, {
      actorEmail: admin.email,
      event: `Failed ${eventLabel}`,
      outcome: 'failure',
      detail: `Attempt ${admin.failedAttempts} of ${MAX_FAILED_ATTEMPTS} before temporary lockout.`,
      ipMasked,
      suspicious: admin.failedAttempts >= 3,
      acknowledged: false,
    });
  }
  return lockedNow;
}

export function createOwnerRouter(options: {
  isGeminiConfigured: () => boolean;
  onMaintenanceOrConfigChanged: (db: DatabaseSchema) => void;
}) {
  const router = Router();

  // Public Owner Portal availability probe (exposes zero credentials)
  router.get('/status', async (_req: Request, res: Response) => {
    const db = await loadDb();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const primary = db.ownerAdmins.find((a) => a.role === 'primary');
    const configured = Boolean(envPasscode || primary || db.owner.passcodeHash);
    const hasPasskeys = db.ownerAdmins.some((a) => a.passkeys.length > 0);
    const envEmailSet = Boolean((process.env.ADMIN_EMAIL || '').trim());

    res.json({
      configured,
      mode: envPasscode ? 'env' : configured ? 'claimed' : 'unclaimed',
      hasPasskeys,
      prefillEmail: !configured && envEmailSet ? db.owner.email : undefined,
    });
  });

  // Restore in-memory token from HttpOnly cookie on refresh
  router.get('/me', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;
    await persistDb(db);
    const unacknowledgedAlerts = db.ownerActivityLogs.filter(
      (l) => l.suspicious && !l.acknowledged
    ).length;
    res.json({
      token: ctx.rawToken,
      admin: serializeAdmin(ctx.admin),
      recentReauthValid: ctx.recentReauthValid,
      unacknowledgedAlerts,
    });
  });

  // Initial Primary Owner registration (one-time only)
  router.post('/claim', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const existingPrimary = db.ownerAdmins.find((a) => a.role === 'primary');
    if (envPasscode || existingPrimary || db.owner.passcodeHash) {
      res.status(409).json({
        error: 'Primary Owner account is already configured. Please sign in instead.',
      });
      return;
    }

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const displayName = sanitizeText(body.displayName, 40) || 'Primary Owner';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid owner email address.' });
      return;
    }

    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (envEmail && email !== envEmail) {
      res.status(403).json({
        error: 'This email does not match the configured ADMIN_EMAIL environment restriction.',
      });
      return;
    }

    const existingRegularUser = Object.values(db.users).some((u) => u.email === email);
    if (existingRegularUser) {
      res.status(409).json({
        error: 'This email belongs to a standard member account. Choose a dedicated owner email.',
      });
      return;
    }

    const pwCheck = validateStrongPassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const nowIso = new Date().toISOString();
    const verificationCode = generateVerificationCode();
    const recoveryKey = generateOwnerRecoveryKey();
    const primaryAdmin: OwnerAdminRecord = {
      id: 'owner-primary',
      email,
      displayName,
      role: 'primary',
      passwordHash: hashSecret(password),
      emailVerified: false,
      verificationCodeHash: hashSecret(verificationCode),
      verificationExpiresAt: Date.now() + 15 * 60_000,
      totpEnabled: false,
      totpSecret: null,
      pendingTotpSecret: null,
      recoveryKeyHash: hashSecret(recoveryKey),
      recoveryCodesHash: [],
      passkeys: [],
      failedAttempts: 0,
      lockedUntil: null,
      knownFingerprints: [computeClientFingerprint(req)],
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };

    db.owner = {
      email,
      passcodeHash: primaryAdmin.passwordHash,
      claimedAt: nowIso,
    };
    db.ownerAdmins = [primaryAdmin];
    appendOwnerLog(db, {
      actorEmail: email,
      event: 'Primary Owner claimed',
      outcome: 'success',
      detail: 'Initial owner account created. Pending email verification.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });

    const token = createSessionRecord(db, {
      userId: primaryAdmin.id,
      role: 'owner',
      adminId: primaryAdmin.id,
      recentReauthAt: Date.now(),
      userAgent: sanitizeText(req.headers['user-agent'] || 'Browser', 140),
      ipMasked: maskIp(req.ip),
    });

    await persistDb(db);
    setSessionCookie(req, res, OWNER_COOKIE, token);
    res.status(201).json({
      token,
      admin: serializeAdmin(primaryAdmin),
      recoveryKey,
      verificationCodeNotice: verificationCode,
    });
  });

  // Email verification & resend
  router.post('/verify-email', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;
    const body = asObj(req.body);
    const code = sanitizeText(body.code, 12).replace(/\s+/g, '');

    if (ctx.admin.emailVerified) {
      res.json({ ok: true, admin: serializeAdmin(ctx.admin) });
      return;
    }

    if (
      !ctx.admin.verificationCodeHash ||
      !ctx.admin.verificationExpiresAt ||
      Date.now() > ctx.admin.verificationExpiresAt
    ) {
      res.status(400).json({ error: 'Verification code expired. Request a new code.' });
      return;
    }

    if (!verifySecret(code, ctx.admin.verificationCodeHash)) {
      res.status(400).json({ error: 'Invalid 6-digit verification code.' });
      return;
    }

    ctx.admin.emailVerified = true;
    ctx.admin.verificationCodeHash = null;
    ctx.admin.verificationExpiresAt = null;
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Owner email verified',
      outcome: 'success',
      detail: 'Email address verification completed.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });
    await persistDb(db);
    res.json({ ok: true, admin: serializeAdmin(ctx.admin) });
  });

  router.post('/resend-verification', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const code = generateVerificationCode();
    ctx.admin.verificationCodeHash = hashSecret(code);
    ctx.admin.verificationExpiresAt = Date.now() + 15 * 60_000;
    await persistDb(db);
    res.json({
      ok: true,
      verificationCodeNotice: code,
      message: 'A fresh 6-digit verification code has been issued.',
    });
  });

  // Password Login (+ optional MFA step)
  router.post('/login', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    ensureEnvAdminBootstrapped(db);
    pruneChallenges();

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Administrator email and password are required.' });
      return;
    }

    const admin = db.ownerAdmins.find((a) => a.email === email);
    if (!admin) {
      appendOwnerLog(db, {
        actorEmail: email,
        event: 'Unknown admin login attempt',
        outcome: 'failure',
        detail: 'Sign-in attempted with an unrecognized administrator email.',
        ipMasked: maskIp(req.ip),
        suspicious: true,
        acknowledged: false,
      });
      await persistDb(db);
      res.status(401).json({ error: 'Invalid owner credentials.' });
      return;
    }

    if (admin.lockedUntil && admin.lockedUntil > Date.now()) {
      const minsLeft = Math.ceil((admin.lockedUntil - Date.now()) / 60_000);
      res.status(423).json({
        error: `Account temporarily locked due to repeated failed attempts. Try again in ${minsLeft} minute(s).`,
      });
      return;
    }

    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const envMatches =
      admin.role === 'primary' && envPasscode ? timingSafeCompareStr(password, envPasscode) : false;
    const hashMatches = admin.passwordHash ? verifySecret(password, admin.passwordHash) : false;

    if (!envMatches && !hashMatches) {
      const lockedNow = recordFailedAttempt(db, admin, req, 'password login');
      await persistDb(db);
      res.status(lockedNow ? 423 : 401).json({
        error: lockedNow
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid owner credentials.',
      });
      return;
    }

    // If MFA is enabled, issue ephemeral MFA challenge rather than a session
    if (admin.totpEnabled && admin.totpSecret) {
      admin.failedAttempts = 0;
      const challengeId = crypto.randomBytes(24).toString('hex');
      mfaChallenges.set(challengeId, {
        id: challengeId,
        adminId: admin.id,
        userAgent: sanitizeText(req.headers['user-agent'] || 'Browser', 140),
        ipMasked: maskIp(req.ip),
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });
      await persistDb(db);
      res.json({
        mfaRequired: true,
        challengeToken: challengeId,
        methods: ['totp', 'recovery_code'],
      });
      return;
    }

    const token = finalizeAdminLogin(req, res, db, admin, 'password');
    await persistDb(db);
    res.json({
      token,
      admin: serializeAdmin(admin),
    });
  });

  // Complete TOTP or one-time backup code MFA step
  router.post('/login/mfa', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    pruneChallenges();

    const body = asObj(req.body);
    const challengeToken = sanitizeText(body.challengeToken, 120);
    const code = sanitizeText(body.code, 32).toUpperCase();

    const challenge = mfaChallenges.get(challengeToken);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      res.status(401).json({ error: 'Verification session expired. Please sign in again.' });
      return;
    }

    const admin = db.ownerAdmins.find((a) => a.id === challenge.adminId);
    if (!admin || !admin.totpEnabled) {
      res.status(401).json({ error: 'Invalid MFA verification state.' });
      return;
    }

    if (admin.lockedUntil && admin.lockedUntil > Date.now()) {
      res.status(423).json({ error: 'Account temporarily locked. Please try again later.' });
      return;
    }

    const totpSecret = decryptTotpSecret(admin.totpSecret);
    let verified = Boolean(totpSecret && verifyTotpCode(totpSecret, code));
    let usedMethod = 'authenticator code';

    if (!verified && admin.recoveryCodesHash.length > 0) {
      const idx = admin.recoveryCodesHash.findIndex((h) => verifySecret(code, h));
      if (idx !== -1) {
        admin.recoveryCodesHash.splice(idx, 1);
        verified = true;
        usedMethod = 'one-time MFA backup code';
      }
    }

    if (!verified) {
      const lockedNow = recordFailedAttempt(db, admin, req, 'MFA verification');
      await persistDb(db);
      res.status(lockedNow ? 423 : 401).json({
        error: lockedNow
          ? 'Too many failed MFA attempts. Account locked for 15 minutes.'
          : 'Invalid authenticator or backup code.',
      });
      return;
    }

    mfaChallenges.delete(challengeToken);
    const token = finalizeAdminLogin(req, res, db, admin, `password + ${usedMethod}`);
    await persistDb(db);
    res.json({
      token,
      admin: serializeAdmin(admin),
    });
  });

  // Verified Account Recovery (enforces recovery key + MFA when enabled — never bypasses MFA)
  router.post('/recover', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const recoveryKey = sanitizeText(body.recoveryKey, 64).toUpperCase();
    const mfaCode = sanitizeText(body.mfaCode, 32).toUpperCase();
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!isValidEmail(email) || !recoveryKey) {
      res.status(400).json({ error: 'Owner email and master recovery key are required.' });
      return;
    }

    const pwCheck = validateStrongPassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const admin = db.ownerAdmins.find((a) => a.email === email);
    if (!admin || !admin.recoveryKeyHash) {
      res.status(401).json({ error: 'Account recovery verification failed.' });
      return;
    }

    if (admin.lockedUntil && admin.lockedUntil > Date.now()) {
      res.status(423).json({ error: 'Account temporarily locked due to failed attempts.' });
      return;
    }

    if (!verifySecret(recoveryKey, admin.recoveryKeyHash)) {
      recordFailedAttempt(db, admin, req, 'account recovery');
      await persistDb(db);
      res.status(401).json({ error: 'Account recovery verification failed.' });
      return;
    }

    if (admin.totpEnabled) {
      if (!mfaCode) {
        res.status(403).json({
          error: 'Two-factor verification code is required to complete owner recovery.',
          mfaRequired: true,
        });
        return;
      }
      const secret = decryptTotpSecret(admin.totpSecret);
      const totpOk = Boolean(secret && verifyTotpCode(secret, mfaCode));
      let backupIdx = -1;
      if (!totpOk) {
        backupIdx = admin.recoveryCodesHash.findIndex((h) => verifySecret(mfaCode, h));
      }
      if (!totpOk && backupIdx === -1) {
        recordFailedAttempt(db, admin, req, 'recovery MFA check');
        await persistDb(db);
        res.status(401).json({ error: 'Invalid two-factor code during account recovery.' });
        return;
      }
      if (backupIdx !== -1) {
        admin.recoveryCodesHash.splice(backupIdx, 1);
      }
    }

    const nextRecoveryKey = generateOwnerRecoveryKey();
    admin.passwordHash = hashSecret(newPassword);
    admin.recoveryKeyHash = hashSecret(nextRecoveryKey);
    admin.failedAttempts = 0;
    admin.lockedUntil = null;
    if (admin.role === 'primary') {
      db.owner.passcodeHash = admin.passwordHash;
    }

    // Revoke every active session for this administrator immediately
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.adminId === admin.id || s.userId === admin.id) {
        delete db.sessions[k];
      }
    }

    appendOwnerLog(db, {
      actorEmail: admin.email,
      event: 'Owner account recovered & sessions revoked',
      outcome: 'alert',
      detail: 'Password reset via verified master recovery key; all sessions cleared.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: false,
    });

    await persistDb(db);
    res.json({
      ok: true,
      newRecoveryKey: nextRecoveryKey,
      message: 'Owner password reset complete. Save your rotated recovery key and sign in.',
    });
  });

  // Fresh re-authentication gate for sensitive operations (passkeys, MFA changes)
  router.post('/reauth', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const body = asObj(req.body);
    const password = typeof body.password === 'string' ? body.password : '';
    const totpCode = sanitizeText(body.totpCode, 16);

    const pwOk = Boolean(ctx.admin.passwordHash && password && verifySecret(password, ctx.admin.passwordHash));
    const secret = decryptTotpSecret(ctx.admin.totpSecret);
    const totpOk = Boolean(ctx.admin.totpEnabled && secret && totpCode && verifyTotpCode(secret, totpCode));

    if (!pwOk && !totpOk) {
      res.status(401).json({ error: 'Verification failed. Enter your password or authenticator code.' });
      return;
    }

    const session = db.sessions[ctx.sessionHash];
    if (session) {
      session.recentReauthAt = Date.now();
    }
    await persistDb(db);
    res.json({ ok: true, recentReauthValid: true });
  });

  // ============================================================================
  // WEBAUTHN / FIDO2 PASSKEYS
  // ============================================================================
  router.post('/passkeys/register/options', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;
    pruneChallenges();

    const { rpID, rpName } = getWebAuthnRpContext(req);
    const optionsJSON = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: ctx.admin.email,
      userDisplayName: ctx.admin.displayName,
      attestationType: 'none',
      excludeCredentials: ctx.admin.passkeys.map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    webauthnRegChallenges.set(ctx.admin.id, {
      challenge: optionsJSON.challenge,
      adminId: ctx.admin.id,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    await persistDb(db);
    res.json(optionsJSON);
  });

  router.post('/passkeys/register/verify', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;
    pruneChallenges();

    const pending = webauthnRegChallenges.get(ctx.admin.id);
    if (!pending || pending.expiresAt <= Date.now()) {
      res.status(400).json({ error: 'Passkey registration challenge expired. Try again.' });
      return;
    }

    const body = asObj(req.body);
    const name = sanitizeText(body.name, 50) || `Passkey ${ctx.admin.passkeys.length + 1}`;
    const response = body.response as RegistrationResponseJSON | undefined;
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'Missing passkey credential response.' });
      return;
    }

    const { rpID, expectedOrigins } = getWebAuthnRpContext(req);
    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: 'Passkey verification failed.' });
        return;
      }

      const info = verification.registrationInfo;
      const newKey: OwnerPasskeyRecord = {
        id: `pk-${crypto.randomUUID()}`,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
        counter: info.credential.counter,
        transports: Array.isArray(info.credential.transports) ? info.credential.transports : [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };

      webauthnRegChallenges.delete(ctx.admin.id);
      ctx.admin.passkeys.push(newKey);
      appendOwnerLog(db, {
        actorEmail: ctx.admin.email,
        event: 'Passkey registered',
        outcome: 'success',
        detail: `Added passkey "${name}" (${info.credentialDeviceType}).`,
        ipMasked: maskIp(req.ip),
        suspicious: false,
      });

      await persistDb(db);
      res.status(201).json({ admin: serializeAdmin(ctx.admin) });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to register passkey.',
      });
    }
  });

  router.post('/passkeys/auth/options', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    pruneChallenges();
    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);

    const targetAdmin = email ? db.ownerAdmins.find((a) => a.email === email) : undefined;
    const allowCredentials = targetAdmin
      ? targetAdmin.passkeys.map((pk) => ({
          id: pk.credentialId,
          transports: pk.transports as AuthenticatorTransport[],
        }))
      : db.ownerAdmins.flatMap((a) =>
          a.passkeys.map((pk) => ({
            id: pk.credentialId,
            transports: pk.transports as AuthenticatorTransport[],
          }))
        );

    if (allowCredentials.length === 0) {
      res.status(404).json({ error: 'No passkeys are registered yet for owner authentication.' });
      return;
    }

    const { rpID } = getWebAuthnRpContext(req);
    const optionsJSON = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    const challengeId = crypto.randomBytes(16).toString('hex');
    webauthnAuthChallenges.set(challengeId, {
      id: challengeId,
      challenge: optionsJSON.challenge,
      adminId: targetAdmin?.id,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    res.json({ challengeId, optionsJSON });
  });

  router.post('/passkeys/auth/verify', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    pruneChallenges();

    const body = asObj(req.body);
    const challengeId = sanitizeText(body.challengeId, 64);
    const response = body.response as AuthenticationResponseJSON | undefined;

    const pending = webauthnAuthChallenges.get(challengeId);
    if (!pending || pending.expiresAt <= Date.now()) {
      res.status(401).json({ error: 'Passkey sign-in challenge expired. Please try again.' });
      return;
    }
    if (!response || typeof response.id !== 'string') {
      res.status(400).json({ error: 'Invalid passkey authentication payload.' });
      return;
    }

    let matchedAdmin: OwnerAdminRecord | undefined;
    let matchedKey: OwnerPasskeyRecord | undefined;
    for (const adm of db.ownerAdmins) {
      if (pending.adminId && adm.id !== pending.adminId) continue;
      const found = adm.passkeys.find((pk) => pk.credentialId === response.id);
      if (found) {
        matchedAdmin = adm;
        matchedKey = found;
        break;
      }
    }

    if (!matchedAdmin || !matchedKey) {
      res.status(401).json({ error: 'Unrecognized passkey credential.' });
      return;
    }

    if (matchedAdmin.lockedUntil && matchedAdmin.lockedUntil > Date.now()) {
      res.status(423).json({ error: 'Account temporarily locked due to failed attempts.' });
      return;
    }

    const { rpID, expectedOrigins } = getWebAuthnRpContext(req);
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpID,
        credential: {
          id: matchedKey.credentialId,
          publicKey: new Uint8Array(Buffer.from(matchedKey.publicKey, 'base64url')),
          counter: matchedKey.counter,
          transports: matchedKey.transports as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      });

      if (!verification.verified) {
        recordFailedAttempt(db, matchedAdmin, req, 'passkey login');
        await persistDb(db);
        res.status(401).json({ error: 'Passkey signature verification failed.' });
        return;
      }

      webauthnAuthChallenges.delete(challengeId);
      matchedKey.counter = verification.authenticationInfo.newCounter;
      matchedKey.lastUsedAt = new Date().toISOString();

      const token = finalizeAdminLogin(
        req,
        res,
        db,
        matchedAdmin,
        `passkey (${matchedKey.name})`
      );
      await persistDb(db);
      res.json({ token, admin: serializeAdmin(matchedAdmin) });
    } catch (err) {
      recordFailedAttempt(db, matchedAdmin, req, 'passkey login');
      await persistDb(db);
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Passkey authentication failed.',
      });
    }
  });

  router.delete('/passkeys/:id', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    const target = ctx.admin.passkeys.find((pk) => pk.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Passkey not found.' });
      return;
    }
    ctx.admin.passkeys = ctx.admin.passkeys.filter((pk) => pk.id !== req.params.id);
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Passkey revoked',
      outcome: 'alert',
      detail: `Removed passkey "${target.name}".`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: true,
    });
    await persistDb(db);
    res.json({ admin: serializeAdmin(ctx.admin) });
  });

  // ============================================================================
  // TOTP MFA & RECOVERY CODES
  // ============================================================================
  router.post('/mfa/setup', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    const secret = generateBase32Secret();
    const otpauthUri = buildOtpAuthUri(ctx.admin.email, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 });
    ctx.admin.pendingTotpSecret = encryptTotpSecret(secret);
    await persistDb(db);
    res.json({ secret, otpauthUri, qrDataUrl });
  });

  router.post('/mfa/enable', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    const body = asObj(req.body);
    const code = sanitizeText(body.code, 12);
    const pendingPlain = decryptTotpSecret(ctx.admin.pendingTotpSecret);
    if (!pendingPlain || !verifyTotpCode(pendingPlain, code)) {
      res.status(400).json({ error: 'Invalid 6-digit authenticator code. Verify device time and try again.' });
      return;
    }

    const { plain: backupCodes, hashed: backupHashes } = generateOneTimeCodes(8);
    ctx.admin.totpSecret = ctx.admin.pendingTotpSecret;
    ctx.admin.pendingTotpSecret = null;
    ctx.admin.totpEnabled = true;
    ctx.admin.recoveryCodesHash = backupHashes;

    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'TOTP MFA enabled',
      outcome: 'success',
      detail: 'Two-factor authenticator app protection activated with 8 backup codes.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });

    await persistDb(db);
    res.json({ admin: serializeAdmin(ctx.admin), backupCodes });
  });

  router.post('/mfa/disable', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    ctx.admin.totpEnabled = false;
    ctx.admin.totpSecret = null;
    ctx.admin.pendingTotpSecret = null;
    ctx.admin.recoveryCodesHash = [];
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'TOTP MFA disabled',
      outcome: 'alert',
      detail: 'Two-factor authenticator app protection was disabled.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: true,
    });
    await persistDb(db);
    res.json({ admin: serializeAdmin(ctx.admin) });
  });

  router.post('/mfa/recovery-codes', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    const { plain: backupCodes, hashed: backupHashes } = generateOneTimeCodes(8);
    ctx.admin.recoveryCodesHash = backupHashes;
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'MFA backup codes rotated',
      outcome: 'success',
      detail: 'Generated 8 fresh single-use MFA backup codes.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });
    await persistDb(db);
    res.json({ admin: serializeAdmin(ctx.admin), backupCodes });
  });

  // ============================================================================
  // SESSIONS, PASSWORD CHANGE & LOGOUT
  // ============================================================================
  router.post('/logout', async (req: Request, res: Response) => {
    const db = await loadDb();
    const rawToken = extractBearerToken(req, OWNER_COOKIE);
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      if (db.sessions[tokenHash]) {
        delete db.sessions[tokenHash];
        await persistDb(db);
      }
    }
    clearSessionCookie(req, res, OWNER_COOKIE);
    res.json({ ok: true });
  });

  router.get('/sessions', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;
    await persistDb(db);

    const active = Object.values(db.sessions)
      .filter((s) => (s.role === 'owner' || s.role === 'admin') && s.adminId === ctx.admin.id)
      .map((s) => ({
        id: s.tokenHash.slice(0, 12),
        current: s.tokenHash === ctx.sessionHash,
        userAgent: s.userAgent || 'Browser session',
        ipMasked: s.ipMasked || 'unknown',
        createdAt: s.createdAt,
        lastActivityAt: new Date(s.lastActivityAt).toISOString(),
      }));

    res.json({ sessions: active });
  });

  router.post('/sessions/revoke-all', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const body = asObj(req.body);
    const includeCurrent = Boolean(body.includeCurrent);
    let revokedCount = 0;

    for (const [k, s] of Object.entries(db.sessions)) {
      if ((s.role === 'owner' || s.role === 'admin') && s.adminId === ctx.admin.id) {
        if (!includeCurrent && k === ctx.sessionHash) continue;
        delete db.sessions[k];
        revokedCount += 1;
      }
    }

    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Revoked active sessions',
      outcome: 'alert',
      detail: `Terminated ${revokedCount} session(s)${includeCurrent ? ' including current' : ''}.`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: true,
    });

    await persistDb(db);
    if (includeCurrent) {
      clearSessionCookie(req, res, OWNER_COOKIE);
    }
    res.json({ ok: true, revokedCount, signedOut: includeCurrent });
  });

  router.post('/password', ownerAuthLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const body = asObj(req.body);
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!ctx.admin.passwordHash || !verifySecret(currentPassword, ctx.admin.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const pwCheck = validateStrongPassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    ctx.admin.passwordHash = hashSecret(newPassword);
    if (ctx.admin.role === 'primary') {
      db.owner.passcodeHash = ctx.admin.passwordHash;
    }

    // Revoke other active sessions for this admin
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.adminId === ctx.admin.id && k !== ctx.sessionHash) {
        delete db.sessions[k];
      }
    }

    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Owner password rotated',
      outcome: 'success',
      detail: 'Password updated and other devices signed out.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });

    await persistDb(db);
    res.json({ ok: true });
  });

  router.post('/recovery-key/regenerate', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requireRecentReauth: true });
    if (!ctx) return;

    const nextKey = generateOwnerRecoveryKey();
    ctx.admin.recoveryKeyHash = hashSecret(nextKey);
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Master recovery key rotated',
      outcome: 'success',
      detail: 'Generated a new master recovery key.',
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });
    await persistDb(db);
    res.json({ recoveryKey: nextKey });
  });

  // ============================================================================
  // DASHBOARD, USER MANAGEMENT, ADDITIONAL ADMINS, CONFIG & ALERTS
  // ============================================================================
  router.get('/dashboard', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;
    await persistDb(db);

    const users = Object.values(db.users);
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const activeUsers24h = users.filter(
      (u) => nowMs - new Date(u.lastActiveAt).getTime() <= dayMs
    ).length;
    const activeUsers7d = users.filter(
      (u) => nowMs - new Date(u.lastActiveAt).getTime() <= 7 * dayMs
    ).length;

    const regCounts = new Map<string, number>();
    for (const dateKey of db.registrationDates) {
      regCounts.set(dateKey, (regCounts.get(dateKey) ?? 0) + 1);
    }
    const trend: Array<{ date: string; count: number }> = [];
    let cursor = getLocalDateKey();
    for (let i = 0; i < 7; i++) {
      trend.unshift({ date: cursor, count: regCounts.get(cursor) ?? 0 });
      cursor = getPreviousLocalDateKey(cursor);
    }

    const totalMissions = users.reduce((s, u) => s + u.state.missions.length, 0);
    const totalCompletedMissions = users.reduce((s, u) => s + u.state.completedHistory.length, 0);
    const totalFocusMinutes = users.reduce((s, u) => s + u.state.focusStats.totalMinutes, 0);
    const threshold = db.appConfig?.leaderboardThreshold ?? LEADERBOARD_THRESHOLD;

    const activeOwnerSessions = Object.values(db.sessions).filter(
      (s) => (s.role === 'owner' || s.role === 'admin') && s.adminId === ctx.admin.id
    ).length;

    res.json({
      admin: serializeAdmin(ctx.admin),
      recentReauthValid: ctx.recentReauthValid,
      admins: db.ownerAdmins.map(serializeAdmin),
      activeOwnerSessions,
      totalRegisteredUsers: users.length,
      suspendedUsersCount: users.filter((u) => u.suspended).length,
      activeUsers24h,
      activeUsers7d,
      leaderboardUnlocked: users.length >= threshold,
      leaderboardThreshold: threshold,
      registrationTrend: trend,
      usageStats: {
        totalMissions,
        totalCompletedMissions,
        totalFocusMinutes,
      },
      health: {
        status: 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        geminiConfigured: options.isGeminiConfigured(),
        activeSessionsTotal: Object.keys(db.sessions).length,
      },
      appConfig: db.appConfig,
      maintenance: db.maintenance,
      activityLogs: db.ownerActivityLogs.slice(0, 60),
      unacknowledgedAlerts: db.ownerActivityLogs.filter((l) => l.suspicious && !l.acknowledged).length,
      feedback: db.feedback.slice(0, 40).map((f) => ({
        id: f.id,
        category: f.category,
        subject: f.subject,
        message: f.message,
        createdAt: f.createdAt,
        status: f.status,
      })),
      errorLog: db.errorLog.slice(0, 40),
    });
  });

  router.get('/users', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;
    await persistDb(db);

    const list = Object.values(db.users)
      .map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.state.profile.name,
        level: u.state.profile.level,
        totalXp: u.state.profile.totalXp,
        missionsCount: u.state.missions.length,
        completedCount: u.state.completedHistory.length,
        suspended: Boolean(u.suspended),
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));

    res.json({ users: list });
  });

  router.patch('/users/:id', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const user = db.users[req.params.id];
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const body = asObj(req.body);
    if (typeof body.suspended === 'boolean') {
      user.suspended = body.suspended;
      if (body.suspended) {
        for (const [k, s] of Object.entries(db.sessions)) {
          if (s.userId === user.id) delete db.sessions[k];
        }
      }
      appendOwnerLog(db, {
        actorEmail: ctx.admin.email,
        event: body.suspended ? 'User account suspended' : 'User account reinstated',
        outcome: 'success',
        detail: `${user.email} (${user.state.profile.name})`,
        ipMasked: maskIp(req.ip),
        suspicious: false,
      });
    }

    if (body.revokeSessions) {
      let cleared = 0;
      for (const [k, s] of Object.entries(db.sessions)) {
        if (s.userId === user.id) {
          delete db.sessions[k];
          cleared += 1;
        }
      }
      appendOwnerLog(db, {
        actorEmail: ctx.admin.email,
        event: 'Revoked user sessions',
        outcome: 'success',
        detail: `Cleared ${cleared} session(s) for ${user.email}`,
        ipMasked: maskIp(req.ip),
        suspicious: false,
      });
    }

    await persistDb(db);
    options.onMaintenanceOrConfigChanged(db);
    res.json({ ok: true, suspended: Boolean(user.suspended) });
  });

  router.delete('/users/:id', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, { requirePrimary: true });
    if (!ctx) return;

    const user = db.users[req.params.id];
    if (!user) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    const deletedEmail = user.email;
    delete db.users[req.params.id];
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.userId === req.params.id) delete db.sessions[k];
    }
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Deleted user account',
      outcome: 'alert',
      detail: `Removed user ${deletedEmail}`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: true,
    });
    await persistDb(db);
    options.onMaintenanceOrConfigChanged(db);
    res.json({ ok: true });
  });

  // Additional Administrator Management (Primary Owner only)
  router.post('/admins', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, {
      requirePrimary: true,
      requireRecentReauth: true,
    });
    if (!ctx) return;

    const body = asObj(req.body);
    const email = sanitizeEmail(body.email);
    const displayName = sanitizeText(body.displayName, 40) || 'Administrator';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid administrator email address.' });
      return;
    }
    if (isEmailReservedForOwner(db, email)) {
      res.status(409).json({ error: 'An administrator with this email already exists.' });
      return;
    }
    if (Object.values(db.users).some((u) => u.email === email)) {
      res.status(409).json({ error: 'This email is currently registered as a regular member.' });
      return;
    }

    const pwCheck = validateStrongPassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({ error: pwCheck.error });
      return;
    }

    const verificationCode = generateVerificationCode();
    const recoveryKey = generateOwnerRecoveryKey();
    const newAdmin: OwnerAdminRecord = {
      id: `adm-${crypto.randomUUID()}`,
      email,
      displayName,
      role: 'admin',
      passwordHash: hashSecret(password),
      emailVerified: false,
      verificationCodeHash: hashSecret(verificationCode),
      verificationExpiresAt: Date.now() + 15 * 60_000,
      totpEnabled: false,
      totpSecret: null,
      pendingTotpSecret: null,
      recoveryKeyHash: hashSecret(recoveryKey),
      recoveryCodesHash: [],
      passkeys: [],
      failedAttempts: 0,
      lockedUntil: null,
      knownFingerprints: [],
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    db.ownerAdmins.push(newAdmin);
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Added authorized administrator',
      outcome: 'success',
      detail: `Created admin role for ${email} (${displayName}).`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });
    await persistDb(db);
    res.status(201).json({
      admin: serializeAdmin(newAdmin),
      recoveryKey,
      verificationCodeNotice: verificationCode,
    });
  });

  router.delete('/admins/:id', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db, {
      requirePrimary: true,
      requireRecentReauth: true,
    });
    if (!ctx) return;

    const target = db.ownerAdmins.find((a) => a.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Administrator not found.' });
      return;
    }
    if (target.role === 'primary') {
      res.status(400).json({ error: 'The Primary Owner account cannot be deleted.' });
      return;
    }

    db.ownerAdmins = db.ownerAdmins.filter((a) => a.id !== target.id);
    for (const [k, s] of Object.entries(db.sessions)) {
      if (s.adminId === target.id) delete db.sessions[k];
    }

    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Removed administrator',
      outcome: 'alert',
      detail: `Revoked administrator access for ${target.email}.`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
      acknowledged: true,
    });
    await persistDb(db);
    res.json({ ok: true, admins: db.ownerAdmins.map(serializeAdmin) });
  });

  // Application & AI Configuration
  router.patch('/config', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const body = asObj(req.body);
    if (typeof body.aiEnabled === 'boolean') {
      db.appConfig.aiEnabled = body.aiEnabled;
    }
    if (body.aiModel === 'gemini-4-hydrogen' || body.aiModel === 'gemini-4-neon') {
      db.appConfig.aiModel = body.aiModel;
    }
    if (typeof body.dailyAtlasQuota === 'number' && Number.isFinite(body.dailyAtlasQuota)) {
      db.appConfig.dailyAtlasQuota = Math.max(1, Math.min(500, Math.round(body.dailyAtlasQuota)));
    }
    if (typeof body.atlasSystemNote === 'string') {
      db.appConfig.atlasSystemNote = sanitizeText(body.atlasSystemNote, 400);
    }
    if (typeof body.registrationOpen === 'boolean') {
      db.appConfig.registrationOpen = body.registrationOpen;
    }
    if (typeof body.leaderboardThreshold === 'number' && Number.isFinite(body.leaderboardThreshold)) {
      db.appConfig.leaderboardThreshold = Math.max(
        2,
        Math.min(1000, Math.round(body.leaderboardThreshold))
      );
    }
    if (
      typeof body.ownerSessionIdleMinutes === 'number' &&
      Number.isFinite(body.ownerSessionIdleMinutes)
    ) {
      db.appConfig.ownerSessionIdleMinutes = Math.max(
        5,
        Math.min(120, Math.round(body.ownerSessionIdleMinutes))
      );
    }

    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: 'Updated platform configuration',
      outcome: 'success',
      detail: `AI: ${db.appConfig.aiEnabled ? db.appConfig.aiModel : 'Disabled'}, Signup: ${
        db.appConfig.registrationOpen ? 'Open' : 'Closed'
      }, Idle timeout: ${db.appConfig.ownerSessionIdleMinutes}m`,
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });

    await persistDb(db);
    options.onMaintenanceOrConfigChanged(db);
    res.json({ appConfig: db.appConfig });
  });

  router.post('/maintenance', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const body = asObj(req.body);
    const enabled = Boolean(body.enabled);
    const message =
      sanitizeText(body.message, 300) ||
      'STRYDE is undergoing scheduled maintenance. Normal access will return shortly.';

    db.maintenance = {
      enabled,
      message,
      updatedAt: new Date().toISOString(),
    };
    appendOwnerLog(db, {
      actorEmail: ctx.admin.email,
      event: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
      outcome: 'success',
      detail: message.slice(0, 120),
      ipMasked: maskIp(req.ip),
      suspicious: false,
    });
    await persistDb(db);
    res.json({ maintenance: db.maintenance });
  });

  router.patch('/feedback/:id', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    const item = db.feedback.find((f) => f.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Feedback entry not found.' });
      return;
    }
    item.status = item.status === 'reviewed' ? 'new' : 'reviewed';
    await persistDb(db);
    res.json({ ok: true, status: item.status });
  });

  router.post('/alerts/ack', ownerApiLimiter, async (req: Request, res: Response) => {
    const db = await loadDb();
    const ctx = await requireOwnerSession(req, res, db);
    if (!ctx) return;

    for (const log of db.ownerActivityLogs) {
      if (log.suspicious) log.acknowledged = true;
    }
    await persistDb(db);
    res.json({ ok: true });
  });

  return router;
}
