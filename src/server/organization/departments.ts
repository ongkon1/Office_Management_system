import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { inTransaction } from '@/server/database/transaction';
import {
  appointmentDecision,
  conflictingPlacement,
  type LeadPeriod,
  type PlacementCandidate,
} from './department-rules';

/**
 * Department hierarchy persistence (`OH-BE-0106`, `OH-BE-0107`, `OH-BE-0113`).
 *
 * This layer owns the invariants that need the database to hold still:
 *
 * - **One effective placement per employee, division and date.** Two of an
 *   employee's overlapping assignments in the same division may not name
 *   different departments. Nothing in the schema can express that, so it is
 *   checked inside a transaction that has already locked the rows it checked.
 * - **Non-overlapping lead periods.** `uq_department_single_open_period` and
 *   `uq_department_lead_start` catch the common races in the schema; an arbitrary
 *   closed range still needs the locked read, and appointing closes the open
 *   period rather than editing a finished one.
 * - **Same-division placement**, which the composite foreign key makes
 *   unrepresentable; the check here exists to return a usable answer instead of
 *   a constraint violation.
 *
 * It owns no policy. Who may call this, what gets audited, whether an
 * appointment may start in the past, and how a refusal is phrased for a person
 * belong to the application service (Phase B2), which is why these methods
 * return outcome values rather than `Result<T>`.
 */

export interface DepartmentRecord {
  readonly id: string;
  readonly divisionId: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly deactivationReason: string | null;
  readonly version: number;
}

export interface DepartmentLeadPeriodRecord {
  readonly id: string;
  readonly departmentId: string;
  readonly leadEmployeeId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reason: string | null;
  readonly version: number;
}

export interface DepartmentMemberRecord {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly divisionId: string;
  readonly departmentId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly isEffective: boolean;
}

export interface DepartmentLeadScopeRecord {
  readonly departmentId: string;
  readonly divisionId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface DepartmentReferenceCounts {
  /** Placements ever recorded against the department, effective or ended. */
  readonly placementCount: number;
  readonly appointmentCount: number;
}

export interface DepartmentWriteInput {
  readonly id: string;
  readonly divisionId: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
}

export interface DepartmentLeadAppointmentInput {
  readonly id: string;
  readonly departmentId: string;
  readonly leadEmployeeId: string;
  readonly effectiveFrom: string;
  readonly reason: string | null;
}

export type PlacementOutcome =
  | { readonly status: 'placed' }
  | { readonly status: 'assignment_missing' }
  | { readonly status: 'department_missing' }
  | { readonly status: 'department_inactive' }
  | { readonly status: 'different_division'; readonly departmentDivisionId: string }
  | { readonly status: 'conflicting_placement'; readonly assignmentId: string; readonly departmentId: string }
  | { readonly status: 'stale_version' };

export type AppointLeadOutcome =
  | { readonly status: 'appointed'; readonly closedPeriodId: string | null }
  | { readonly status: 'department_missing' }
  | { readonly status: 'department_inactive' }
  | { readonly status: 'ineligible_lead' }
  | { readonly status: 'already_leads'; readonly periodId: string }
  | { readonly status: 'period_overlap'; readonly periodId: string };

interface DepartmentRow extends RowDataPacket {
  id: string;
  division_id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: number;
  deactivation_reason: string | null;
  version: number;
}

interface LeadPeriodRow extends RowDataPacket {
  id: string;
  department_id: string;
  lead_employee_id: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  reason: string | null;
  version: number;
}

interface MemberRow extends RowDataPacket {
  assignment_id: string;
  employee_id: string;
  division_id: string;
  department_id: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  is_effective: number;
}

const DEPARTMENT_COLUMNS =
  'id,division_id,name,code,description,is_active,deactivation_reason,version';
const LEAD_COLUMNS = 'id,department_id,lead_employee_id,effective_from,effective_to,reason,version';

/** MySQL returns DATE either as a string or a Date depending on driver flags. */
function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapDepartment(row: DepartmentRow): DepartmentRecord {
  return {
    id: row.id,
    divisionId: row.division_id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: Boolean(row.is_active),
    deactivationReason: row.deactivation_reason,
    version: Number(row.version),
  };
}

function mapLeadPeriod(row: LeadPeriodRow): DepartmentLeadPeriodRecord {
  return {
    id: row.id,
    departmentId: row.department_id,
    leadEmployeeId: row.lead_employee_id,
    effectiveFrom: isoDate(row.effective_from),
    effectiveTo: row.effective_to === null ? null : isoDate(row.effective_to),
    reason: row.reason,
    version: Number(row.version),
  };
}

export class MysqlDepartmentRepository {
  constructor(private readonly pool: Pool) {}

