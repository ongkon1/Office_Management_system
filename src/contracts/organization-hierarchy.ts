import type { Department, DepartmentLeadAssignment, IsoDate, IsoDateTime } from './domain';
import type { DivisionRef, EmployeeRef } from './view-models';

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

export interface DepartmentValidationView {
  readonly field: 'divisionId' | 'departmentId' | 'leadEmployeeId' | 'effectiveFrom' | 'effectiveTo';
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
