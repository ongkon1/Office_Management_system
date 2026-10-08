/**
 * Stand-in for Next's `server-only` guard under Vitest.
 *
 * The guard is a build-time marker: importing it from a client bundle fails the
 * build, which is exactly why server services declare it. Node has no such
 * package, so the backend test config aliases it here rather than having server
 * modules drop a protection that matters in production.
 */
export {};
