import type { DepartmentLeadAssignment, IsoDate } from '@/contracts/domain';
import type {
  DepartmentAdminDetailView,
  DepartmentAdministrationService,
  DepartmentCatalogueFilter,
  DepartmentCatalogueRowView,
  DepartmentCatalogueView,
  DepartmentConflictView,
  DepartmentInput,
  DepartmentLeadAppointmentView,
  DepartmentLeadHistoryView,
  DepartmentMemberView,
  DepartmentValidationView,
  EligibleDepartmentLeadOptionView,
} from '@/contracts/organization-hierarchy';
import type { Failure } from '@/contracts/results';
import { success } from '@/contracts/results';
import { addDays, formatDate } from '@/lib/format';
import {
  alreadyLeadsFailure,
  describeDepartmentConflict,
  duplicateDepartmentFailure,
  inactiveDepartmentFailure,
  ineligibleLeadFailure,
  membersRemainWarning,
  scheduledAppointmentWarning,
  validateAppointmentShape,
  validateDepartmentShape,
  validateStatusReason,
} from '@/lib/department-hierarchy';
import { EMPLOYEES } from '@/fixtures/hr';
import { DEMO_DATE, DIVISIONS, findAccountByUserId } from './accounts';
import {
  departmentById,
  departmentLeadAssignments,
  departmentRecords,
  effectiveLeadAssignment,
  leadHistoryForDepartment,
  removeDepartmentRecord,
  saveDepartmentLeadAssignment,
  saveDepartmentRecord,
  type DepartmentRecord,
} from './department-store';
import { assignmentIsEffective, validateLeadCandidate } from './organization-hierarchy';
import { mockStore } from './store';

/**
 * Department administration (`OH-FE-0201`–`OH-FE-0209`).
 *
 * This is the replacement for the preliminary primary-department prototype, not
 * an extension of it. Four rules from the approved organization model are
 * enforced here and nowhere else, because the screen must not be able to decide
 * any of them:
 *
 * - **A department belongs to exactly one division, and its name and code are
 *   unique inside that division.** Two divisions may both have a "Sales", so the
 *   uniqueness message always names the division it was checked against.
 * - **Leadership is effective-dated and never rewritten.** Appointing a lead
 *   closes the current open period the day before the new one starts and adds a
 *   row; a period that has already ended is immutable, and no appointment may
 *   start in the past.
 * - **A referenced department is deactivated, never deleted or moved.** Any
 *   placement or appointment that ever named it counts as a reference, so
 *   historical rows stay resolvable.
 * - **Only Super Administrators reach any of this**, including through a direct
 *   service call. Nothing here is merely hidden in the UI.
 *
 * Effective-dated answers are resolved on one date, `DEMO_DATE`, which every
 * view reports as `asOf` so a reader can see which day "current" means.
 */

const LATENCY_MS = 140;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

const SYSTEM_ACTOR = { userId: 'usr-system', displayName: 'System' };


function notFound(): Failure {
  return {
    status: 'not_found',
    code: 'NOT_FOUND',
    message: 'That department could not be found.',
    resource: 'department',
  };
}

