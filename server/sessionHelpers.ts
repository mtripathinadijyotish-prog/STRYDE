import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  generateSessionToken,
  hashToken,
  type DatabaseSchema,
} from './store.ts';

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(windowMs: number, maxRequests: number, label: string) {
  const buckets = new Map<string, RateBucket>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.ip || 'local';
    const now = Date.now();

    if (buckets.size > 1000) {
      for (const [k, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) buckets.delete(k);
      }
    }

    const existing = buckets.get(clientKey);
    if (!existing || now > existing.resetAt) {
      buckets.set(clientKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      res.status(429).json({
        error: `Too many requests to ${label}. Please wait a moment before trying again.`,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeEmail(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().slice(0, 120);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function asObj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return req.secure || proto === 'https';
}

export function setSessionCookie(req: Request, res: Response, name: string, token: string): void {
  const attrs = [`${name}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'Max-Age=86400'];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  const existing = res.getHeader('Set-Cookie');
  const cookieStr = attrs.join('; ');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

export function clearSessionCookie(req: Request, res: Response, name: string): void {
  const attrs = [`${name}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  const existing = res.getHeader('Set-Cookie');
  const cookieStr = attrs.join('; ');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

export function verifyMutationOrigin(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (
    req.headers.authorization ||
    req.headers['x-requested-with'] === 'STRYDE' ||
    req.headers['x-requested-with'] === 'ChronosHUD'
  ) {
    return true;
  }
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch {
    return false;
  }
}

export function extractBearerToken(req: Request, cookieName = 'chronos_session'): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token.length >= 16) return token;
  }
  const cookies = parseCookies(req);
  const fromCookie = cookies[cookieName];
  return fromCookie && fromCookie.length >= 16 ? fromCookie : null;
}

export function pruneExpiredSessions(db: DatabaseSchema): void {
  const now = Date.now();
  for (const [k, s] of Object.entries(db.sessions)) {
    if (s.expiresAt <= now) {
      delete db.sessions[k];
    }
  }
}

export function createSessionRecord(
  db: DatabaseSchema,
  options: {
    userId: string;
    role: 'user' | 'owner' | 'admin';
    adminId?: string;
    recentReauthAt?: number;
    userAgent?: string;
    ipMasked?: string;
  }
): string {
  pruneExpiredSessions(db);
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  db.sessions[tokenHash] = {
    tokenHash,
    userId: options.userId,
    role: options.role,
    adminId: options.adminId,
    expiresAt: now + SESSION_TTL_MS,
    lastActivityAt: now,
    recentReauthAt: options.recentReauthAt,
    userAgent: options.userAgent,
    ipMasked: options.ipMasked,
    createdAt: new Date(now).toISOString(),
  };
  return rawToken;
}

export function timingSafeCompareStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
