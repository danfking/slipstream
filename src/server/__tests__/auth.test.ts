import { describe, expect, it } from 'vitest';
import { createAuth, parseCookies, TokenBucket } from '../auth.js';

describe('createAuth', () => {
  it('open mode when no passcode is configured', () => {
    const auth = createAuth(undefined);
    expect(auth.mode).toBe('open');
    expect(auth.isAuthorized(undefined)).toBe(true);
  });

  it('gated mode issues a token for the right passcode and rejects the wrong one', () => {
    const auth = createAuth('tide-and-time');
    expect(auth.mode).toBe('gated');
    expect(auth.login('wrong')).toBeNull();
    const token = auth.login('tide-and-time');
    expect(token).toBeTruthy();
    expect(auth.isAuthorized(token!)).toBe(true);
    expect(auth.isAuthorized('forged-token')).toBe(false);
    expect(auth.isAuthorized(undefined)).toBe(false);
  });

  it('tokens are unguessable per boot (different instances reject each other)', () => {
    const a = createAuth('pass');
    const b = createAuth('pass');
    const token = a.login('pass')!;
    expect(b.isAuthorized(token)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses a cookie header into a map', () => {
    expect(parseCookies('a=1; slipstream_session=abc%3Ddef; b=2')).toEqual({
      a: '1',
      slipstream_session: 'abc=def',
      b: '2',
    });
  });

  it('handles missing header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('TokenBucket', () => {
  it('allows a burst then refuses until refill', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 60_000, () => now);
    expect(bucket.take('ip1')).toBe(true);
    expect(bucket.take('ip1')).toBe(true);
    expect(bucket.take('ip1')).toBe(true);
    expect(bucket.take('ip1')).toBe(false);
    expect(bucket.take('ip2')).toBe(true); // other clients unaffected
    now = 61_000;
    expect(bucket.take('ip1')).toBe(true); // refilled
  });
});
