import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';

import type { IsoDate } from '@/contracts/domain';
import type {
  DepartmentAdminDetailView,
  DepartmentAdministrationService,
  DepartmentCatalogueFilter,
  DepartmentCatalogueRowView,
  DepartmentCatalogueView,
  DepartmentInput,
  DepartmentLeadAppointmentInput,
  DepartmentLeadAppointmentView,
  DepartmentStatusInput,
  DepartmentValidationView,
  EligibleDepartmentLeadOptionView,
} from '@/contracts/organization-hierarchy';
import type { Failure, Result, ResultWarning } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate } from '@/lib/format';
import {
  alreadyLeadsFailure,
  describeDepartmentConflict,
  duplicateDepartmentFailure,
  inactiveDepartmentFailure,
  ineligibleLeadFailure,
  membersRemainWarning,
  normalizeDepartmentText,
  scheduledAppointmentWarning,
  validateAppointmentShape,
  validateDepartmentShape,
  validateStatusReason,
} from '@/lib/department-hierarchy';
import { AuditWriter, MysqlAuditSink } from '@/server/audit/writer';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { authorize, type ActorPolicyContext } from '@/server/authorization/policy';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { MysqlDepartmentRepository } from './departments';

/**
 * Department administration against MySQL (`OH-BE-0201` … `OH-BE-0216`).
 *
 * It implements `DepartmentAdministrationService` — the same contract the mock
 * implements and the `/admin/departments` screen consumes — so connecting the
 * backend changes no screen and no view model. The rules a person sees come
 * from `src/lib/department-hierarchy.ts`, shared with the mock, and the data
 * invariants from `MysqlDepartmentRepository`, which holds the locks.
 *
 * What this layer adds on top of those two:
 *
 * - **Authorization, before anything is counted.** Every method resolves the
 *   actor from the session cookie, not from the `userId` argument, so a
 *   forged payload cannot act as someone else (`OH-BE-0202`, `OH-BE-0210`).
 * - **Not-found-equivalence for records outside scope.** A department the actor
 *   may not see answers exactly as a nonexistent one does, so no id's existence
 *   is ever confirmed (`OH-BE-0211`).
 * - **Audit with before and after values and the reason given** for every
 *   mutation (`OH-BE-0212`).
 * - **A verified-period guard** on the one operation that writes dated history,
 *   a lead appointment (`OH-BE-0213`).
 * - **Optimistic concurrency** through the repository's version checks, turned
 *   into a conflict with guidance (`OH-BE-0214`).
 */

interface DepartmentRow extends RowDataPacket {
  id: string;
  division_id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: number;
  deactivation_reason: string | null;
  version: number;
  division_name: string;
  division_key: string;
  is_government: number;
  placements: number;
  active_members: number;
  appointments: number;
}

interface AppointmentRow extends RowDataPacket {
  id: string;
  department_id: string;
  lead_employee_id: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  reason: string | null;
  employee_code: string;
  display_name: string;
  job_title: string | null;
  image_url: string | null;
}

interface MemberRow extends RowDataPacket {
  assignment_id: string;
  employee_id: string;
  department_id: string;
  division_id: string;
  division_name: string;
  division_key: string;
  is_government: number;
  effective_from: string | Date;
  effective_to: string | Date | null;
  is_effective: number;
  employee_code: string;
  display_name: string;
  job_title: string | null;
  image_url: string | null;
}

interface PeriodRow extends RowDataPacket {
  id: string;
  label: string;
  status: string;
  verified_at: Date | string | null;
}

const DEPARTMENT_SELECT = `SELECT d.id,d.division_id,d.name,d.code,d.description,d.is_active,d.deactivation_reason,d.version,
    v.name AS division_name,v.division_key,v.is_government,
    (SELECT COUNT(*) FROM employee_division_assignments a WHERE a.department_id=d.id) AS placements,
    (SELECT COUNT(*) FROM employee_division_assignments a WHERE a.department_id=d.id AND a.is_active=TRUE
       AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)) AS active_members,
    (SELECT COUNT(*) FROM department_lead_assignments l WHERE l.department_id=d.id) AS appointments
  FROM departments d JOIN divisions v ON v.id=d.division_id`;

