import type { NotificationType } from '@/contracts/domain';
import type { NotificationGroupKey } from '@/contracts/workspace';

/**
 * The notification catalogue (`BE-0701`, `BE-0705`, `REQ-NOT-004`).
 *
 * Every type has one fixed template. Nothing is interpolated: no task title,
 * remark text, employee name, money, evaluation score or government detail
 * ever reaches a notification body, an email or a provider log. The link is
 * the only specific thing a notification carries, and opening it goes through
 * the related record's own authorized service.
 */
export interface NotificationTemplate {
  readonly title: string;
  readonly body: string;
  readonly group: NotificationGroupKey;
  readonly requiresAction: boolean;
  /** The preference key a recipient can switch, shared with Settings. */
  readonly settingKey: string;
  /** Mandatory notifications cannot be switched off in-app. */
  readonly mandatory: boolean;
  /** Whether the email channel may carry this type at all. */
  readonly emailEligible: boolean;
}

const t = (
  title: string,
  body: string,
  group: NotificationGroupKey,
  options: Partial<Pick<NotificationTemplate, 'requiresAction' | 'settingKey' | 'mandatory' | 'emailEligible'>> & { settingKey: string },
): NotificationTemplate => ({
  title, body, group,
  requiresAction: options.requiresAction ?? false,
  settingKey: options.settingKey,
  mandatory: options.mandatory ?? false,
  emailEligible: options.emailEligible ?? true,
});

export const NOTIFICATION_TEMPLATES: Readonly<Record<NotificationType, NotificationTemplate>> = {
  missing_time: t('A working day has no recorded time', 'A scheduled working day has no saved work. Open the timesheet to review it.', 'time', { requiresAction: true, settingKey: 'missing_time' }),
  under_time: t('A working day is under time', 'A working day is below the required active time or break. Open the timesheet to review it.', 'time', { requiresAction: true, settingKey: 'missing_time' }),
  overtime: t('A working day is in overtime', 'A working day is above eight hours. Open the timesheet to review the reason recorded.', 'time', { settingKey: 'overtime' }),
  critical_time: t('A working day needs urgent review', 'A working day is above twelve hours. Open the timesheet to review the explanation.', 'time', { requiresAction: true, settingKey: 'critical_time', mandatory: true }),
  task_assigned: t('You have a new task', 'A task was assigned to you. Open it to see the details.', 'work', { settingKey: 'task_activity' }),
  task_reassigned: t('A task was reassigned', 'A task you are connected to has a new assignee. Open it to see the details.', 'work', { settingKey: 'task_activity' }),
  task_started: t('A task was started', 'A task you are connected to moved to In Progress.', 'work', { settingKey: 'task_activity', emailEligible: false }),
  task_completed: t('A task was completed', 'A task you are connected to was marked Completed.', 'work', { settingKey: 'task_activity', emailEligible: false }),
  task_reopened: t('A task was reopened', 'A completed task you are connected to was reopened.', 'work', { settingKey: 'task_activity' }),
  significant_variance: t('A task is over its estimate', 'Recorded work on a task has passed its estimate. Open it to review.', 'work', { settingKey: 'task_activity' }),
  deadline_approaching: t('A task is due soon', 'A task assigned to you is due within two days.', 'work', { settingKey: 'deadline_approaching' }),
  task_overdue: t('A task is overdue', 'A task is past its due date and not completed.', 'work', { requiresAction: true, settingKey: 'deadline_approaching' }),
  remark_added: t('You have a new remark', 'A general remark was added to your records. Open it to read and respond.', 'action_required', { requiresAction: true, settingKey: 'correction_requested' }),
  correction_requested: t('A correction was requested', 'A correction was requested on your records. Open it to see what is needed.', 'action_required', { requiresAction: true, settingKey: 'correction_requested' }),
  wfh_decision: t('Your WFH request was decided', 'A decision was recorded on your work-from-home request.', 'requests', { settingKey: 'request_decision' }),
  leave_decision: t('Your leave request was decided', 'A decision was recorded on your leave request.', 'requests', { settingKey: 'request_decision' }),
  request_submitted: t('A request needs your decision', 'A WFH or leave request is waiting for your decision.', 'requests', { requiresAction: true, settingKey: 'request_submitted' }),
  workload_warning: t('Planned workload is over capacity', 'A planned week is above the available capacity. Open workload planning to review it.', 'work', { requiresAction: true, settingKey: 'workload_warning' }),
  evaluation_due: t('An evaluation is due', 'An evaluation you are responsible for is due. Open it to continue.', 'evaluation', { requiresAction: true, settingKey: 'evaluation_due' }),
  evaluation_published: t('Your evaluation was published', 'An evaluation of your work was published. Open it to read it.', 'evaluation', { settingKey: 'evaluation_published' }),
  period_verified: t('A payroll period changed', 'A payroll period that includes your records was verified or amended.', 'periods', { settingKey: 'period_verification', mandatory: true }),
  export_ready: t('Your export is ready', 'An export you requested has finished. Open Exports to download it.', 'exports', { settingKey: 'export_ready' }),
  meeting_minute_processed: t('Meeting minute processed', 'Task generation for a meeting minute you started has finished.', 'work', { settingKey: 'meeting_minutes', emailEligible: false }),
  meeting_minute_failed: t('Meeting minute processing failed', 'Task generation for a meeting minute you started did not finish. Open it to retry.', 'work', { requiresAction: true, settingKey: 'meeting_minutes', emailEligible: false }),
  message_mention: t('You were mentioned', 'Someone mentioned you in a conversation you can read.', 'work', { settingKey: 'messages' }),
  announcement_posted: t('New announcement', 'An announcement was posted in a channel you belong to.', 'work', { settingKey: 'messages' }),
  task_review_requested: t('A task needs your review', 'An employee raised a task that is waiting for your review.', 'action_required', { requiresAction: true, settingKey: 'task_review' }),
  task_review_decided: t('Your task was reviewed', 'A task you raised was reviewed. Open it to see the decision.', 'work', { settingKey: 'task_review' }),
  requisition_review_requested: t('A requisition needs your review', 'A requisition is waiting for your decision. Open it to review the request.', 'action_required', { requiresAction: true, settingKey: 'request_submitted' }),
  requisition_decided: t('Your requisition was decided', 'A final decision was recorded on your requisition. Open it to see the result.', 'requests', { settingKey: 'request_decision' }),
  conveyance_review_requested: t('A conveyance claim needs your review', 'A conveyance claim is waiting for your decision. Open it to review the request.', 'action_required', { requiresAction: true, settingKey: 'request_submitted' }),
  conveyance_decided: t('Your conveyance claim was decided', 'A final decision was recorded on your conveyance claim. Open it to see the result.', 'requests', { settingKey: 'request_decision' }),
};