function denied(): Failure {
  return {
    status: 'permission_denied',
    code: 'FORBIDDEN',
    message: 'Managing departments is limited to Super Administrators.',
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

/** Field refusals reach the caller as `Result` field errors, keeping `guidance`. */
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

/*
 * Conflict wording, field failures, shape validation and warning text all come
 * from `src/lib/department-hierarchy.ts`, which the MySQL application service
 * imports as well. A user is entitled to the same answer from both.
 */

function conflictOf(code: DepartmentConflictView['code'], subject: string): Failure {
  const view = describeDepartmentConflict(code, subject);
  return { status: 'conflict', code: 'CONFLICT', message: view.message, guidance: view.guidance };
}

function divisionRef(divisionId: string) {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division
    ? {
        id: division.id,
        name: division.name,
        code: division.code,
        isRestricted: division.isRestricted,
      }
    : { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

function employeeRef(employeeId: string) {
  const employee = EMPLOYEES.find((candidate) => candidate.id === employeeId);
  return {
    id: employeeId,
    fullName: employee?.fullName ?? employeeId,
    employeeCode: employee?.employeeCode ?? employeeId,
    avatarUrl: null,
    designation: employee?.designation ?? null,
  };
}

/** Every gate an administration call passes, in the order that leaks nothing. */
function gate(userId: string): Failure | null {
  const account = userId ? findAccountByUserId(userId) : undefined;
  if (!account) return unauthenticated();
  if (account.primaryRole !== 'super_admin') return denied();
  return null;
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

function appointmentView(
  assignment: DepartmentLeadAssignment,
  onDate: IsoDate,
): DepartmentLeadAppointmentView {
  return {
    assignmentId: assignment.id,
    lead: employeeRef(assignment.leadEmployeeId),
    effectiveFrom: assignment.effectiveFrom,
    effectiveFromLabel: formatDate(assignment.effectiveFrom),
    effectiveTo: assignment.effectiveTo,
    effectiveToLabel: assignment.effectiveTo ? formatDate(assignment.effectiveTo) : null,
    isScheduled: assignment.effectiveFrom > onDate,
  };
}

/** Placements that ever named the department, effective or ended. */
function placementsFor(departmentId: string) {
  return mockStore.assignments().filter((assignment) => assignment.departmentId === departmentId);
}

function rowView(record: DepartmentRecord, onDate: IsoDate): DepartmentCatalogueRowView {
  const current = effectiveLeadAssignment(record.id, onDate);
  const appointments = leadHistoryForDepartment(record.id);
  const scheduled = appointments
    .filter((assignment) => assignment.effectiveFrom > onDate)
    .slice()
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0];

  const placements = placementsFor(record.id);
  const isReferenced = placements.length > 0 || appointments.length > 0;

  return {
    department: record,
    division: divisionRef(record.divisionId),
    currentLead: current ? employeeRef(current.leadEmployeeId) : null,
    activeEmployeeCount: placements.filter((assignment) =>
      assignmentIsEffective(assignment, onDate),
    ).length,
    currentAppointment: current ? appointmentView(current, onDate) : null,
    scheduledAppointment: scheduled ? appointmentView(scheduled, onDate) : null,
    placementCount: placements.length,
    isReferenced,
    canEdit: true,
    canChangeDivision: !isReferenced,
    canDeactivate: record.isActive,
    canDelete: !isReferenced,
    referenceGuidance: isReferenced
      ? describeDepartmentConflict('referenced', record.name).guidance
      : null,
  };
}

function memberViews(departmentId: string, onDate: IsoDate): readonly DepartmentMemberView[] {
  return placementsFor(departmentId)
    .map<DepartmentMemberView>((assignment) => ({
      employee: employeeRef(assignment.employeeId),
      assignmentId: assignment.id,
      departmentId: assignment.departmentId,
      division: divisionRef(assignment.divisionId),
      effectiveFrom: assignment.startDate,
      effectiveTo: assignment.endDate,
      isEffective: assignmentIsEffective(assignment, onDate),
    }))
    .sort(
      (left, right) =>
        Number(right.isEffective) - Number(left.isEffective) ||
        left.employee.fullName.localeCompare(right.employee.fullName),
    );
}

function historyViews(departmentId: string, onDate: IsoDate): readonly DepartmentLeadHistoryView[] {
  const effective = effectiveLeadAssignment(departmentId, onDate);
  return leadHistoryForDepartment(departmentId).map<DepartmentLeadHistoryView>((assignment) => ({
    assignment,
    lead: employeeRef(assignment.leadEmployeeId),
    isEffective: assignment.id === effective?.id,
  }));
}

function detailView(record: DepartmentRecord, onDate: IsoDate): DepartmentAdminDetailView {
  return {
    ...rowView(record, onDate),
    asOf: onDate,
    members: memberViews(record.id, onDate),
    leadHistory: historyViews(record.id, onDate),
    appointments: leadHistoryForDepartment(record.id).map((assignment) =>
      appointmentView(assignment, onDate),
    ),
  };
}

function catalogueView(
  filter: DepartmentCatalogueFilter,
  onDate: IsoDate,
): DepartmentCatalogueView {
  const status = filter.status ?? 'all';
  const search = (filter.search ?? '').trim().toLowerCase();

  const matching = departmentRecords().filter((record) => {
    if (filter.divisionId && record.divisionId !== filter.divisionId) return false;
    if (status === 'active' && !record.isActive) return false;
    if (status === 'inactive' && record.isActive) return false;
    if (
      search &&
      !record.name.toLowerCase().includes(search) &&
      !record.code.toLowerCase().includes(search)
    ) {
      return false;
    }
    return true;
  });

  const divisionIds = Object.values(DIVISIONS).map((division) => division.id);
  const groups = divisionIds
    .map((divisionId) => {
      const departments = matching
        .filter((record) => record.divisionId === divisionId)
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((record) => rowView(record, onDate));
      return {
        division: divisionRef(divisionId),
        departments,
        activeCount: departments.filter((row) => row.department.isActive).length,
        inactiveCount: departments.filter((row) => !row.department.isActive).length,
      };
    })
    .filter((group) => group.departments.length > 0);

  return {
    asOf: onDate,
    asOfLabel: formatDate(onDate),
    groups,
    departmentCount: matching.length,
    totalCount: departmentRecords().length,
    divisionOptions: divisionIds.map((divisionId) => ({
      value: divisionId,
      label: divisionRef(divisionId).name,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validateInput(
  input: DepartmentInput,
  existing: DepartmentRecord | null,
): readonly DepartmentValidationView[] {
  const failures: DepartmentValidationView[] = [];
  const name = input.name.trim();
  const code = input.code.trim();

  if (!DIVISIONS[input.divisionId as keyof typeof DIVISIONS]) {
    failures.push({
      field: 'divisionId',
      message: 'Choose the division that owns this department.',
      guidance: 'Select one of the five divisions.',
    });
  }
  failures.push(...validateDepartmentShape(input));

  /*
   * Uniqueness needs rows, so it is checked here and worded by the shared
   * module — which always names the division it was checked against, because
   * "already exists" reads as company-wide and two divisions may each have a
   * Sales department.
   */
  if (failures.length === 0) {
    const clash = departmentRecords().find(
      (record) =>
        record.id !== existing?.id &&
        record.divisionId === input.divisionId &&
        (record.name.toLowerCase() === name.toLowerCase() ||
          record.code.toLowerCase() === code.toLowerCase()),
    );
    if (clash) {
      failures.push(
        duplicateDepartmentFailure(
          clash.name.toLowerCase() === name.toLowerCase() ? 'name' : 'code',
          divisionRef(input.divisionId).name,
        ),
      );
    }
  }

  return failures;
}

function nextDepartmentId(divisionId: string, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const base = `dept-${divisionId}-${slug || 'department'}`;
  if (!departmentById(base)) return base;
  let suffix = 2;
  while (departmentById(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function nextAppointmentId(departmentId: string): string {
  const taken = new Set(departmentLeadAssignments().map((assignment) => assignment.id));
  let suffix = 1;
  while (taken.has(`lead-${departmentId}-${suffix}`)) suffix += 1;
  return `lead-${departmentId}-${suffix}`;
}

function actorStamp(userId: string) {
  const account = findAccountByUserId(userId);
  return account ? { userId: account.userId, displayName: account.fullName } : SYSTEM_ACTOR;
}

const NOW = `${DEMO_DATE}T09:00:00+06:00`;

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const mockDepartmentAdminService: DepartmentAdministrationService = {
  async catalogue(userId, filter = {}) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;
    return success(catalogueView(filter, DEMO_DATE));
  },

  async get(userId, departmentId) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;
    const record = departmentById(departmentId);
    if (!record) return notFound();
    return success(detailView(record, DEMO_DATE));
  },

  async create(userId, input) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const failures = validateInput(input, null);
    if (failures.length > 0) return invalid(...failures);

    const id = nextDepartmentId(input.divisionId, input.name);
    const by = actorStamp(userId);
    saveDepartmentRecord({
      id,
      divisionId: input.divisionId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim() || null,
      isActive: true,
      createdAt: NOW,
      createdBy: by,
      updatedAt: NOW,
      updatedBy: by,
    });
    const created = departmentById(id);
    if (!created) return notFound();
    return success(detailView(created, DEMO_DATE), [
      {
        code: 'LEAD_NOT_APPOINTED',
        message: 'The department has no lead yet. Appoint one when you are ready.',
      },
    ]);
  },

  async update(userId, departmentId, input) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const record = departmentById(departmentId);
    if (!record) return notFound();

    /*
     * `OH-FE-0208`. Moving a referenced department to another division would
     * silently carry placements and leadership that belonged to the old
     * division, so it is refused rather than accepted and repaired afterwards.
     */
    if (input.divisionId !== record.divisionId && !rowView(record, DEMO_DATE).canChangeDivision) {
      return conflictOf('referenced', record.name);
    }

    const failures = validateInput(input, record);
    if (failures.length > 0) return invalid(...failures);

    saveDepartmentRecord({
      ...record,
      divisionId: input.divisionId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim() || null,
      updatedAt: NOW,
      updatedBy: actorStamp(userId),
    });
    const saved = departmentById(departmentId);
    if (!saved) return notFound();
    return success(detailView(saved, DEMO_DATE));
  },

  async setStatus(userId, input) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const record = departmentById(input.departmentId);
    if (!record) return notFound();
    if (record.isActive === input.isActive) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: `${record.name} is already ${input.isActive ? 'active' : 'inactive'}.`,
        guidance: 'Reload the catalogue to see its current status.',
      };
    }

    const reasonFailure = validateStatusReason({ isActive: input.isActive, reason: input.reason });
    if (reasonFailure) return invalid(reasonFailure);

    saveDepartmentRecord({
      ...record,
      isActive: input.isActive,
      updatedAt: NOW,
      updatedBy: actorStamp(userId),
    });
    const saved = departmentById(input.departmentId);
    if (!saved) return notFound();

    /*
     * Deactivation keeps current placements — it stops new ones, because
     * `validateAssignmentDepartment` rejects an inactive department. Saying so
     * is the difference between an administrator understanding what they just
     * did and assuming the members were removed.
     */
    const detail = detailView(saved, DEMO_DATE);
    const remaining = detail.activeEmployeeCount;
    return success(
      detail,
      !input.isActive && remaining > 0
        ? [
            { code: 'MEMBERS_REMAIN', message: membersRemainWarning(record.name, remaining) },
          ]
        : undefined,
    );
  },

  async remove(userId, departmentId) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const record = departmentById(departmentId);
    if (!record) return notFound();
    if (rowView(record, DEMO_DATE).isReferenced) return conflictOf('referenced', record.name);

    removeDepartmentRecord(departmentId);
    return success({ removedId: departmentId });
  },

  async listEligibleLeads(userId, departmentId, effectiveFrom = DEMO_DATE) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const record = departmentById(departmentId);
    if (!record) return notFound();

    /*
     * `OH-FE-0204`. Eligibility is an active employee with an effective
     * assignment in *this department's division* — not in this department, and
     * not a company-wide Team Lead role. The screen never filters this list.
     */
    const options = mockStore
      .assignments()
      .filter(
        (assignment) =>
          assignment.divisionId === record.divisionId &&
          assignmentIsEffective(assignment, effectiveFrom),
      )
      .filter(
        (assignment) =>
          EMPLOYEES.find((candidate) => candidate.id === assignment.employeeId)?.status === 'active',
      )
      .map<EligibleDepartmentLeadOptionView>((assignment) => {
        const employee = employeeRef(assignment.employeeId);
        return {
          value: assignment.employeeId,
          label: `${employee.fullName} · ${employee.employeeCode}`,
          employee,
          divisionId: record.divisionId,
          assignmentId: assignment.id,
        };
      });

    const unique = new Map(options.map((option) => [option.value, option]));
    return success(
      [...unique.values()].sort((left, right) => left.label.localeCompare(right.label)),
    );
  },

  async appointLead(userId, input) {
    await delay();
    const refused = gate(userId);
    if (refused) return refused;

    const record = departmentById(input.departmentId);
    if (!record) return notFound();

    if (!record.isActive) return invalid(inactiveDepartmentFailure(record.name));

    const effectiveFrom = input.effectiveFrom;
    const failures: DepartmentValidationView[] = [
      ...validateAppointmentShape({
        effectiveFrom,
        reason: input.reason,
        today: DEMO_DATE,
        todayLabel: formatDate(DEMO_DATE),
      }),
    ];

    /* Eligibility needs rows: the F1 helper answers it on the date appointed. */
    const wellFormed = !failures.some((failure) => failure.field === 'effectiveFrom');
    if (wellFormed && validateLeadCandidate(input.departmentId, input.leadEmployeeId, effectiveFrom)) {
      failures.push(ineligibleLeadFailure());
    }

    if (failures.length > 0) return invalid(...failures);

    const history = leadHistoryForDepartment(input.departmentId);

    /*
     * `lead_period_overlap`: an appointment already starts on or after the new
     * date. Accepting it would need an existing row's dates changed, which is
     * exactly what must never happen.
     */
    if (history.some((assignment) => assignment.effectiveFrom >= effectiveFrom)) {
      return conflictOf('lead_period_overlap', record.name);
    }

    const open = history.find(
      (assignment) => assignment.effectiveTo === null && assignment.effectiveFrom < effectiveFrom,
    );
    if (open && open.leadEmployeeId === input.leadEmployeeId) {
      return invalid(
        alreadyLeadsFailure(
          employeeRef(open.leadEmployeeId).fullName,
          formatDate(open.effectiveFrom),
          record.name,
        ),
      );
    }

    const by = actorStamp(userId);

    /* Only an open period is closed, and only by giving it an end date. */
    if (open) {
      saveDepartmentLeadAssignment({
        ...open,
        effectiveTo: addDays(effectiveFrom, -1),
        updatedAt: NOW,
        updatedBy: by,
      });
    }

    saveDepartmentLeadAssignment({
      id: nextAppointmentId(input.departmentId),
      departmentId: input.departmentId,
      leadEmployeeId: input.leadEmployeeId,
      effectiveFrom,
      effectiveTo: null,
      reason: input.reason.trim() || null,
      createdAt: NOW,
      createdBy: by,
      updatedAt: NOW,
      updatedBy: by,
    });

    const saved = departmentById(input.departmentId);
    if (!saved) return notFound();
    const detail = detailView(saved, DEMO_DATE);
    return success(
      detail,
      effectiveFrom > DEMO_DATE
        ? [
            {
              code: 'APPOINTMENT_SCHEDULED',
              message: scheduledAppointmentWarning(
                employeeRef(input.leadEmployeeId).fullName,
                formatDate(effectiveFrom),
                detail.currentLead?.fullName ?? null,
              ),
            },
          ]
        : undefined,
    );
  },
};
