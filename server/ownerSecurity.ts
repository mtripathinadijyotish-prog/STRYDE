import crypto from 'node:crypto';
import type { Request } from 'express';
import {
  generateRecoveryKey,
  hashSecret,
  type DatabaseSchema,
  type OwnerActivityLog,
} from './store.ts';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function validateStrongPassword(password: string): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return { valid: false, error: 'Password must be between 12 and 128 characters.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one special character.' };
  }
  return { valid: true };
}

export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function decodeBase32(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function computeHotp(secretKey: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', secretKey).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(codeInt % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secretBase32: string, inputCode: string, windowSteps = 1): boolean {
  const cleanCode = inputCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const key = decodeBase32(secretBase32);
  if (key.length === 0) return false;
  const currentStep = Math.floor(Date.now() / 30_000);
  const inputBuf = Buffer.from(cleanCode);
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = computeHotp(key, currentStep + offset);
    const expectedBuf = Buffer.from(expected);
    if (
      expectedBuf.length === inputBuf.length &&
      crypto.timingSafeEqual(expectedBuf, inputBuf)
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(email: string, secretBase32: string, issuer = 'STRYDE Owner'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function getOptionalCipherKey(): Buffer | null {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptTotpSecret(plainSecret: string): string {
  const key = getOptionalCipherKey();
  if (!key) {
    return `b32:${plainSecret}`;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.startsWith('b32:')) {
    return stored.slice(4);
  }
  if (stored.startsWith('enc:v1:')) {
    const key = getOptionalCipherKey();
    if (!key) return null;
    const parts = stored.split(':');
    if (parts.length !== 5) return null;
    try {
      const iv = Buffer.from(parts[2], 'hex');
      const tag = Buffer.from(parts[3], 'hex');
      const data = Buffer.from(parts[4], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
  return stored;
}

export function generateOneTimeCodes(count = 8): { plain: string[]; hashed: string[] } {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = (len: number) => {
      const b = crypto.randomBytes(len);
      let s = '';
      for (let j = 0; j < len; j++) s += chars[b[j] % chars.length];
      return s;
    };
    const code = `${part(4)}-${part(4)}`;
    plain.push(code);
    hashed.push(hashSecret(code));
  }
  return { plain, hashed };
}

export function generateOwnerRecoveryKey(): string {
  return generateRecoveryKey().replace(/^STRYDE-/, 'STRYDE-OWN-');
}

export function generateVerificationCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function maskIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  if (clean.includes(':')) {
    const parts = clean.split(':');
    return `${parts.slice(0, 3).join(':')}:xxxx`;
  }
  return clean;
}

export function appendOwnerLog(
  db: DatabaseSchema,
  entry: Omit<OwnerActivityLog, 'id' | 'timestamp'>
): void {
  db.ownerActivityLogs.unshift({
    id: `olog-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  db.ownerActivityLogs = db.ownerActivityLogs.slice(0, 200);
}

export function getWebAuthnRpContext(req: Request): {
  rpID: string;
  rpName: string;
  expectedOrigins: string[];
} {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const rawHost = forwardedHost || String(req.headers.host || 'localhost:3000').trim();
  const hostname = rawHost.split(':')[0] || 'localhost';

  const expectedOrigins = new Set<string>();
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (originHeader) {
    expectedOrigins.add(originHeader);
  }
  const appUrl = (process.env.APP_URL || '').trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    try {
      expectedOrigins.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = req.secure || protoHeader === 'https' ? 'https' : 'http';
  expectedOrigins.add(`${proto}://${rawHost}`);
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    expectedOrigins.add(`http://${rawHost}`);
    expectedOrigins.add(`https://${rawHost}`);
  }

  return {
    rpID: hostname,
    rpName: 'STRYDE Owner Administration',
    expectedOrigins: Array.from(expectedOrigins),
  };
}