/** What mysql2 accepts as a bound value in this module. */
type QueryValue = string | number | boolean | null;

function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function divisionRef(row: { division_id: string; division_name: string; division_key: string; is_government: number }) {
  return {
    id: row.division_id,
    name: row.division_name,
    code: row.division_key.toUpperCase(),
    isRestricted: Boolean(row.is_government),
  };
}

function employeeRef(row: {
  employee_code: string;
  display_name: string;
  job_title: string | null;
  image_url: string | null;
}, id: string) {
  return {
    id,
    fullName: row.display_name,
    employeeCode: row.employee_code,
    avatarUrl: row.image_url,
    designation: row.job_title,
  };
}

function appointmentView(row: AppointmentRow, onDate: IsoDate): DepartmentLeadAppointmentView {
  const from = isoDate(row.effective_from);
  const to = row.effective_to === null ? null : isoDate(row.effective_to);
  return {
    assignmentId: row.id,
    lead: employeeRef(row, row.lead_employee_id),
    effectiveFrom: from,
    effectiveFromLabel: formatDate(from),
    effectiveTo: to,
    effectiveToLabel: to === null ? null : formatDate(to),
    isScheduled: from > onDate,
  };
}

function denied(): Failure {
  return {
    status: 'permission_denied',
    code: 'FORBIDDEN',
    message: 'Managing departments is limited to Super Administrators.',
    requiredPermission: 'organization.manage',
    guidance: 'Ask a Super Administrator to make this change.',
  };
}

function unauthenticated(): Failure {
  return {
    status: 'unauthenticated',
    code: 'UNAUTHENTICATED',
    message: 'Sign in to manage departments.',
    reason: 'no_session',
    returnTo: '/admin/departments',
  };
}

/**
 * The one answer for "that department is not yours to see" and "there is no
 * such department" (`OH-BE-0211`). Identical text, identical shape, identical
 * work done before returning, so neither timing nor wording confirms an id.
 */
function notFound(): Failure {
  return {
    status: 'not_found',
    code: 'NOT_FOUND',
    message: 'That department could not be found.',
    resource: 'department',
  };
}

function invalid(...failures: readonly DepartmentValidationView[]): Failure {
  const first = failures[0];
  return {
    status: 'validation_failure',
    code: 'VALIDATION_FAILED',
    message:
      failures.length === 1 && first
        ? first.message
        : `${failures.length} fields need attention before this can be saved.`,
    focusField: first?.field,
    fieldErrors: failures.map((failure) => ({
      field: failure.field,
      code: 'INVALID',
      message: failure.message,
      guidance: failure.guidance,
    })),
  };
}

function conflictOf(code: Parameters<typeof describeDepartmentConflict>[0], subject: string): Failure {
  const view = describeDepartmentConflict(code, subject);
  return { status: 'conflict', code: 'CONFLICT', message: view.message, guidance: view.guidance };
}

function staleConflict(): Failure {
  return {
    status: 'conflict',
    code: 'CONFLICT',
    message: 'The department changed before this update was saved.',
    guidance: 'Reload the catalogue and review the latest version before saving again.',
  };
}

export class BackendDepartmentAdministration implements DepartmentAdministrationService {
  private readonly auth: AuthenticationService;
  private readonly audit: AuditWriter;
  private readonly repository: MysqlDepartmentRepository;

  constructor(
    private readonly pool: Pool,
    private readonly sessionToken: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
    this.audit = new AuditWriter(new MysqlAuditSink(pool));
    this.repository = new MysqlDepartmentRepository(pool);
  }

  /** The business date every effective-dated answer is resolved on. */
  private today(): IsoDate {
    return this.clock().toISOString().slice(0, 10);
  }

  /**
   * The actor comes from the session cookie. The `userId` argument is only ever
   * checked *against* it, never trusted: a request carrying someone else's id
   * is refused rather than served.
   */
  private async actor(userId: string): Promise<ActorPolicyContext | null> {
    const session = await this.auth.validateSession(this.sessionToken);
    if (session.status !== 'success' || session.data.userId !== userId) return null;
    return loadActorPolicyContext(this.pool, session.data.userId, this.today());
  }

