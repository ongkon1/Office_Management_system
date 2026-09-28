import type { Department, DepartmentLeadAssignment, IsoDate, IsoDateTime } from './domain';
import type { DivisionRef, EmployeeRef } from './view-models';
import type { Result } from './results';

export interface DepartmentOptionView {
  readonly value: string;
  readonly label: string;
  readonly divisionId: string;
  readonly isActive: boolean;
  readonly currentLead: EmployeeRef | null;
}

export interface EligibleDepartmentLeadOptionView {
  readonly value: string;
  readonly label: string;
  readonly employee: EmployeeRef;
  readonly divisionId: string;
  readonly assignmentId: string;
}

export interface DepartmentMemberView {
  readonly employee: EmployeeRef;
  readonly assignmentId: string;
  readonly departmentId: string;
  readonly division: DivisionRef;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  readonly isEffective: boolean;
}

export interface DepartmentLeadHistoryView {
  readonly assignment: DepartmentLeadAssignment;
  readonly lead: EmployeeRef;
  readonly isEffective: boolean;
}

export interface DepartmentListView {
  readonly department: Department;
  readonly division: DivisionRef;
  readonly currentLead: EmployeeRef | null;
  readonly activeEmployeeCount: number;
}

export interface DepartmentDetailView extends DepartmentListView {
  readonly members: readonly DepartmentMemberView[];
  readonly leadHistory: readonly DepartmentLeadHistoryView[];
}

/**
 * A field-level refusal from a hierarchy operation.
 *
 * `REQ-TIME-025` is the reason `guidance` is not optional: a refusal states
 * what is wrong *and* how to correct it. `OH-FE-0203` added the catalogue's own
 * fields (`name`, `code`, `description`) and the `reason` a status change or a
 * lead appointment carries.
 */
export interface DepartmentValidationView {
  readonly field:
    | 'divisionId'
    | 'departmentId'
    | 'name'
    | 'code'
    | 'description'
    | 'leadEmployeeId'
    | 'effectiveFrom'
    | 'effectiveTo'
    | 'reason';
  readonly message: string;
  readonly guidance: string;
}

export interface DepartmentConflictView {
  readonly code: 'duplicate_name' | 'duplicate_code' | 'lead_period_overlap' | 'referenced';
  readonly message: string;
  readonly guidance: string;
}

export interface DepartmentAuditView {
  readonly id: string;
  readonly departmentId: string;
  readonly action: 'created' | 'updated' | 'deactivated' | 'placement_changed' | 'lead_changed';
  readonly actorLabel: string;
  readonly occurredAt: IsoDateTime;
  readonly reason: string | null;
  readonly before: Readonly<Record<string, string>> | null;
  readonly after: Readonly<Record<string, string>> | null;
}

/* -------------------------------------------------------------------------- */
/* Department administration (Phase F2)                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the catalogue is narrowed to. Every field is optional; an omitted one
 * means "do not narrow on this", and the service — never the screen — decides
 * what a viewer may see before it counts anything.
 */
export interface DepartmentCatalogueFilter {
  /** `null` or omitted lists every division the viewer may administer. */
  readonly divisionId?: string | null;
  readonly status?: 'all' | 'active' | 'inactive';
  /** Matched against name and code. */
  readonly search?: string;
}

/**
 * One appointment, as the screen states it.
 *
 * `isScheduled` is the difference between the two flows `OH-FE-0205` asks for:
 * an appointment effective today is in force now, and one dated later is
 * announced but not yet in force. Both are stored the same way.
 */
export interface DepartmentLeadAppointmentView {
  readonly assignmentId: string;
  readonly lead: EmployeeRef;
  readonly effectiveFrom: IsoDate;
  readonly effectiveFromLabel: string;
  readonly effectiveTo: IsoDate | null;
  readonly effectiveToLabel: string | null;
  readonly isScheduled: boolean;
}

/**
 * A catalogue row (`OH-FE-0202`).
 *
 * The three `can*` flags are the service's answer, not the screen's guess. A
 * referenced department is one that any placement or appointment has ever
 * named: it is deactivated rather than deleted or moved, so history stays
 * readable (`OH-FE-0208`).
 */
export interface DepartmentCatalogueRowView extends DepartmentListView {
  readonly currentAppointment: DepartmentLeadAppointmentView | null;
  readonly scheduledAppointment: DepartmentLeadAppointmentView | null;
  /** Placements ever recorded against the department, effective or ended. */
  readonly placementCount: number;
  readonly isReferenced: boolean;
  readonly canEdit: boolean;
  readonly canChangeDivision: boolean;
  readonly canDeactivate: boolean;
  readonly canDelete: boolean;
  /** Why a blocked action is blocked. `null` when nothing is blocked. */
  readonly referenceGuidance: string | null;
}

export interface DepartmentDivisionGroupView {
  readonly division: DivisionRef;
  readonly departments: readonly DepartmentCatalogueRowView[];
  readonly activeCount: number;
  readonly inactiveCount: number;
}

export interface DepartmentCatalogueView {
  /** The date every effective-dated answer in this view was resolved on. */
  readonly asOf: IsoDate;
  readonly asOfLabel: string;
  readonly groups: readonly DepartmentDivisionGroupView[];
  readonly departmentCount: number;
  readonly totalCount: number;
  readonly divisionOptions: readonly { readonly value: string; readonly label: string }[];
}

export interface DepartmentAdminDetailView
  extends DepartmentCatalogueRowView,
    DepartmentDetailView {
  readonly asOf: IsoDate;
  readonly appointments: readonly DepartmentLeadAppointmentView[];
}

export interface DepartmentInput {
  readonly divisionId: string;
  readonly name: string;
  readonly code: string;
  readonly description: string;
}

export interface DepartmentLeadAppointmentInput {
  readonly departmentId: string;
  readonly leadEmployeeId: string;
  /** Today for an appointment in force now, a later date for a scheduled one. */
  readonly effectiveFrom: IsoDate;
  readonly reason: string;
}

export interface DepartmentStatusInput {
  readonly departmentId: string;
  readonly isActive: boolean;
  readonly reason: string;
}

/**
 * Department administration, as screens consume it (`OH-FE-0201`–`OH-FE-0209`).
 *
 * This replaces the preliminary primary-department prototype rather than
 * extending it: department is division-owned, leadership is effective-dated,
 * and only a Super Administrator reaches any of these operations. There is no
 * "move to another division" and no delete for a referenced department, because
 * neither is expressible without rewriting history.
 */
export interface DepartmentAdministrationService {
  catalogue(
    userId: string,
    filter?: DepartmentCatalogueFilter,
  ): Promise<Result<DepartmentCatalogueView>>;
  get(userId: string, departmentId: string): Promise<Result<DepartmentAdminDetailView>>;
  create(userId: string, input: DepartmentInput): Promise<Result<DepartmentAdminDetailView>>;
  update(
    userId: string,
    departmentId: string,
    input: DepartmentInput,
  ): Promise<Result<DepartmentAdminDetailView>>;
  setStatus(
    userId: string,
    input: DepartmentStatusInput,
  ): Promise<Result<DepartmentAdminDetailView>>;
  /** Only ever available for a department nothing has referenced. */
  remove(userId: string, departmentId: string): Promise<Result<{ readonly removedId: string }>>;
  listEligibleLeads(
    userId: string,
    departmentId: string,
    effectiveFrom?: IsoDate,
  ): Promise<Result<readonly EligibleDepartmentLeadOptionView[]>>;
  appointLead(
    userId: string,
    input: DepartmentLeadAppointmentInput,
  ): Promise<Result<DepartmentAdminDetailView>>;
}
