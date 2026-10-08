import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import type { ActorPolicyContext } from '@/server/authorization/policy';

/**
 * Who leads whom, on a date (`OH-BE-0301` … `OH-BE-0313`).
 *
 * Every workflow that used to read `employee_division_assignments.lead_employee_id`
 * directly now asks this module instead. Six copies of "find the Team Lead" is
 * how WFH approval, evaluation defaults, notifications and the task-review
 * queue come to disagree about who someone reports to — and a disagreement here
 * means a record reaching a reviewer it should not have.
 *
 * **Precedence is per assignment, not global.** An assignment placed in a
 * department whose appointment is effective on the date resolves to that
 * department's lead. An assignment the Phase B1 backfill could not place — the
 * rows listed in `department_migration_review` — keeps its frozen legacy lead,
 * so nobody loses routing during the compatibility deployment. That fallback
 * disappears on its own as placements are completed, and the legacy columns are
 * removed in the later cutover (`OH-BE-0115`).
 *
 * **An inactive department grants nothing**, matching the authorization context:
 * leadership of a department that has been deactivated is history, not
 * authority.
 */

export interface EffectiveAuthorityRow {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly divisionId: string;
  readonly departmentId: string | null;
  /** The appointment's lead, or the frozen legacy lead where none applies. */
  readonly leadEmployeeId: string | null;
  /** True when the answer came from a department appointment. */
  readonly fromDepartment: boolean;
  readonly isPrimary: boolean;
  readonly isGovernment: boolean;
}

interface AuthorityRow extends RowDataPacket {
  assignment_id: string;
  employee_id: string;
  division_id: string;
  department_id: string | null;
  department_lead_employee_id: string | null;
  legacy_lead_employee_id: string | null;
  is_primary: number;
  is_government: number;
}

type Executor = Pick<Pool | PoolConnection, 'execute'>;

/**
 * One SQL shape for everything below.
 *
 * The appointment is joined through an **active** department and resolved on
 * the same date as the assignment, so a transfer and a lead change are both
 * answered for the business date asked about rather than for today.
 */
const AUTHORITY_SELECT = `SELECT a.id AS assignment_id,a.employee_id,a.division_id,a.department_id,
    dla.lead_employee_id AS department_lead_employee_id,
    a.lead_employee_id AS legacy_lead_employee_id,
    a.is_primary,v.is_government
  FROM employee_division_assignments a
  JOIN divisions v ON v.id=a.division_id
  LEFT JOIN departments d ON d.id=a.department_id AND d.is_active=TRUE
  LEFT JOIN department_lead_assignments dla
    ON dla.department_id=d.id AND dla.effective_from<=? AND (dla.effective_to IS NULL OR dla.effective_to>=?)
  WHERE a.is_active=TRUE AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)`;

/** The precedence rule, isolated so it is testable without a database. */
export function resolveAuthority(row: {
  readonly departmentLeadEmployeeId: string | null;
  readonly legacyLeadEmployeeId: string | null;
}): { readonly leadEmployeeId: string | null; readonly fromDepartment: boolean } {
  return row.departmentLeadEmployeeId !== null
    ? { leadEmployeeId: row.departmentLeadEmployeeId, fromDepartment: true }
    : { leadEmployeeId: row.legacyLeadEmployeeId, fromDepartment: false };
}

function mapRow(row: AuthorityRow): EffectiveAuthorityRow {
  const resolved = resolveAuthority({
    departmentLeadEmployeeId: row.department_lead_employee_id,
    legacyLeadEmployeeId: row.legacy_lead_employee_id,
  });
  return {
    assignmentId: row.assignment_id,
    employeeId: row.employee_id,
    divisionId: row.division_id,
    departmentId: row.department_id,
    leadEmployeeId: resolved.leadEmployeeId,
    fromDepartment: resolved.fromDepartment,
    isPrimary: Boolean(row.is_primary),
    isGovernment: Boolean(row.is_government),
  };
}