  /**
   * `OH-BE-0202`. Department and appointment mutation is Super Administrator
   * only. The role test is explicit and not merely `organization.manage`,
   * because HR holds that permission for employee administration while the
   * approved model reserves the hierarchy for Super Administrators.
   */
  private async administrator(userId: string): Promise<ActorPolicyContext | null> {
    const actor = await this.actor(userId);
    if (!actor) return null;
    if (!actor.roles.includes('super_admin')) return null;
    return authorize(actor, 'organization.manage', {}, 'route_handler') ? actor : null;
  }

  /** Separates "not signed in" from "signed in without the capability". */
  private async gate(userId: string): Promise<{ actor: ActorPolicyContext } | { failure: Failure }> {
    const actor = await this.actor(userId);
    if (!actor) return { failure: unauthenticated() };
    const administrator = actor.roles.includes('super_admin')
      && authorize(actor, 'organization.manage', {}, 'route_handler');
    return administrator ? { actor } : { failure: denied() };
  }

  /**
   * `OH-BE-0210`, `OH-BE-0211`. The divisions this actor may see, applied
   * before any row is read, counted or grouped. A Super Administrator sees
   * every division; a scoped actor sees only their own, and a department
   * outside that set is reported as absent.
   */
  private visibleDivisions(actor: ActorPolicyContext): 'all' | ReadonlySet<string> {
    return actor.roles.includes('super_admin') ? 'all' : actor.divisionIds;
  }

