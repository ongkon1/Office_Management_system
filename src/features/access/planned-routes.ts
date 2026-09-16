/**
 * Destinations that navigation links to but a later phase builds.
 *
 * Registering them keeps the shell honest: an authorized user following a nav
 * link reaches a page that says which phase delivers it, instead of a 404 that
 * looks like a defect. Anything *not* registered still returns not-found, so
 * unknown URLs are not silently absorbed.
 *
 * The registry was empty from Phase 7 until Phase 11, when Meeting Minutes
 * joined every role's navigation (`FE-1101`) ahead of its screens. The list
 * itself shipped in `FE-1110` and its concrete page takes precedence over the
 * catch-all; the entry still serves `/meeting-minutes/new`, `/[id]` and
 * `/[id]/edit` through the ancestor fallback. Remove it once those screens
 * exist (`FE-1113`–`FE-1126`), so the registry again holds only what is
 * genuinely still to come. The mechanism stays because it is the right answer whenever
 * navigation runs ahead of a screen again; `PlannedScreen` renders an entry,
 * and `findPlannedRoute` falls back to the closest registered ancestor.
 */

export interface PlannedRoute {
  readonly title: string;
  /** Frontend milestone phase that delivers it. */
  readonly phase: number;
  readonly summary: string;
  /** Representative task ids, shown so the plan is traceable from the screen. */
  readonly tasks: string;
}

export const PLANNED_ROUTES: Readonly<Record<string, PlannedRoute>> = {
  '/meeting-minutes': {
    title: 'Meeting Minutes',
    phase: 11,
    summary:
      'Client- and project-scoped meeting records, with optional AI-generated tasks linked back to their source minute.',
    tasks: 'FE-1110–FE-1126',
  },
};

export function findPlannedRoute(pathname: string): PlannedRoute | null {
  if (PLANNED_ROUTES[pathname]) return PLANNED_ROUTES[pathname];

  // Fall back to the closest registered ancestor, so `/projects/123` resolves
  // to the Projects placeholder rather than not-found.
  const segments = pathname.split('/').filter(Boolean);
  for (let depth = segments.length - 1; depth > 0; depth -= 1) {
    const candidate = `/${segments.slice(0, depth).join('/')}`;
    if (PLANNED_ROUTES[candidate]) return PLANNED_ROUTES[candidate];
  }
  return null;
}
