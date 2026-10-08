import type { RoleKey, SessionUser } from '@/contracts/domain';

/**
 * `OH-FE-0307` — what an effective department appointment lets a person reach.
 *
 * The approved organization model is explicit that an appointment grants
 * **department-scoped Team Lead capabilities and nothing else**: it is not a
 * role, it is not stored as one, and it must not widen a division. So the
 * session's `roles` stay exactly what was granted, and these functions answer
 * the only question navigation and route access actually need — *may this
 * person use a Team Lead surface right now* — from
 * `departmentLeadScopes`, which the service already resolved for today.
 *
 * Two consequences worth stating, because both are easy to get wrong:
 *
 * - **The capability appears and disappears on its own.** The scopes come from
 *   effective-dated appointments, so an appointment that starts tomorrow grants
 *   nothing today, and one that ended yesterday stops granting without any
 *   revocation step (`OH-FE-0312`). Nothing is cached here.
 * - **Capability is additive.** A Team Lead keeps employee self-service, and so
 *   does an appointed lead: the Team Lead navigation includes the "My work"
 *   group, which is why switching the navigation role is safe rather than a
 *   trade.
 *
 * None of this is the control. Every screen still reads data through its
 * service, which scopes to the viewer's own departments; this only decides what
 * a person is *offered*.
 */

/** True while at least one appointment is effective today. */
export function leadsDepartmentsNow(user: SessionUser): boolean {
  return user.departmentLeadScopes.length > 0;
}

/**
 * The roles a session effectively holds for an access decision.
 *
 * `team_lead` is added for an appointed lead who does not hold the role, and
 * never written back to the session — `user.roles` remains what was granted.
 */
export function effectiveRoleKeys(user: SessionUser): readonly RoleKey[] {
  if (!leadsDepartmentsNow(user) || user.roles.includes('team_lead')) return user.roles;
  return [...user.roles, 'team_lead'];
}

/**
 * The navigation set to build.
 *
 * An appointed lead whose granted role is Employee gets the Team Lead
 * navigation, which contains everything the employee navigation does. A role
 * that already outranks it — HR, Management, Super Administrator — keeps its
 * own navigation, because an appointment adds reach, never removes it.
 */
export function navigationRole(user: SessionUser): RoleKey {
  return leadsDepartmentsNow(user) && user.primaryRole === 'employee'
    ? 'team_lead'
    : user.primaryRole;
}

/** How a person's own scope is described to them (`OH-FE-0309`). */
export function describeLeadScope(user: SessionUser): string | null {
  const scopes = user.departmentLeadScopes;
  if (scopes.length === 0) return null;
  const divisions = new Set(scopes.map((scope) => scope.divisionId)).size;
  const departmentWord = scopes.length === 1 ? 'department' : 'departments';
  const divisionWord = divisions === 1 ? 'division' : 'divisions';
  return `You lead ${scopes.length} ${departmentWord} across ${divisions} ${divisionWord}.`;
}