  private executor(connection?: PoolConnection) {
    return connection ?? this.pool;
  }

  async list(
    filter: { readonly divisionId?: string | null; readonly includeInactive?: boolean } = {},
    connection?: PoolConnection,
  ): Promise<readonly DepartmentRecord[]> {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter.divisionId) {
      clauses.push('division_id = ?');
      values.push(filter.divisionId);
    }
    if (filter.includeInactive !== true) clauses.push('is_active = TRUE');
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await this.executor(connection).execute<DepartmentRow[]>(
      `SELECT ${DEPARTMENT_COLUMNS} FROM departments ${where} ORDER BY division_id, normalized_name`,
      values,
    );
    return rows.map(mapDepartment);
  }

  async findById(id: string, connection?: PoolConnection): Promise<DepartmentRecord | null> {
    const [rows] = await this.executor(connection).execute<DepartmentRow[]>(
      `SELECT ${DEPARTMENT_COLUMNS} FROM departments WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapDepartment(rows[0]) : null;
  }

  /**
   * Every placement the department has held, with `isEffective` resolved on
   * `onDate`. Ended placements are returned too: they are the history that
   * stops a referenced department being deleted or moved.
   */
  async members(
    departmentId: string,
    onDate: string,
    connection?: PoolConnection,
  ): Promise<readonly DepartmentMemberRecord[]> {
    const [rows] = await this.executor(connection).execute<MemberRow[]>(
      `SELECT a.id AS assignment_id,a.employee_id,a.division_id,a.department_id,
              a.effective_from,a.effective_to,
              (a.is_active = TRUE AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)) AS is_effective
       FROM employee_division_assignments a
       WHERE a.department_id = ?
       ORDER BY is_effective DESC, a.effective_from DESC`,
      [onDate, onDate, departmentId],
    );
    return rows.map((row) => ({
      assignmentId: row.assignment_id,
      employeeId: row.employee_id,
      divisionId: row.division_id,
      departmentId: row.department_id,
      effectiveFrom: isoDate(row.effective_from),
      effectiveTo: row.effective_to === null ? null : isoDate(row.effective_to),
      isEffective: Boolean(row.is_effective),
    }));
  }

  async leadHistory(
    departmentId: string,
    connection?: PoolConnection,
  ): Promise<readonly DepartmentLeadPeriodRecord[]> {
    const [rows] = await this.executor(connection).execute<LeadPeriodRow[]>(
      `SELECT ${LEAD_COLUMNS} FROM department_lead_assignments
       WHERE department_id = ? ORDER BY effective_from DESC`,
      [departmentId],
    );
    return rows.map(mapLeadPeriod);
  }

  async effectiveLead(
    departmentId: string,
    onDate: string,
    connection?: PoolConnection,
  ): Promise<DepartmentLeadPeriodRecord | null> {
    const [rows] = await this.executor(connection).execute<LeadPeriodRow[]>(
      `SELECT ${LEAD_COLUMNS} FROM department_lead_assignments
       WHERE department_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       LIMIT 1`,
      [departmentId, onDate, onDate],
    );
    return rows[0] ? mapLeadPeriod(rows[0]) : null;
  }

  /**
   * The department scopes one employee leads on a date.
   *
   * An appointment outside its dates returns nothing, which is what lets
   * authorization be reproduced for a historical date instead of inferred from
   * a role grant (`OH-BE-0205`, consumed by Phase B2).
   */
  async leadScopes(
    leadEmployeeId: string,
    onDate: string,
    connection?: PoolConnection,
  ): Promise<readonly DepartmentLeadScopeRecord[]> {
    const [rows] = await this.executor(connection).execute<LeadPeriodRow[]>(
      `SELECT dla.id,dla.department_id,dla.lead_employee_id,dla.effective_from,dla.effective_to,dla.reason,dla.version,
              d.division_id AS division_id
       FROM department_lead_assignments dla
       JOIN departments d ON d.id = dla.department_id AND d.is_active = TRUE
       WHERE dla.lead_employee_id = ? AND dla.effective_from <= ?
         AND (dla.effective_to IS NULL OR dla.effective_to >= ?)
       ORDER BY d.division_id, dla.department_id`,
      [leadEmployeeId, onDate, onDate],
    );
    return rows.map((row) => ({
      departmentId: row.department_id,
      divisionId: String((row as LeadPeriodRow & { division_id: string }).division_id),
      effectiveFrom: isoDate(row.effective_from),
      effectiveTo: row.effective_to === null ? null : isoDate(row.effective_to),
    }));
  }

  async referenceCounts(
    departmentId: string,
    connection?: PoolConnection,
  ): Promise<DepartmentReferenceCounts> {
    const [rows] = await this.executor(connection).execute<(RowDataPacket & {
      placements: number;
      appointments: number;
    })[]>(
      `SELECT
         (SELECT COUNT(*) FROM employee_division_assignments WHERE department_id = ?) AS placements,
         (SELECT COUNT(*) FROM department_lead_assignments WHERE department_id = ?) AS appointments`,
      [departmentId, departmentId],
    );
    return {
      placementCount: Number(rows[0]?.placements ?? 0),
      appointmentCount: Number(rows[0]?.appointments ?? 0),
    };
  }

  async insert(
    input: DepartmentWriteInput,
    actorUserId: string | null,
    connection?: PoolConnection,
  ): Promise<void> {
    await this.executor(connection).execute(
      `INSERT INTO departments(id,division_id,name,code,description,created_by_user_id,updated_by_user_id)
       VALUES(?,?,?,?,?,?,?)`,
      [input.id, input.divisionId, input.name, input.code, input.description, actorUserId, actorUserId],
    );
  }

  /** Optimistic concurrency: a stale version changes nothing and reports false. */
  async update(
    input: DepartmentWriteInput,
    expectedVersion: number,
    actorUserId: string | null,
    connection?: PoolConnection,
  ): Promise<boolean> {
    const [result] = await this.executor(connection).execute<ResultSetHeader>(
      `UPDATE departments
       SET division_id = ?, name = ?, code = ?, description = ?, updated_by_user_id = ?, version = version + 1
       WHERE id = ? AND version = ?`,
      [
        input.divisionId,
        input.name,
        input.code,
        input.description,
        actorUserId,
        input.id,
        expectedVersion,
      ],
    );
    return result.affectedRows === 1;
  }

  async setActive(
    departmentId: string,
    isActive: boolean,
    reason: string | null,
    expectedVersion: number,
    actorUserId: string | null,
    connection?: PoolConnection,
  ): Promise<boolean> {
    const [result] = await this.executor(connection).execute<ResultSetHeader>(
      `UPDATE departments
       SET is_active = ?, deactivated_at = ?, deactivation_reason = ?, updated_by_user_id = ?, version = version + 1
       WHERE id = ? AND version = ?`,
      [
        isActive,
        isActive ? null : new Date().toISOString().slice(0, 19).replace('T', ' '),
        isActive ? null : reason,
        actorUserId,
        departmentId,
        expectedVersion,
      ],
    );
    return result.affectedRows === 1;
  }

  /**
   * Deletes a department nothing has ever referenced.
   *
   * The reference check and the delete share one locked transaction, so a
   * placement created in between cannot be orphaned; the foreign keys would
   * refuse it anyway, and this turns that refusal into an answer.
   */
  async deleteIfUnreferenced(departmentId: string): Promise<'deleted' | 'referenced' | 'missing'> {
    return inTransaction(this.pool, async (connection) => {
      const [locked] = await connection.execute<DepartmentRow[]>(
        `SELECT ${DEPARTMENT_COLUMNS} FROM departments WHERE id = ? FOR UPDATE`,
        [departmentId],
      );
      if (!locked[0]) return 'missing';
      const counts = await this.referenceCounts(departmentId, connection);
      if (counts.placementCount > 0 || counts.appointmentCount > 0) return 'referenced';
      await connection.execute('DELETE FROM departments WHERE id = ?', [departmentId]);
      return 'deleted';
    });
  }

  /**
   * `OH-BE-0106`. Places an assignment in a department.
   *
   * The assignment row is locked first, then every other overlapping
   * assignment of the same employee in the same division is read under that
   * lock. Without the lock two concurrent placements each see the other as
   * absent and both commit, which is how an employee ends up in two
   * departments of one division on the same day.
   */
  async placeAssignment(
    assignmentId: string,
    departmentId: string,
    expectedVersion: number | null,
    actorUserId: string | null,
  ): Promise<PlacementOutcome> {
    return inTransaction(this.pool, async (connection) => {
      const [assignments] = await connection.execute<(RowDataPacket & {
        id: string;
        employee_id: string;
        division_id: string;
        effective_from: string | Date;
        effective_to: string | Date | null;
        version: number;
      })[]>(
        `SELECT id,employee_id,division_id,effective_from,effective_to,version
         FROM employee_division_assignments WHERE id = ? FOR UPDATE`,
        [assignmentId],
      );
      const assignment = assignments[0];
      if (!assignment) return { status: 'assignment_missing' };
      if (expectedVersion !== null && Number(assignment.version) !== expectedVersion) {
        return { status: 'stale_version' };
      }

      const department = await this.findById(departmentId, connection);
      if (!department) return { status: 'department_missing' };
      if (department.divisionId !== assignment.division_id) {
        return { status: 'different_division', departmentDivisionId: department.divisionId };
      }
      if (!department.isActive) return { status: 'department_inactive' };

      /*
       * Every other assignment of this employee in this division, read under
       * the same lock, then judged by `conflictingPlacement`. Selecting the
       * candidates rather than the conflict keeps the rule in one place and
       * makes it testable without MySQL.
       */
      const [candidateRows] = await connection.execute<(RowDataPacket & {
        id: string;
        department_id: string | null;
        effective_from: string | Date;
        effective_to: string | Date | null;
        is_active: number;
      })[]>(
        `SELECT id,department_id,effective_from,effective_to,is_active
         FROM employee_division_assignments
         WHERE employee_id = ? AND division_id = ? AND id <> ?
         FOR UPDATE`,
        [assignment.employee_id, assignment.division_id, assignmentId],
      );
      const candidates: readonly PlacementCandidate[] = candidateRows.map((row) => ({
        assignmentId: row.id,
        departmentId: row.department_id,
        effectiveFrom: isoDate(row.effective_from),
        effectiveTo: row.effective_to === null ? null : isoDate(row.effective_to),
        isActive: Boolean(row.is_active),
      }));
      const conflict = conflictingPlacement(candidates, {
        assignmentId,
        departmentId,
        effectiveFrom: isoDate(assignment.effective_from),
        effectiveTo: assignment.effective_to === null ? null : isoDate(assignment.effective_to),
      });
      if (conflict) {
        return {
          status: 'conflicting_placement',
          assignmentId: conflict.assignmentId,
          departmentId: conflict.departmentId ?? '',
        };
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE employee_division_assignments
         SET department_id = ?, version = version + 1
         WHERE id = ?${expectedVersion === null ? '' : ' AND version = ?'}`,
        expectedVersion === null
          ? [departmentId, assignmentId]
          : [departmentId, assignmentId, expectedVersion],
      );
      if (result.affectedRows !== 1) return { status: 'stale_version' };

