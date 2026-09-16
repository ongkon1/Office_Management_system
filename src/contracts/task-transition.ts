/**
 * Task workflow history.
 *
 * This module is deliberately separate from `lib/calculation`: transition
 * timestamps describe workflow events and can never be used as active time.
 */

import type { ActorRef, RoleKey, TaskStatus } from './domain';
import type { IsoDateTime } from './query';
import type {
  DurationVarianceView,
  TaskDailyActualView,
  WorkLogView,
} from './work-log';

export interface TaskStatusTransition {
  readonly id: string;
  readonly taskId: string;
  readonly fromStatus: TaskStatus;
  readonly toStatus: TaskStatus;
  readonly actor: ActorRef;
  readonly actorRole: RoleKey;
  readonly changedAt: IsoDateTime;
  readonly note: string | null;
  readonly idempotencyKey: string;
}

export interface TaskTransitionInput {
  readonly taskId: string;
  readonly fromStatus: TaskStatus;
  readonly toStatus: TaskStatus;
  readonly actorRole: RoleKey;
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number;
}

export const TASK_TRANSITION_RULES = [
  { from: 'pending', to: 'in_progress', allowedRoles: ['employee', 'team_lead', 'super_admin'], note: 'optional' },
  { from: 'in_progress', to: 'completed', allowedRoles: ['employee', 'team_lead', 'super_admin'], note: 'optional' },
  { from: 'completed', to: 'in_progress', allowedRoles: ['employee', 'team_lead', 'super_admin'], note: 'required' },
  { from: 'pending', to: 'completed', allowedRoles: ['team_lead'], note: 'required' },
] as const satisfies readonly {
  readonly from: TaskStatus;
  readonly to: TaskStatus;
  readonly allowedRoles: readonly RoleKey[];
  readonly note: 'optional' | 'required';
}[];

export function transitionRule(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
) {
  return TASK_TRANSITION_RULES.find(
    (rule) => rule.from === fromStatus && rule.to === toStatus,
  );
}

export function canTransition(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  actorRole: RoleKey,
): boolean {
  const rule = transitionRule(fromStatus, toStatus);
  return Boolean(
    rule && (rule.allowedRoles as readonly RoleKey[]).includes(actorRole),
  );
}

export function transitionRequiresNote(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
): boolean {
  return transitionRule(fromStatus, toStatus)?.note === 'required';
}

export type TaskHistoryItemView =
  | { readonly kind: 'transition'; readonly transition: TaskStatusTransition }
  | { readonly kind: 'work_log'; readonly workLog: WorkLogView }
  | {
      readonly kind: 'historical_clock_entry';
      readonly historicalEntry: {
        readonly id: string;
        readonly workDate: string;
        readonly workDateLabel: string;
        readonly timeRangeLabel: string;
        readonly duration: WorkLogView['duration'];
        readonly completedWork: string;
        readonly createdAt: string;
      };
    };

export interface TaskHistoryView {
  readonly taskId: string;
  readonly items: readonly TaskHistoryItemView[];
  readonly estimatedMinutes: number;
  readonly actualMinutes: number;
  readonly variance: DurationVarianceView;
  readonly dailyActuals: readonly TaskDailyActualView[];
}
