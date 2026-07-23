// Credential gate for hosted deployments (decision: passcode + bring-your-own-key).
// - No passcode configured (local dev): everything stays open, exactly as before.
// - Passcode configured (Fly secret): a correct passcode buys a session token
//   (HMAC-signed with a per-boot secret, so tokens die on restart and cannot be
//   forged or reused across deploys) that unlocks the server-held provider key.
//   Visitors without the passcode use their own key via headers instead.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Auth {
  mode: 'open' | 'gated';
  login(passcode: string): string | null;
  isAuthorized(token: string | undefined): boolean;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createAuth(passcode: string | undefined): Auth {
  if (!passcode) {
    return { mode: 'open', login: () => null, isAuthorized: () => true };
  }
  const bootSecret = randomBytes(32);
  const sign = (id: string) => createHmac('sha256', bootSecret).update(id).digest('hex');
  return {
    mode: 'gated',
    login(attempt: string) {
      if (!safeEqual(attempt, passcode)) return null;
      const id = randomBytes(16).toString('hex');
      return `${id}.${sign(id)}`;
    },
    isAuthorized(token: string | undefined) {
      if (!token) return false;
      const [id, mac] = token.split('.');
      if (!id || !mac) return false;
      return safeEqual(mac, sign(id));
    },
  };
}

/** Minimal cookie-header parser — one dependency fewer than cookie-parser. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Token bucket per client key (IP). Burnish's abuse-protection pattern: a
 * hosted demo with a shared key needs a ceiling more than it needs fairness.
 */
export class TokenBucket {
  private state = new Map<string, { tokens: number; last: number }>();

  constructor(
    private capacity: number,
    private refillMs: number,
    private now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const entry = this.state.get(key) ?? { tokens: this.capacity, last: t };
    const refilled = Math.floor((t - entry.last) / this.refillMs) * this.capacity;
    if (refilled > 0) {
      entry.tokens = Math.min(this.capacity, entry.tokens + refilled);
      entry.last = t;
    }
    if (entry.tokens <= 0) {
      this.state.set(key, entry);
      return false;
    }
    entry.tokens -= 1;
    this.state.set(key, entry);
    return true;
  }
}
