export type SessionPresenceStatus = 'online' | 'idle' | 'expired';

export const SESSION_ONLINE_WINDOW_MS = 5 * 60_000;

export function sessionPresenceStatus(
  input: { readonly lastSeenAt: Date; readonly expiresAt: Date; readonly revokedAt: Date | null },
  now = new Date(),
): SessionPresenceStatus {
  if (input.revokedAt || input.expiresAt.getTime() <= now.getTime()) return 'expired';
  return now.getTime() - input.lastSeenAt.getTime() <= SESSION_ONLINE_WINDOW_MS
    ? 'online'
    : 'idle';
}

export interface UserAgentSummary {
  readonly browserLabel: string;
  readonly deviceLabel: string;
}

/** A deliberately small, dependency-free display parser. Raw user agents never reach the UI. */
export function summarizeUserAgent(userAgent: string | null): UserAgentSummary {
  if (!userAgent) return { browserLabel: 'Unknown browser', deviceLabel: 'Unknown device' };

  const browserLabel = /Edg\//.test(userAgent)
    ? 'Microsoft Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Google Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Mozilla Firefox'
          : /Safari\//.test(userAgent) && /Version\//.test(userAgent)
            ? 'Safari'
            : 'Other browser';

  const deviceLabel = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? /Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet'
        : /Windows/.test(userAgent)
          ? 'Windows computer'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'Mac computer'
            : /Linux/.test(userAgent)
              ? 'Linux computer'
              : 'Unknown device';

  return { browserLabel, deviceLabel };
}
