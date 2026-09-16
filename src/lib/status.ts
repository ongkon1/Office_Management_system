/**
 * Status presentation.
 *
 * Every day classification is rendered as text plus a shape plus colour, never
 * colour alone (`REQ-TIME-017`, `REQ-NFR-UX-003`). This module is the only
 * place that decides a status label, so a status cannot read one way on a
 * dashboard and another way in a report.
 */

import type {
  AttendanceState,
  DayStatus,
  DurationMinutes,
  RemarkState,
  RequestWorkflowState,
  TaskStatus,
} from '@/contracts/domain';
import type { MinuteProcessingStatus } from '@/contracts/meeting-minutes';
import type { DayStatusView, DurationView } from '@/contracts/view-models';
import { formatDuration, formatDurationAccessible } from './format';

/** Builds the duration view model used throughout the UI. */
export function toDurationView(minutes: DurationMinutes): DurationView {
  return {
    minutes,
    display: formatDuration(minutes),
    accessibleLabel: formatDurationAccessible(minutes),
  };
}

interface StatusDescriptor {
  readonly label: string;
  readonly accessibleLabel: string;
  readonly tone: DayStatusView['tone'];
  /** Shape name resolved to an icon by `StatusIndicator`. */
  readonly shape: 'circle-empty' | 'circle-half' | 'circle-check' | 'chevron-up' | 'triangle-alert';
}

const DAY_STATUS: Readonly<Record<DayStatus, StatusDescriptor>> = {
  missing: {
    label: 'Missing',
    accessibleLabel: 'Missing timesheet',
    tone: 'missing',
    shape: 'circle-empty',
  },
  under_time: {
    label: 'Under-time',
    accessibleLabel: 'Under-time: below the required hours',
    tone: 'undertime',
    shape: 'circle-half',
  },
  complete: {
    label: 'Complete',
    accessibleLabel: 'Complete day',
    tone: 'complete',
    shape: 'circle-check',
  },
  overtime: {
    label: 'Overtime',
    accessibleLabel: 'Overtime: above eight hours',
    tone: 'overtime',
    shape: 'chevron-up',
  },
  critical: {
    label: 'Critical',
    accessibleLabel: 'Critical: above twelve hours',
    tone: 'critical',
    shape: 'triangle-alert',
  },
};

/**
 * Meeting-minute AI processing status (`FE-1110`, `REQ-MTG-024`): text, shape
 * and colour, like a day status. The tones are general badge tones — reusing
 * the day-classification tones would make a Failed minute read as a Critical
 * day.
 */
export interface ProcessingStatusDescriptor {
  readonly label: string;
  readonly accessibleLabel: string;
  readonly tone: 'neutral' | 'accent' | 'success' | 'danger';
  readonly shape: 'circle-dashed' | 'clock' | 'loader' | 'circle-check' | 'circle-x';
}

const MINUTE_PROCESSING_STATUS: Readonly<Record<MinuteProcessingStatus, ProcessingStatusDescriptor>> = {
  not_processed: {
    label: 'Not processed',
    accessibleLabel: 'AI processing: not requested',
    tone: 'neutral',
    shape: 'circle-dashed',
  },
  pending: {
    label: 'Pending',
    accessibleLabel: 'AI processing: waiting to start',
    tone: 'accent',
    shape: 'clock',
  },
  processing: {
    label: 'Processing',
    accessibleLabel: 'AI processing: in progress',
    tone: 'accent',
    shape: 'loader',
  },
  processed: {
    label: 'Processed',
    accessibleLabel: 'AI processing: finished',
    tone: 'success',
    shape: 'circle-check',
  },
  failed: {
    label: 'Failed',
    accessibleLabel: 'AI processing: failed, the minute is saved',
    tone: 'danger',
    shape: 'circle-x',
  },
};

export function describeMinuteProcessingStatus(
  status: MinuteProcessingStatus,
): ProcessingStatusDescriptor {
  return MINUTE_PROCESSING_STATUS[status];
}

export function describeDayStatus(status: DayStatus): StatusDescriptor {
  return DAY_STATUS[status];
}

export function toDayStatusView(status: DayStatus): DayStatusView {
  const descriptor = DAY_STATUS[status];
  return {
    status,
    label: descriptor.label,
    accessibleLabel: descriptor.accessibleLabel,
    tone: descriptor.tone,
  };
}

export const TASK_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export const REQUEST_STATE_LABEL: Readonly<Record<RequestWorkflowState, string>> = {
  draft: 'Draft',
  pending: 'Pending',
  information_requested: 'Information requested',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const REMARK_STATE_LABEL: Readonly<Record<RemarkState, string>> = {
  open: 'Open',
  responded: 'Responded',
  corrected: 'Corrected',
  resolved: 'Resolved',
};

export const ATTENDANCE_LABEL: Readonly<Record<AttendanceState, string>> = {
  office: 'Office',
  wfh: 'WFH',
  official_travel: 'Official Travel',
  field_duty: 'Field Duty',
  training_duty: 'Training Duty',
  approved_leave: 'Approved leave',
  half_day_leave: 'Half-day leave',
  absent: 'Absent',
  holiday: 'Holiday',
  weekly_off: 'Weekly off',
  missing_timesheet: 'Missing timesheet',
};

export const WORK_LOCATION_LABEL = {
  office: 'Office',
  wfh: 'WFH',
  hybrid: 'Hybrid',
  field_work: 'Field Work',
  client_office: 'Client Office',
  official_travel: 'Official Travel',
  training_venue: 'Training Venue',
} as const;