      /* Recorded for the audit trail the application service writes. */
      void actorUserId;
      return { status: 'placed' };
    });
  }

  /**
   * `OH-BE-0107`. Appoints a lead from `effectiveFrom`.
   *
   * Inside one transaction that locks the department: the whole history is read
   * under that lock, an appointment starting on or after the new date is
   * refused rather than resolved, the open period is closed the day before the
   * new one begins, and the new row is appended. A period that has already
   * ended is never touched — that is what keeps a past authorization decision
   * reproducible.
   */
  async appointLead(
    input: DepartmentLeadAppointmentInput,
    actorUserId: string | null,
  ): Promise<AppointLeadOutcome> {
    return inTransaction(this.pool, async (connection) => {
      const [departments] = await connection.execute<DepartmentRow[]>(
        `SELECT ${DEPARTMENT_COLUMNS} FROM departments WHERE id = ? FOR UPDATE`,
        [input.departmentId],
      );
      const departmentRow = departments[0];
      if (!departmentRow) return { status: 'department_missing' };
      const department = mapDepartment(departmentRow);
      if (!department.isActive) return { status: 'department_inactive' };

      /*
       * Eligibility is an active employee with an effective assignment in this
       * department's division on the date being appointed — not in the
       * department, and not a company-wide Team Lead role.
       */
      const [eligible] = await connection.execute<(RowDataPacket & { eligible: number })[]>(
        `SELECT EXISTS(
           SELECT 1 FROM employee_division_assignments a
           JOIN employees e ON e.id = a.employee_id AND e.status = 'active'
           WHERE a.employee_id = ? AND a.division_id = ? AND a.is_active = TRUE
             AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
         ) AS eligible`,
        [input.leadEmployeeId, department.divisionId, input.effectiveFrom, input.effectiveFrom],
      );
      if (!Number(eligible[0]?.eligible ?? 0)) return { status: 'ineligible_lead' };

      const [periods] = await connection.execute<LeadPeriodRow[]>(
        `SELECT ${LEAD_COLUMNS} FROM department_lead_assignments
         WHERE department_id = ? ORDER BY effective_from DESC FOR UPDATE`,
        [input.departmentId],
      );
      const history: readonly LeadPeriod[] = periods.map(mapLeadPeriod);
      const decision = appointmentDecision(history, input.effectiveFrom, input.leadEmployeeId);
      if (decision.kind === 'overlap') return { status: 'period_overlap', periodId: decision.periodId };
      if (decision.kind === 'already_leads') {
        return { status: 'already_leads', periodId: decision.periodId };
      }

      if (decision.closePeriodId) {
        await connection.execute(
          `UPDATE department_lead_assignments
           SET effective_to = ?, updated_by_user_id = ?, version = version + 1
           WHERE id = ? AND effective_to IS NULL`,
          [decision.closeOn, actorUserId, decision.closePeriodId],
        );
      }

      await connection.execute(
        `INSERT INTO department_lead_assignments(
           id,department_id,lead_employee_id,effective_from,effective_to,reason,created_by_user_id,updated_by_user_id)
         VALUES(?,?,?,?,NULL,?,?,?)`,
        [
          input.id,
          input.departmentId,
          input.leadEmployeeId,
          input.effectiveFrom,
          input.reason,
          actorUserId,
          actorUserId,
        ],
      );

      return { status: 'appointed', closedPeriodId: decision.closePeriodId };
    });
  }
}
