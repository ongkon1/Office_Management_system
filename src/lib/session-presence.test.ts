import { describe, expect, it } from 'vitest';
import { sessionPresenceStatus, summarizeUserAgent } from './session-presence';

const now = new Date('2026-11-19T06:00:00.000Z');

describe('session presence', () => {
  it('distinguishes online, idle, and expired sessions without relying on colour', () => {
    expect(sessionPresenceStatus({ lastSeenAt: new Date('2026-11-19T05:58:00Z'), expiresAt: new Date('2026-11-19T08:00:00Z'), revokedAt: null }, now)).toBe('online');
    expect(sessionPresenceStatus({ lastSeenAt: new Date('2026-11-19T05:50:00Z'), expiresAt: new Date('2026-11-19T08:00:00Z'), revokedAt: null }, now)).toBe('idle');
    expect(sessionPresenceStatus({ lastSeenAt: new Date('2026-11-19T05:59:00Z'), expiresAt: new Date('2026-11-19T05:59:59Z'), revokedAt: null }, now)).toBe('expired');
    expect(sessionPresenceStatus({ lastSeenAt: now, expiresAt: new Date('2026-11-19T08:00:00Z'), revokedAt: now }, now)).toBe('expired');
  });

  it('summarizes common browsers and devices without exposing the raw user agent', () => {
    expect(summarizeUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toEqual({ browserLabel: 'Google Chrome', deviceLabel: 'Windows computer' });
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1')).toEqual({ browserLabel: 'Safari', deviceLabel: 'iPhone' });
  });
});
