import type { PoolConnection } from 'mysql2/promise';

export interface RepositoryScope {
  readonly actorUserId: string;
  readonly allowedDivisionIds: readonly string[];
  readonly allowedEmployeeIds: readonly string[];
  readonly canAccessGovernmentProjects: boolean;
}

export interface DivisionRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly isRestricted: boolean;
  readonly version: number;
}

export interface DailySummaryRecord {
  readonly employeeId: string;
  readonly workDate: string;
  readonly activeMinutes: number;
  readonly breakMinutes: number;
  readonly totalMinutes: number;
  readonly classification: 'missing' | 'under_time' | 'complete' | 'overtime' | 'critical' | 'not_required';
  readonly policyVersionId: string;
}

export interface DivisionRepository {
  listVisible(scope: RepositoryScope, connection?: PoolConnection): Promise<readonly DivisionRecord[]>;
  findVisibleById(id: string, scope: RepositoryScope, connection?: PoolConnection): Promise<DivisionRecord | null>;
}

export interface DailySummaryRepository {
  listForEmployee(
    employeeId: string,
    range: { readonly from: string; readonly to: string },
    scope: RepositoryScope,
    connection?: PoolConnection,
  ): Promise<readonly DailySummaryRecord[]>;
}
