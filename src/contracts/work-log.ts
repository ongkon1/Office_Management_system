/**
 * Task-based active-work contracts (`REQ-TIME-004`–`009`, `REQ-TIME-029`).
 *
 * These types intentionally contain no clock range or timer reference. A work
 * log says how many integer minutes belong to one local date and task; it does
 * not claim when during the day those minutes occurred.
 */

import type {
  ActorRef,
  AuditableRecord,
  DurationMinutes,
  WorkLocation,
} from './domain';
import type { IsoDate } from './query';

export type WorkLogSource = 'manual' | 'migrated_clock_entry' | 'imported';
export type WorkLogState = 'draft' | 'saved' | 'locked';

export interface WorkLogInput {
  readonly employeeId: string;
  readonly workDate: IsoDate;
  readonly divisionId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly durationMinutes: DurationMinutes;
  readonly workLocation: WorkLocation;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly supportingLink: string | null;
  readonly attachmentIds: readonly string[];
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
  readonly source: WorkLogSource;
  readonly idempotencyKey: string;
}

export interface WorkLog extends AuditableRecord, WorkLogInput {
  readonly id: string;
  readonly version?: number;
  readonly state: WorkLogState;
  readonly policyVersion: number;
}

export interface DurationViewValue {
  readonly minutes: DurationMinutes;
  readonly display: string;
  readonly accessibleLabel: string;
}

export interface WorkLogView {
  readonly id: string;
  readonly version?: number;
  readonly workDate: IsoDate;
  readonly workDateLabel: string;
  readonly employeeId: string;
  readonly division: { readonly id: string; readonly name: string; readonly code: string };
  readonly project: { readonly id: string; readonly name: string; readonly code: string };
  readonly task: { readonly id: string; readonly title: string };
  readonly duration: DurationViewValue;
  readonly workLocation: WorkLocation;
  readonly workLocationLabel: string;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly supportingLink: string | null;
  readonly attachmentCount: number | 'restricted';
  readonly source: WorkLogSource;
  readonly state: WorkLogState;
  readonly createdAt: string;
  readonly createdBy: ActorRef;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

export interface TaskDailyActualView {
  readonly workDate: IsoDate;
  readonly workDateLabel: string;
  readonly actual: DurationViewValue;
  readonly workLogIds: readonly string[];
}

export interface DurationVarianceView {
  readonly minutes: DurationMinutes;
  readonly label: string;
}