/** Every effective assignment of one employee, with its resolved authority. */
export async function authorityForEmployee(
  executor: Executor,
  employeeId: string,
  onDate: string,
): Promise<readonly EffectiveAuthorityRow[]> {
  const [rows] = await executor.execute<AuthorityRow[]>(
    `${AUTHORITY_SELECT} AND a.employee_id=? ORDER BY a.is_primary DESC,a.effective_from`,
    [onDate, onDate, onDate, onDate, employeeId],
  );
  return rows.map(mapRow);
}

/**
 * Who may act as this employee's Team Lead on a date.
 *
 * An employee working in several divisions has a lead per division, so this is
 * a set. Callers that must route to exactly one reviewer use
 * `primaryLeadOfEmployee` instead.
 */
export async function leadsOfEmployee(
  executor: Executor,
  employeeId: string,
  onDate: string,
): Promise<readonly string[]> {
  const rows = await authorityForEmployee(executor, employeeId, onDate);
  return [
    ...new Set(
      rows
        .map((row) => row.leadEmployeeId)
        .filter((id): id is string => id !== null && id !== employeeId),
    ),
  ];
}

/**
 * The lead of the employee's **primary** placement on a date.
 *
 * WFH and leave are decided by one reviewer, and which one must not depend on
 * how many divisions the person works in. The primary assignment is what
 * decides, exactly as it did before departments existed; what changed is where
 * that assignment's lead comes from.
 */
export async function primaryLeadOfEmployee(
  executor: Executor,
  employeeId: string,
  onDate: string,
): Promise<string | null> {
  const rows = await authorityForEmployee(executor, employeeId, onDate);
  const primary = rows.find((row) => row.isPrimary) ?? rows[0];
  return primary?.leadEmployeeId ?? null;
}

/** Every employee this lead reaches on a date, through either route. */
export async function employeesLedBy(
  executor: Executor,
  leadEmployeeId: string,
  onDate: string,
): Promise<readonly string[]> {
  const [rows] = await executor.execute<AuthorityRow[]>(
    `${AUTHORITY_SELECT} AND (dla.lead_employee_id=? OR (dla.lead_employee_id IS NULL AND a.lead_employee_id=?))`,
    [onDate, onDate, onDate, onDate, leadEmployeeId, leadEmployeeId],
  );
  return [
    ...new Set(
      rows
        .map(mapRow)
        .filter((row) => row.leadEmployeeId === leadEmployeeId && row.employeeId !== leadEmployeeId)
        .map((row) => row.employeeId),
    ),
  ];
}

/** The departments one employee is effectively placed in on a date. */
export async function departmentsOfEmployee(
  executor: Executor,
  employeeId: string,
  onDate: string,
): Promise<readonly { readonly departmentId: string; readonly divisionId: string }[]> {
  const rows = await authorityForEmployee(executor, employeeId, onDate);
  return rows
    .filter((row): row is EffectiveAuthorityRow & { departmentId: string } => row.departmentId !== null)
    .map((row) => ({ departmentId: row.departmentId, divisionId: row.divisionId }));
}

/**
 * Whether an actor's own authority reaches a record about `employeeId`.
 *
 * Pure, and deliberately the only place this combination is written: an actor
 * reaches an employee as themselves, as HR or a Super Administrator, through a
 * division-scoped lead relationship, or through an effective department
 * appointment. A department appointment does **not** widen `divisionIds`
 * (Phase B2), so a check that tested the division alone silently excluded every
 * department lead — which is exactly the defect this function exists to stop
 * from being re-introduced in six places.
 */
export function reachesEmployee(
  actor: ActorPolicyContext,
  target: { readonly employeeId: string; readonly divisionId?: string },
): boolean {
  if (actor.employeeId === target.employeeId) return true;
  if (actor.roles.includes('super_admin') || actor.roles.includes('hr_manager')) return true;
  if (!actor.employeeIds.has(target.employeeId)) return false;
  if ((actor.departmentIds?.size ?? 0) > 0) return true;
  return target.divisionId === undefined || actor.divisionIds.has(target.divisionId);
}