  private canSee(actor: ActorPolicyContext, divisionId: string): boolean {
    const visible = this.visibleDivisions(actor);
    return visible === 'all' || visible.has(divisionId);
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  private async departmentRows(
    onDate: IsoDate,
    where: string,
    values: readonly QueryValue[],
  ): Promise<readonly DepartmentRow[]> {
    const [rows] = await this.pool.execute<DepartmentRow[]>(
      `${DEPARTMENT_SELECT} ${where} ORDER BY v.created_at, v.name, d.normalized_name`,
      [onDate, onDate, ...values],
    );
    return rows;
  }

  private async appointmentsFor(
    departmentIds: readonly string[],
  ): Promise<readonly AppointmentRow[]> {
    if (departmentIds.length === 0) return [];
    const placeholders = departmentIds.map(() => '?').join(',');
    const [rows] = await this.pool.execute<AppointmentRow[]>(
      `SELECT l.id,l.department_id,l.lead_employee_id,l.effective_from,l.effective_to,l.reason,
              e.employee_code,e.display_name,e.job_title,u.image_url
       FROM department_lead_assignments l
       JOIN employees e ON e.id=l.lead_employee_id
       JOIN users u ON u.id=e.user_id
       WHERE l.department_id IN (${placeholders})
       ORDER BY l.department_id, l.effective_from DESC`,
      [...departmentIds],
    );
    return rows;
  }

  private rowView(
    row: DepartmentRow,
    appointments: readonly AppointmentRow[],
    onDate: IsoDate,
  ): DepartmentCatalogueRowView {
    const mine = appointments.filter((appointment) => appointment.department_id === row.id);
    const current = mine.find(
      (appointment) =>
        isoDate(appointment.effective_from) <= onDate &&
        (appointment.effective_to === null || isoDate(appointment.effective_to) >= onDate),
    );
    const scheduled = mine
      .filter((appointment) => isoDate(appointment.effective_from) > onDate)
      .sort((left, right) => isoDate(left.effective_from).localeCompare(isoDate(right.effective_from)))[0];

    const isReferenced = Number(row.placements) > 0 || Number(row.appointments) > 0;
    const isActive = Boolean(row.is_active);

    return {
      department: {
        id: row.id,
        divisionId: row.division_id,
        name: row.name,
        code: row.code,
        description: row.description,
        isActive,
        createdAt: '',
        createdBy: { userId: '', displayName: '' },
        updatedAt: '',
        updatedBy: { userId: '', displayName: '' },
      },
      division: divisionRef(row),
      currentLead: current ? employeeRef(current, current.lead_employee_id) : null,
      activeEmployeeCount: Number(row.active_members),
      currentAppointment: current ? appointmentView(current, onDate) : null,
      scheduledAppointment: scheduled ? appointmentView(scheduled, onDate) : null,
      placementCount: Number(row.placements),
      isReferenced,
      canEdit: true,
      canChangeDivision: !isReferenced,
      canDeactivate: isActive,
      canDelete: !isReferenced,
      referenceGuidance: isReferenced
        ? describeDepartmentConflict('referenced', row.name).guidance
        : null,
    };
  }

  async catalogue(
    userId: string,
    filter: DepartmentCatalogueFilter = {},
  ): Promise<Result<DepartmentCatalogueView>> {
    const gate = await this.gate(userId);
    if ('failure' in gate) return gate.failure;
    const onDate = this.today();

    const clauses: string[] = [];
    const values: QueryValue[] = [];

    /*
     * Scope first, then the caller's filter. Narrowing after a count would let
     * a total reveal departments the viewer may not see.
     */
    const visible = this.visibleDivisions(gate.actor);
    if (visible !== 'all') {
      if (visible.size === 0) clauses.push('1 = 0');
      else {
        clauses.push(`d.division_id IN (${[...visible].map(() => '?').join(',')})`);
        values.push(...visible);
      }
    }
    if (filter.divisionId) {
      clauses.push('d.division_id = ?');
      values.push(filter.divisionId);
    }
    const status = filter.status ?? 'all';
    if (status === 'active') clauses.push('d.is_active = TRUE');
    if (status === 'inactive') clauses.push('d.is_active = FALSE');
    const search = (filter.search ?? '').trim();
    if (search) {
      clauses.push('(d.normalized_name LIKE ? OR d.normalized_code LIKE ?)');
      const like = `%${normalizeDepartmentText(search)}%`;
      values.push(like, like);
    }

    const rows = await this.departmentRows(
      onDate,
      clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      values,
    );
    const appointments = await this.appointmentsFor(rows.map((row) => row.id));

    /* The unfiltered total is also scoped, for the same reason. */
    const scopeOnly = visible === 'all'
      ? ''
      : visible.size === 0
        ? 'WHERE 1 = 0'
        : `WHERE d.division_id IN (${[...visible].map(() => '?').join(',')})`;
    const [[totals]] = await this.pool.execute<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) AS total FROM departments d ${scopeOnly}`,
      visible === 'all' ? [] : [...visible],
    );

    const [divisions] = await this.pool.execute<(RowDataPacket & { id: string; name: string })[]>(
      `SELECT id,name FROM divisions${
        visible === 'all'
          ? ''
          : visible.size === 0
            ? ' WHERE 1 = 0'
            : ` WHERE id IN (${[...visible].map(() => '?').join(',')})`
      } ORDER BY created_at, name`,
      visible === 'all' ? [] : [...visible],
    );

    const grouped = new Map<string, DepartmentCatalogueRowView[]>();
    for (const row of rows) {
      const view = this.rowView(row, appointments, onDate);
      const list = grouped.get(row.division_id);
      if (list) list.push(view);
      else grouped.set(row.division_id, [view]);
    }

    return success({
      asOf: onDate,
      asOfLabel: formatDate(onDate),
      /* Grouped in the order the rows arrived, which is division creation
         order — the same order the catalogue has always been read in. */
      groups: [...grouped.values()].map((departments) => ({
        division: departments[0]!.division,
        departments,
        activeCount: departments.filter((row) => row.department.isActive).length,
        inactiveCount: departments.filter((row) => !row.department.isActive).length,
      })),
      departmentCount: rows.length,
      totalCount: Number(totals?.total ?? 0),
      divisionOptions: divisions.map((division) => ({ value: division.id, label: division.name })),
    });
  }

  /** One department the actor may see, or the absent answer (`OH-BE-0211`). */
  private async visibleRow(
    actor: ActorPolicyContext,
    departmentId: string,
    onDate: IsoDate,
  ): Promise<DepartmentRow | null> {
    const rows = await this.departmentRows(onDate, 'WHERE d.id = ?', [departmentId]);
    const row = rows[0];
    if (!row) return null;
    return this.canSee(actor, row.division_id) ? row : null;
  }

  async get(userId: string, departmentId: string): Promise<Result<DepartmentAdminDetailView>> {
    const gate = await this.gate(userId);
    if ('failure' in gate) return gate.failure;
    return this.detail(gate.actor, departmentId);
  }

  private async detail(
    actor: ActorPolicyContext,
    departmentId: string,
  ): Promise<Result<DepartmentAdminDetailView>> {
    const onDate = this.today();
    const row = await this.visibleRow(actor, departmentId, onDate);
    if (!row) return notFound();

    const appointments = await this.appointmentsFor([departmentId]);
    const [members] = await this.pool.execute<MemberRow[]>(
      `SELECT a.id AS assignment_id,a.employee_id,a.department_id,a.division_id,
              v.name AS division_name,v.division_key,v.is_government,
              a.effective_from,a.effective_to,
              (a.is_active=TRUE AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)) AS is_effective,
              e.employee_code,e.display_name,e.job_title,u.image_url
       FROM employee_division_assignments a
       JOIN divisions v ON v.id=a.division_id
       JOIN employees e ON e.id=a.employee_id
       JOIN users u ON u.id=e.user_id
       WHERE a.department_id = ?
       ORDER BY is_effective DESC, e.display_name`,
      [onDate, onDate, departmentId],
    );

    const effective = appointments.find(
      (appointment) =>
        isoDate(appointment.effective_from) <= onDate &&
        (appointment.effective_to === null || isoDate(appointment.effective_to) >= onDate),
    );

    return success({
      ...this.rowView(row, appointments, onDate),
      asOf: onDate,
      members: members.map((member) => ({
        employee: employeeRef(member, member.employee_id),
        assignmentId: member.assignment_id,
        departmentId: member.department_id,
        division: divisionRef(member),
        effectiveFrom: isoDate(member.effective_from),
        effectiveTo: member.effective_to === null ? null : isoDate(member.effective_to),
        isEffective: Boolean(member.is_effective),
      })),
      leadHistory: appointments.map((appointment) => ({
        assignment: {
          id: appointment.id,
          departmentId: appointment.department_id,
          leadEmployeeId: appointment.lead_employee_id,
          effectiveFrom: isoDate(appointment.effective_from),
          effectiveTo: appointment.effective_to === null ? null : isoDate(appointment.effective_to),
          reason: appointment.reason,
          createdAt: '',
          createdBy: { userId: '', displayName: '' },
          updatedAt: '',
          updatedBy: { userId: '', displayName: '' },
        },
        lead: employeeRef(appointment, appointment.lead_employee_id),
        isEffective: appointment.id === effective?.id,
      })),
      appointments: appointments.map((appointment) => appointmentView(appointment, onDate)),
    });
  }

  async listEligibleLeads(
    userId: string,
    departmentId: string,
    effectiveFrom?: IsoDate,
  ): Promise<Result<readonly EligibleDepartmentLeadOptionView[]>> {
    const gate = await this.gate(userId);
    if ('failure' in gate) return gate.failure;
    const onDate = effectiveFrom ?? this.today();
    const row = await this.visibleRow(gate.actor, departmentId, this.today());
    if (!row) return notFound();

    /*
     * `OH-BE-0204`. Eligible means an active employee with an effective
     * assignment in *this department's division* on the date being appointed —
     * not membership of the department, and not a company-wide Team Lead role.
     */
    const [rows] = await this.pool.execute<(RowDataPacket & {
      employee_id: string;
      assignment_id: string;
      employee_code: string;
      display_name: string;
      job_title: string | null;
      image_url: string | null;
    })[]>(
      `SELECT a.employee_id,MIN(a.id) AS assignment_id,e.employee_code,e.display_name,e.job_title,u.image_url
       FROM employee_division_assignments a
       JOIN employees e ON e.id=a.employee_id AND e.status='active'
       JOIN users u ON u.id=e.user_id AND u.status='active'
       WHERE a.division_id = ? AND a.is_active = TRUE
         AND a.effective_from <= ? AND (a.effective_to IS NULL OR a.effective_to >= ?)
       GROUP BY a.employee_id,e.employee_code,e.display_name,e.job_title,u.image_url
       ORDER BY e.display_name`,
      [row.division_id, onDate, onDate],
    );

    return success(
      rows.map<EligibleDepartmentLeadOptionView>((candidate) => ({
        value: candidate.employee_id,
        label: `${candidate.display_name} · ${candidate.employee_code}`,
        employee: employeeRef(candidate, candidate.employee_id),
        divisionId: row.division_id,
        assignmentId: candidate.assignment_id,
      })),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Mutations                                                              */
  /* ---------------------------------------------------------------------- */

  /** Uniqueness inside the division, worded by the shared rules module. */
  private async duplicateIn(
    divisionId: string,
    input: DepartmentInput,
    excludeId: string | null,
  ): Promise<DepartmentValidationView | null> {
    const [rows] = await this.pool.execute<(RowDataPacket & { name: string; division_name: string })[]>(
      `SELECT d.name,v.name AS division_name FROM departments d JOIN divisions v ON v.id=d.division_id
       WHERE d.division_id = ? AND d.id <> ? AND (d.normalized_name = ? OR d.normalized_code = ?) LIMIT 1`,
      [divisionId, excludeId ?? '', normalizeDepartmentText(input.name), normalizeDepartmentText(input.code)],
    );
    const clash = rows[0];
    if (!clash) return null;
    return duplicateDepartmentFailure(
      normalizeDepartmentText(clash.name) === normalizeDepartmentText(input.name) ? 'name' : 'code',
      clash.division_name,
    );
  }

  private async divisionExists(divisionId: string): Promise<boolean> {
    const [rows] = await this.pool.execute<(RowDataPacket & { id: string })[]>(
      'SELECT id FROM divisions WHERE id = ? AND is_active = TRUE LIMIT 1',
      [divisionId],
    );
    return rows.length === 1;
  }

  private async validateInput(
    input: DepartmentInput,
    existing: { id: string } | null,
  ): Promise<readonly DepartmentValidationView[]> {
    const failures: DepartmentValidationView[] = [];
    if (!(await this.divisionExists(input.divisionId))) {
      failures.push({
        field: 'divisionId',
        message: 'Choose the division that owns this department.',
        guidance: 'Select an active division.',
      });
    }
    failures.push(...validateDepartmentShape(input));
    if (failures.length > 0) return failures;

    const duplicate = await this.duplicateIn(input.divisionId, input, existing?.id ?? null);
    return duplicate ? [duplicate] : [];
  }

  /**
   * `OH-BE-0213`. The verified period covering a date, if any.
   *
   * A lead appointment writes dated history, and attribution inside a verified
   * payroll period must not change after HR locked it. A department's name,
   * description or status carries no dated history, and a delete is only
   * possible for a department nothing references, so those are not gated —
   * which is what "where applicable" in the task means.
   */
  private async verifiedPeriodCovering(date: IsoDate): Promise<PeriodRow | null> {
    const [rows] = await this.pool.execute<PeriodRow[]>(
      `SELECT id,label,status,verified_at FROM timesheet_periods
       WHERE status IN ('verified','amended') AND start_date <= ? AND end_date >= ? LIMIT 1`,
      [date, date],
    );
    return rows[0] ?? null;
  }

  private lockedConflict(period: PeriodRow): Failure {
    const verifiedAt = period.verified_at instanceof Date
      ? period.verified_at.toISOString()
      : String(period.verified_at ?? '');
    return {
      status: 'conflict',
      code: 'PERIOD_LOCKED',
      message: `${period.label} is verified, so leadership inside it cannot change.`,
      guidance:
        'Choose an effective date after the verified period, or ask HR for an authorized amendment with a reason.',
      lockedPeriod: {
        periodId: period.id,
        label: period.label,
        verifiedAt,
        amendmentPathAvailable: true,
      },
    };
  }

  private async record(
    actor: ActorPolicyContext,
    action: string,
    departmentId: string,
    scope: Readonly<Record<string, unknown>>,
    before: unknown,
    after: unknown,
    reason: string | null,
  ): Promise<void> {
    await this.audit.append({
      actorUserId: actor.userId,
      action,
      resourceType: 'department',
      resourceId: departmentId,
      scope,
      reason,
      correlationId: randomUUID(),
      before,
      after,
    });
  }

  async create(userId: string, input: DepartmentInput): Promise<Result<DepartmentAdminDetailView>> {
    const administrator = await this.administrator(userId);
    if (!administrator) return (await this.actor(userId)) ? denied() : unauthenticated();

    const failures = await this.validateInput(input, null);
    if (failures.length > 0) return invalid(...failures);

    const id = randomUUID();
    await this.repository.insert(
      {
        id,
        divisionId: input.divisionId,
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        description: input.description.trim() || null,
      },
      administrator.userId,
    );
    await this.record(
      administrator,
      'department.created',
      id,
      { divisionId: input.divisionId },
      null,
      { name: input.name.trim(), code: input.code.trim().toUpperCase(), divisionId: input.divisionId },
      null,
    );

    const detail = await this.detail(administrator, id);
    if (detail.status !== 'success') return detail;
    return success(detail.data, [
      {
        code: 'LEAD_NOT_APPOINTED',
        message: 'The department has no lead yet. Appoint one when you are ready.',
      },
    ]);
  }

  async update(
    userId: string,
    departmentId: string,
    input: DepartmentInput,
  ): Promise<Result<DepartmentAdminDetailView>> {
    const administrator = await this.administrator(userId);
    if (!administrator) return (await this.actor(userId)) ? denied() : unauthenticated();

    const existing = await this.visibleRow(administrator, departmentId, this.today());
    if (!existing) return notFound();

    /*
     * Moving a referenced department would carry placements and leadership that
     * belonged to the old division. The composite foreign key would refuse the
     * write; this refuses it with an answer and the correction.
     */
    const isReferenced = Number(existing.placements) > 0 || Number(existing.appointments) > 0;
    if (input.divisionId !== existing.division_id && isReferenced) {
      return conflictOf('referenced', existing.name);
    }

    const failures = await this.validateInput(input, { id: departmentId });
    if (failures.length > 0) return invalid(...failures);

    const saved = await this.repository.update(
      {
        id: departmentId,
        divisionId: input.divisionId,
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        description: input.description.trim() || null,
      },
      Number(existing.version),
      administrator.userId,
    );
    if (!saved) return staleConflict();

    await this.record(
      administrator,
      'department.updated',
      departmentId,
      { divisionId: input.divisionId },
      { name: existing.name, code: existing.code, divisionId: existing.division_id, description: existing.description },
      { name: input.name.trim(), code: input.code.trim().toUpperCase(), divisionId: input.divisionId, description: input.description.trim() || null },
      null,
    );
    return this.detail(administrator, departmentId);
  }

  async setStatus(
    userId: string,
    input: DepartmentStatusInput,
  ): Promise<Result<DepartmentAdminDetailView>> {
    const administrator = await this.administrator(userId);
    if (!administrator) return (await this.actor(userId)) ? denied() : unauthenticated();

    const existing = await this.visibleRow(administrator, input.departmentId, this.today());
    if (!existing) return notFound();

    if (Boolean(existing.is_active) === input.isActive) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: `${existing.name} is already ${input.isActive ? 'active' : 'inactive'}.`,
        guidance: 'Reload the catalogue to see its current status.',
      };
    }

    const reasonFailure = validateStatusReason({ isActive: input.isActive, reason: input.reason });
    if (reasonFailure) return invalid(reasonFailure);

    const reason = input.reason.trim() || null;
    const saved = await this.repository.setActive(
      input.departmentId,
      input.isActive,
      reason,
      Number(existing.version),
      administrator.userId,
    );
    if (!saved) return staleConflict();

    await this.record(
      administrator,
      input.isActive ? 'department.activated' : 'department.deactivated',
      input.departmentId,
      { divisionId: existing.division_id },
      { isActive: Boolean(existing.is_active) },
      { isActive: input.isActive },
      reason,
    );

    const detail = await this.detail(administrator, input.departmentId);
    if (detail.status !== 'success') return detail;

    /*
     * Deactivation keeps every placement and stops new ones, which is the whole
     * point of having it instead of a delete. Saying so is the difference
     * between understanding the change and assuming members were removed.
     */
    const remaining = detail.data.activeEmployeeCount;
    const warnings: readonly ResultWarning[] | undefined =
      !input.isActive && remaining > 0
        ? [{ code: 'MEMBERS_REMAIN', message: membersRemainWarning(existing.name, remaining) }]
        : undefined;
    return success(detail.data, warnings);
  }

  async remove(userId: string, departmentId: string): Promise<Result<{ readonly removedId: string }>> {
    const administrator = await this.administrator(userId);
    if (!administrator) return (await this.actor(userId)) ? denied() : unauthenticated();

    const existing = await this.visibleRow(administrator, departmentId, this.today());
    if (!existing) return notFound();

    const outcome = await this.repository.deleteIfUnreferenced(departmentId);
    if (outcome === 'missing') return notFound();
    if (outcome === 'referenced') return conflictOf('referenced', existing.name);

    await this.record(
      administrator,
      'department.deleted',
      departmentId,
      { divisionId: existing.division_id },
      { name: existing.name, code: existing.code, divisionId: existing.division_id },
      null,
      null,
    );
    return success({ removedId: departmentId });
  }

  async appointLead(
    userId: string,
    input: DepartmentLeadAppointmentInput,
  ): Promise<Result<DepartmentAdminDetailView>> {
    const administrator = await this.administrator(userId);
    if (!administrator) return (await this.actor(userId)) ? denied() : unauthenticated();

    const today = this.today();
    const existing = await this.visibleRow(administrator, input.departmentId, today);
    if (!existing) return notFound();
    if (!Boolean(existing.is_active)) return invalid(inactiveDepartmentFailure(existing.name));

    const failures = [
      ...validateAppointmentShape({
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        today,
        todayLabel: formatDate(today),
      }),
    ];
    if (failures.length > 0) return invalid(...failures);

    const locked = await this.verifiedPeriodCovering(input.effectiveFrom);
    if (locked) return this.lockedConflict(locked);

    const previous = await this.repository.effectiveLead(input.departmentId, today);
    const outcome = await this.repository.appointLead(
      {
        id: randomUUID(),
        departmentId: input.departmentId,
        leadEmployeeId: input.leadEmployeeId,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason.trim() || null,
      },
      administrator.userId,
    );

    switch (outcome.status) {
      case 'department_missing':
        return notFound();
      case 'department_inactive':
        return invalid(inactiveDepartmentFailure(existing.name));
      case 'ineligible_lead':
        return invalid(ineligibleLeadFailure());
      case 'already_leads': {
        const open = await this.repository.leadHistory(input.departmentId);
        const period = open.find((candidate) => candidate.id === outcome.periodId);
        const [leadRows] = await this.pool.execute<(RowDataPacket & { display_name: string })[]>(
          'SELECT display_name FROM employees WHERE id = ? LIMIT 1',
          [input.leadEmployeeId],
        );
        return invalid(
          alreadyLeadsFailure(
            leadRows[0]?.display_name ?? 'That employee',
            formatDate(period?.effectiveFrom ?? today),
            existing.name,
          ),
        );
      }
      case 'period_overlap':
        return conflictOf('lead_period_overlap', existing.name);
      case 'appointed':
        break;
    }

    const detail = await this.detail(administrator, input.departmentId);
    if (detail.status !== 'success') return detail;

    await this.record(
      administrator,
      'department.lead.appointed',
      input.departmentId,
      { divisionId: existing.division_id, leadEmployeeId: input.leadEmployeeId },
      previous
        ? {
            leadEmployeeId: previous.leadEmployeeId,
            effectiveFrom: previous.effectiveFrom,
            effectiveTo: previous.effectiveTo,
          }
        : null,
      { leadEmployeeId: input.leadEmployeeId, effectiveFrom: input.effectiveFrom, effectiveTo: null },
      input.reason.trim() || null,
    );

    const scheduled = input.effectiveFrom > today;
    return success(
      detail.data,
      scheduled
        ? [
            {
              code: 'APPOINTMENT_SCHEDULED',
              message: scheduledAppointmentWarning(
                detail.data.scheduledAppointment?.lead.fullName ?? 'The new lead',
                formatDate(input.effectiveFrom),
                detail.data.currentLead?.fullName ?? null,
              ),
            },
          ]
        : undefined,
    );
  }
}
