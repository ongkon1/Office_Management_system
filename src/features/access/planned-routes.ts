/**
 * Destinations that navigation links to but a later phase builds.
 *
 * Registering them keeps the shell honest: an authorized user following a nav
 * link reaches a page that says which phase delivers it, instead of a 404 that
 * looks like a defect. Anything *not* registered still returns not-found, so
 * unknown URLs are not silently absorbed.
 *
 * **This registry is empty as of Phase 7.** Every navigation destination now
 * resolves to a real screen, a feature-flag exclusion, or a deliberate
 * prototype that says so on the page itself — which is Phase 7's third exit
 * criterion. The mechanism stays because it is the right answer whenever
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

export const PLANNED_ROUTES: Readonly<Record<string, PlannedRoute>> = {};

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
