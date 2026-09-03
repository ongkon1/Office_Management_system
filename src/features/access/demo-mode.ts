/**
 * Demo mode gate.
 *
 * Development-only affordances — the account picker, the role switcher, the
 * session-expiry simulator — are rendered only when this returns true, so a
 * production build ships none of them.
 *
 * The environment variable is read through a literal member expression rather
 * than a dynamic key because Next inlines `process.env.NEXT_PUBLIC_*` at build
 * time only when it can see the full name in the source.
 */
export function isDemoMode(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  }
  // Default on in development so the demo is available without configuration.
  return process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
}