/**
 * What a notification points at. Only identifiers and a business date — never
 * content. A timesheet day is the employee plus the local work date.
 */
export type RelatedRecord =
  | { readonly type: 'task'; readonly id: string }
  | { readonly type: 'project'; readonly id: string }
  | { readonly type: 'timesheet'; readonly employeeId: string; readonly date: string }
  | { readonly type: 'request'; readonly kind: 'wfh' | 'leave'; readonly id: string }
  | { readonly type: 'evaluation'; readonly id: string }
  | { readonly type: 'remark'; readonly id: string }
  | { readonly type: 'period'; readonly id: string }
  | { readonly type: 'export'; readonly id: string }
  | { readonly type: 'message'; readonly id: string }
  | { readonly type: 'document'; readonly id: string }
  | { readonly type: 'workload'; readonly employeeId: string; readonly week: string }
  | { readonly type: 'requisition'; readonly id: string }
  | { readonly type: 'conveyance'; readonly id: string };

/** The stored column pair, plus the date when the record is a day. */
export function storedRelated(related: RelatedRecord): { relatedType: string; relatedId: string; date: string | null } {
  switch (related.type) {
    case 'timesheet': return { relatedType: 'timesheet', relatedId: related.employeeId, date: related.date };
    case 'workload': return { relatedType: 'workload', relatedId: related.employeeId, date: related.week };
    case 'request': return { relatedType: `${related.kind}_request`, relatedId: related.id, date: null };
    default: return { relatedType: related.type, relatedId: related.id, date: null };
  }
}

/** Reverses `storedRelated`, including rows written before this catalogue. */
export function relatedFromStored(type: string | null, id: string | null, date: string | null): RelatedRecord | null {
  if (!type || !id) return null;
  if (type === 'timesheet') return date ? { type, employeeId: id, date } : null;
  if (type === 'workload') return date ? { type, employeeId: id, week: date } : null;
  if (type === 'wfh_request' || type === 'leave_request') return { type: 'request', kind: type === 'wfh_request' ? 'wfh' : 'leave', id };
  if (['task', 'project', 'evaluation', 'remark', 'period', 'export', 'message', 'document', 'requisition', 'conveyance'].includes(type)) {
    return { type: type as 'task', id };
  }
  return null;
}

/** The authenticated route that opens the record — and checks access again. */
export function hrefFor(related: RelatedRecord, recipientEmployeeId: string | null = null): string {
  switch (related.type) {
    case 'task': return `/tasks/${related.id}`;
    case 'project': return `/projects/${related.id}`;
    case 'timesheet': return related.employeeId === recipientEmployeeId
      ? `/timesheets/${related.date}`
      : `/team/timesheets/${related.employeeId}/${related.date}`;
    case 'request': return `/requests/${related.kind}/${related.id}`;
    case 'evaluation': return `/evaluations/${related.id}`;
    case 'remark': return `/remarks/${related.id}`;
    case 'period': return '/hr/timesheets';
    case 'export': return '/reports/exports';
    case 'message': return '/messages';
    case 'document': return '/documents';
    case 'workload': return '/workload';
    case 'requisition': return `/requisitions/${related.id}`;
    case 'conveyance': return `/conveyance/${related.id}`;
  }
}

/**
 * Types written before this catalogue existed (`time.overtime`, HR job kinds).
 * They are read through this map, never rewritten, so history stays as stored.
 */
const LEGACY_TYPES: Readonly<Record<string, NotificationType>> = {
  'time.overtime': 'overtime',
  'time.critical': 'critical_time',
  'time.correction.requested': 'correction_requested',
  'time.period.amended': 'period_verified',
  'request.submitted': 'request_submitted',
  'evaluation.reminder': 'evaluation_due',
  'evaluation.published': 'evaluation_published',
};

export function canonicalType(stored: string): NotificationType | null {
  if (Object.hasOwn(NOTIFICATION_TEMPLATES, stored)) return stored as NotificationType;
  if (stored.startsWith('time.remark.')) return 'remark_added';
  return LEGACY_TYPES[stored] ?? null;
}
