/**
 * Mock workspace service (Phase 7).
 *
 * Notifications, search, documents, messages and employee self-service share
 * one service because they share one rule: **the viewer's authorization is
 * applied before anything is counted or grouped**.
 *
 * Search is the sharpest case. A result the viewer may not see is removed
 * before `totalCount` is computed, so the count itself cannot betray a hidden
 * record. The `isRestricted` flag exists only for records whose *existence* the
 * viewer already knows — their own restricted document, say — never to advertise
 * something they could not otherwise reach.
 */

import type {
  GeneralRemark,
  IsoDate,
  LeaveRequest,
  WfhRequest,
} from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  DocumentItemView,
  LeaveRequestInput,
  MessagePrototypeView,
  NotificationCentreView,
  NotificationGroupKey,
  NotificationItemView,
  SearchEntityKind,
  SearchResultView,
  SearchResultsView,
  SelfEvaluationFormValues,
  SelfEvaluationView,
  SelfRequestView,
  WfhRequestInput,
  WorkspaceService,
} from '@/contracts/workspace';
import { success } from '@/contracts/results';
import { aggregateSummaries } from '@/lib/calculation/engine';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatDateWithWeekday,
  formatTimestamp,
} from '@/lib/format';
import { toDurationView } from '@/lib/status';
import {
  DEMO_TODAY,
  LEAVE_BALANCES,
  LEAVE_TYPES,
  PROJECTS,
  STANDARD_POLICY,
} from '@/fixtures';
import { EMPLOYEES, EVALUATIONS, EVALUATION_PERIODS, EVALUATION_WEIGHTING } from '@/fixtures/hr';
import {
  AUDIT_EVENTS,
  DOCUMENTS,
  MESSAGES,
  MESSAGE_THREADS,
  NOTIFICATIONS,
  type NotificationFixture,
} from '@/fixtures/workspace';
import { DIVISIONS, findAccountByUserId } from './accounts';
import { mockStore } from './store';
import { summaryFor } from './timesheet';

const LATENCY_MS = 150;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

function notFound(message: string) {
  return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message };
}

function denied(message: string, guidance: string) {
  return { status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message, guidance };
}

function invalid(field: string, message: string, guidance: string) {
  return {
    status: 'validation_failure' as const,
    code: 'VALIDATION_FAILED' as const,
    message,
    focusField: field,
    fieldErrors: [{ field, code: 'REQUIRED' as const, message, guidance }],
  };
}

function viewerOf(userId: string) {
  return findAccountByUserId(userId);
}

function hasPermission(userId: string, permission: string): boolean {
  return viewerOf(userId)?.permissions.includes(permission) ?? false;
}

function employeeIdOf(userId: string): string {
  return viewerOf(userId)?.employeeId ?? '';
}

function divisionOf(divisionId: string) {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return (
    division ?? {
      id: divisionId,
      name: divisionId,
      code: divisionId.toUpperCase(),
      isRestricted: false,
    }
  );
}

function employeeName(employeeId: string): string {
  return EMPLOYEES.find((item) => item.id === employeeId)?.fullName ?? employeeId;
}

/** Divisions this viewer may see records from, honouring the GOV restriction. */
function visibleDivisionIds(userId: string): readonly string[] {
  const viewer = viewerOf(userId);
  if (!viewer) return [];
  return viewer.scopedDivisionIds.filter(
    (id) => id !== 'gov' || hasPermission(userId, SENSITIVE_PERMISSIONS.governmentProjects),
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

const GROUP_LABEL: Readonly<Record<NotificationGroupKey, string>> = {
  action_required: 'Needs your attention',
  time: 'Time and attendance',
  work: 'Projects and tasks',
  requests: 'Requests',
  evaluation: 'Evaluation',
  periods: 'Payroll periods',
  exports: 'Exports',
};

function groupOf(type: NotificationFixture['type']): NotificationGroupKey {
  switch (type) {
    case 'missing_time':
    case 'under_time':
    case 'overtime':
    case 'critical_time':
      return 'time';
    case 'task_assigned':
    case 'deadline_approaching':
    case 'task_overdue':
    case 'workload_warning':
      return 'work';
    case 'remark_added':
    case 'correction_requested':
      return 'action_required';
    case 'wfh_decision':
    case 'leave_decision':
    case 'request_submitted':
      return 'requests';
    case 'evaluation_due':
    case 'evaluation_published':
      return 'evaluation';
    case 'period_verified':
      return 'periods';
    case 'export_ready':
      return 'exports';
    default:
      return 'action_required';
  }
}

const ACTION_TYPES = new Set([
  'correction_requested',
  'request_submitted',
  'critical_time',
  'missing_time',
  'evaluation_due',
]);

let readOverrides: Record<string, boolean> = {};

function notificationView(fixture: NotificationFixture): NotificationItemView {
  const group = groupOf(fixture.type);
  const requiresAction = ACTION_TYPES.has(fixture.type);
  return {
    id: fixture.id,
    type: fixture.type,
    title: fixture.title,
    body: fixture.body,
    createdAtLabel: formatTimestamp(fixture.createdAt),
    isRead: readOverrides[fixture.id] ?? fixture.isRead,
    href: fixture.href,
    relatedLabel: fixture.relatedLabel,
    group: requiresAction ? 'action_required' : group,
    groupLabel: GROUP_LABEL[requiresAction ? 'action_required' : group],
    requiresAction,
  };
}

function buildNotificationCentre(userId: string): NotificationCentreView {
  const items = NOTIFICATIONS.filter((item) => item.recipientUserId === userId).map(
    notificationView,
  );
  const order: NotificationGroupKey[] = [
    'action_required',
    'time',
    'work',
    'requests',
    'evaluation',
    'periods',
    'exports',
  ];
  return {
    unreadCount: items.filter((item) => !item.isRead).length,
    groups: order
      .map((key) => ({
        key,
        label: GROUP_LABEL[key],
        items: items
          .filter((item) => item.group === key)
          .sort((a, b) => b.createdAtLabel.localeCompare(a.createdAtLabel)),
      }))
      .filter((group) => group.items.length > 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const KIND_LABEL: Readonly<Record<SearchEntityKind, string>> = {
  employee: 'Employees',
  division: 'Divisions',
  project: 'Projects',
  task: 'Tasks',
  timesheet: 'Timesheets',
  remark: 'Remarks',
  document: 'Documents',
};

let recentSearches: Record<string, string[]> = {};

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function snippetOf(text: string, needle: string): string | null {
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return null;
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + needle.length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function searchFor(userId: string, term: string): readonly SearchResultView[] {
  const viewer = viewerOf(userId);
  if (!viewer) return [];
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const divisions = visibleDivisionIds(userId);
  const isPrivileged =
    viewer.primaryRole === 'hr_manager' || viewer.primaryRole === 'super_admin';
  const results: SearchResultView[] = [];

  /* Employees — HR and administrators only; a Team Lead sees their own scope. */
  const employeeScope = isPrivileged
    ? EMPLOYEES.map((employee) => employee.id)
    : viewer.scopedEmployeeIds.length
      ? viewer.scopedEmployeeIds
      : [viewer.employeeId];
  for (const employeeId of employeeScope) {
    const employee = EMPLOYEES.find((item) => item.id === employeeId);
    if (!employee) continue;
    if (!matches(`${employee.fullName} ${employee.employeeCode} ${employee.designation}`, needle)) {
      continue;
    }
    results.push({
      id: employee.id,
      kind: 'employee',
      kindLabel: 'Employee',
      title: employee.fullName,
      subtitle: `${employee.employeeCode} · ${employee.designation}`,
      href: isPrivileged ? `/employees/${employee.id}` : '/team',
      snippet: null,
      isRestricted: false,
    });
  }

  /* Divisions — only those the viewer is scoped to and permitted to see. */
  for (const divisionId of divisions) {
    const division = divisionOf(divisionId);
    if (!matches(`${division.name} ${division.code}`, needle)) continue;
    results.push({
      id: division.id,
      kind: 'division',
      kindLabel: 'Division',
      title: division.name,
      subtitle: division.code,
      href: isPrivileged ? '/admin/divisions' : '/divisions',
      snippet: null,
      isRestricted: false,
    });
  }

  /* Projects and tasks — filtered to visible divisions. */
  for (const project of PROJECTS) {
    if (!divisions.includes(project.divisionId)) continue;
    if (!matches(`${project.name} ${project.code}`, needle)) continue;
    results.push({
      id: project.id,
      kind: 'project',
      kindLabel: 'Project',
      title: project.name,
      subtitle: `${project.code} · ${divisionOf(project.divisionId).name}`,
      href: `/projects/${project.id}`,
      snippet: null,
      isRestricted: false,
    });
  }

  for (const task of mockStore.tasks()) {
    if (!divisions.includes(task.divisionId)) continue;
    if (!matches(`${task.title} ${task.description ?? ''}`, needle)) continue;
    results.push({
      id: task.id,
      kind: 'task',
      kindLabel: 'Task',
      title: task.title,
      subtitle: `${divisionOf(task.divisionId).code} · ${employeeName(task.assigneeEmployeeId)}`,
      href: `/tasks/${task.id}`,
      snippet: snippetOf(task.description ?? '', needle),
      isRestricted: false,
    });
  }

  /* Timesheets — the viewer's own days, matched by date text. */
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDays('2026-08-20', offset);
    if (!matches(`${date} ${formatDateWithWeekday(date)}`, needle)) continue;
    results.push({
      id: date,
      kind: 'timesheet',
      kindLabel: 'Timesheet',
      title: formatDateWithWeekday(date),
      subtitle: 'Your recorded day',
      href: `/timesheets/${date}`,
      snippet: null,
      isRestricted: false,
    });
  }

  /* Remarks — the viewer's own, plus their assigned scope. */
  const remarkScope = isPrivileged
    ? EMPLOYEES.map((employee) => employee.id)
    : [viewer.employeeId, ...viewer.scopedEmployeeIds];
  const seenRemarks = new Set<string>();
  for (const employeeId of remarkScope) {
    for (const remark of mockStore.remarksFor(employeeId) as readonly GeneralRemark[]) {
      if (seenRemarks.has(remark.id)) continue;
      if (!matches(remark.message, needle)) continue;
      seenRemarks.add(remark.id);
      results.push({
        id: remark.id,
        kind: 'remark',
        kindLabel: 'Remark',
        title: `Remark for ${employeeName(remark.employeeId)}`,
        subtitle: formatTimestamp(remark.createdAt),
        href: `/remarks/${remark.id}`,
        snippet: snippetOf(remark.message, needle),
        isRestricted: false,
      });
    }
  }

  /* Documents — a document needing a permission the viewer lacks is omitted. */
  for (const document of DOCUMENTS) {
    if (document.divisionId && !divisions.includes(document.divisionId)) continue;
    if (document.requiresPermission && !hasPermission(userId, document.requiresPermission)) {
      continue;
    }
    if (!matches(`${document.title} ${document.description ?? ''}`, needle)) continue;
    results.push({
      id: document.id,
      kind: 'document',
      kindLabel: 'Document',
      title: document.title,
      subtitle: `${document.fileName} · v${document.version}`,
      href: '/documents',
      snippet: snippetOf(document.description ?? '', needle),
      isRestricted: false,
    });
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

function sizeLabel(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function mediaLabel(mediaType: string): string {
  if (mediaType.includes('pdf')) return 'PDF';
  if (mediaType.includes('wordprocessingml')) return 'Word document';
  if (mediaType.includes('spreadsheetml')) return 'Spreadsheet';
  return 'File';
}

/* -------------------------------------------------------------------------- */
/* Self-service                                                               */
/* -------------------------------------------------------------------------- */

const REQUEST_STATE_LABEL = {
  draft: 'Draft',
  pending: 'Pending',
  information_requested: 'Information requested',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
} as const;

function leaveTypeLabel(key: LeaveRequest['leaveType']): string {
  return LEAVE_TYPES.find((type) => type.key === key)?.label ?? key;
}

function nextStepFor(state: keyof typeof REQUEST_STATE_LABEL): string | null {
  if (state === 'pending') return 'Waiting for your Team Lead to decide. You can still cancel it.';
  if (state === 'information_requested') {
    return 'Your Team Lead asked for more detail. Reply on the request so it can be decided.';
  }
  if (state === 'approved') return 'Record your completed work for the day as usual.';
  if (state === 'rejected') return 'Speak to your Team Lead if the situation has changed.';
  return null;
}

function wfhSelfView(request: WfhRequest): SelfRequestView {
  return {
    id: request.id,
    kind: 'wfh',
    dateLabel: formatDateWithWeekday(request.wfhDate),
    startDate: request.wfhDate,
    endDate: request.wfhDate,
    portion: request.portion,
    portionLabel: request.portion === 'half_day' ? 'Half day' : 'Full day',
    leaveType: null,
    leaveTypeLabel: null,
    reason: request.reason,
    detail: `${request.plannedTasks} ${request.contactAvailability}`.trim(),
    state: request.state,
    stateLabel: REQUEST_STATE_LABEL[request.state],
    decisionLabel: request.decision
      ? `${REQUEST_STATE_LABEL[request.decision.outcome]} by ${request.decision.decidedBy.displayName}`
      : null,
    decisionComment: request.decision?.comment ?? null,
    overrideNote: request.decision?.override
      ? `HR replaced the earlier ${REQUEST_STATE_LABEL[request.decision.override.previousOutcome].toLowerCase()} decision. Reason: ${request.decision.override.reason}`
      : null,
    nextStep: nextStepFor(request.state),
    canCancel: request.state === 'pending' || request.state === 'information_requested',
    canRespond: request.state === 'information_requested',
    conflictNote: null,
  };
}

function leaveSelfView(request: LeaveRequest): SelfRequestView {
  const overlapping = mockStore
    .allLeaveRequests()
    .find(
      (other) =>
        other.id !== request.id &&
        other.employeeId === request.employeeId &&
        other.state === 'approved' &&
        other.startDate <= request.endDate &&
        other.endDate >= request.startDate,
    );
  return {
    id: request.id,
    kind: 'leave',
    dateLabel:
      request.startDate === request.endDate
        ? formatDateWithWeekday(request.startDate)
        : formatDateRange(request.startDate, request.endDate),
    startDate: request.startDate,
    endDate: request.endDate,
    portion: request.portion,
    portionLabel: request.portion === 'half_day' ? 'Half day' : 'Full day',
    leaveType: request.leaveType,
    leaveTypeLabel: leaveTypeLabel(request.leaveType),
    reason: request.reason,
    detail: `${leaveTypeLabel(request.leaveType)} · ${request.totalDays} day${request.totalDays === 1 ? '' : 's'}`,
    state: request.state,
    stateLabel: REQUEST_STATE_LABEL[request.state],
    decisionLabel: request.decision
      ? `${REQUEST_STATE_LABEL[request.decision.outcome]} by ${request.decision.decidedBy.displayName}`
      : null,
    decisionComment: request.decision?.comment ?? null,
    overrideNote: request.decision?.override
      ? `HR replaced the earlier ${REQUEST_STATE_LABEL[request.decision.override.previousOutcome].toLowerCase()} decision. Reason: ${request.decision.override.reason}`
      : null,
    nextStep: nextStepFor(request.state),
    canCancel: request.state === 'pending' || request.state === 'information_requested',
    canRespond: request.state === 'information_requested',
    conflictNote: overlapping
      ? `Overlaps approved ${leaveTypeLabel(overlapping.leaveType)} on ${formatDate(overlapping.startDate)}.`
      : null,
  };
}

const SELF_EVALUATION_EMPTY: SelfEvaluationFormValues = {
  achievements: '',
  completedProjects: '',
  challenges: '',
  skills: '',
  trainingNeeds: '',
  goals: '',
  supportRequired: '',
};

let selfEvaluationDrafts: Record<string, SelfEvaluationFormValues> = {};
let selfEvaluationSubmitted: Record<string, string> = {};

const AREA_LABELS = {
  task_completion: 'Task completion',
  work_quality: 'Work quality',
  timeliness: 'Timeliness',
  teamwork_communication: 'Teamwork and communication',
  responsibility: 'Responsibility',
  learning_initiative: 'Learning and initiative',
} as const;

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const mockWorkspaceService: WorkspaceService = {
  async getNotifications(userId) {
    await delay();
    if (!viewerOf(userId)) return notFound('Notifications not found.');
    return success(buildNotificationCentre(userId));
  },

  async markNotificationRead(userId, id, isRead) {
    await delay();
    const fixture = NOTIFICATIONS.find(
      (item) => item.id === id && item.recipientUserId === userId,
    );
    // Another recipient's notification is not found, not denied.
    if (!fixture) return notFound('Notification not found.');
    readOverrides = { ...readOverrides, [id]: isRead };
    return success(buildNotificationCentre(userId));
  },

  async markAllNotificationsRead(userId) {
    await delay();
    const next = { ...readOverrides };
    for (const item of NOTIFICATIONS.filter((entry) => entry.recipientUserId === userId)) {
      next[item.id] = true;
    }
    readOverrides = next;
    return success(buildNotificationCentre(userId));
  },

  async search(userId, term, kinds) {
    await delay();
    if (!viewerOf(userId)) return notFound('Search unavailable.');

    const trimmed = term.trim();
    if (trimmed) {
      const existing = recentSearches[userId] ?? [];
      recentSearches = {
        ...recentSearches,
        [userId]: [trimmed, ...existing.filter((item) => item !== trimmed)].slice(0, 5),
      };
    }

    const all = searchFor(userId, trimmed).filter(
      (result) => !kinds?.length || kinds.includes(result.kind),
    );
    const presentKinds = [...new Set(all.map((result) => result.kind))];

    return success<SearchResultsView>({
      term: trimmed,
      // Counted after filtering, so the number cannot reveal hidden records.
      totalCount: all.length,
      groups: presentKinds.map((kind) => ({
        kind,
        label: KIND_LABEL[kind],
        results: all.filter((result) => result.kind === kind),
      })),
      guidance: !trimmed
        ? 'Type at least one character to search employees, divisions, projects, tasks, timesheets, remarks and documents.'
        : all.length === 0
          ? 'No results you have access to. Check the spelling, try a shorter term, or search a different kind of record.'
          : null,
    });
  },

  async listRecentSearches(userId) {
    await delay();
    return success(recentSearches[userId] ?? []);
  },

  async getDocuments(userId, filters) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound('Document library not found.');

    const divisions = visibleDivisionIds(userId);
    const term = (filters?.term ?? '').trim().toLowerCase();

    const visible = DOCUMENTS.filter((document) => {
      if (document.divisionId && !divisions.includes(document.divisionId)) return false;
      if (filters?.scopes?.length && !filters.scopes.includes(document.scope)) return false;
      if (term && !`${document.title} ${document.description ?? ''} ${document.fileName}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });

    const items: DocumentItemView[] = visible.map((document) => {
      const restricted = Boolean(
        document.requiresPermission && !hasPermission(userId, document.requiresPermission),
      );
      return {
        id: document.id,
        title: document.title,
        description: document.description,
        scope: document.scope,
        scopeLabel:
          document.scope === 'company'
            ? 'Company'
            : document.scope === 'division'
              ? `Division: ${divisionOf(document.divisionId ?? '').name}`
              : `Project: ${PROJECTS.find((p) => p.id === document.projectId)?.code ?? ''}`,
        groupLabel:
          document.scope === 'company'
            ? 'Company documents'
            : document.scope === 'division'
              ? divisionOf(document.divisionId ?? '').name
              : PROJECTS.find((p) => p.id === document.projectId)?.name ?? 'Project',
        version: document.version,
        fileName: document.fileName,
        mediaTypeLabel: mediaLabel(document.mediaType),
        sizeLabel: sizeLabel(document.sizeBytes),
        uploadedAtLabel: formatTimestamp(document.uploadedAt),
        uploadedByLabel: document.uploadedBy,
        isRestricted: restricted,
        restrictionReason: restricted
          ? 'This document belongs to a restricted division and needs the government-project permission.'
          : null,
        canDownload: !restricted,
        previewPlaceholder: `Preview of ${document.fileName} is not rendered during the frontend milestone. File handling arrives with the backend document service.`,
      };
    });

    const groupKeys = [...new Set(items.map((item) => item.groupLabel))];
    return success({
      groups: groupKeys.map((label) => ({
        key: label,
        label,
        scope: items.find((item) => item.groupLabel === label)!.scope,
        documents: items.filter((item) => item.groupLabel === label),
      })),
      totalCount: items.length,
      restrictedCount: items.filter((item) => item.isRestricted).length,
    });
  },

  async downloadDocument(userId, id) {
    await delay();
    const document = DOCUMENTS.find((item) => item.id === id);
    if (!document) return notFound('Document not found.');
    if (document.divisionId && !visibleDivisionIds(userId).includes(document.divisionId)) {
      return notFound('Document not found.');
    }
    if (document.requiresPermission && !hasPermission(userId, document.requiresPermission)) {
      return denied(
        'This document belongs to a restricted division.',
        'Ask an administrator for the government-project permission, or request the document from its owner.',
      );
    }
    return success({
      note: `No file is delivered during the frontend milestone. ${document.fileName} would download here once the backend document service exists.`,
    });
  },

  async getMessages(userId) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound('Messages not found.');

    const threads = MESSAGE_THREADS.filter((thread) =>
      thread.participantUserIds.includes(userId),
    ).map((thread) => ({
      id: thread.id,
      kind: thread.kind,
      kindLabel:
        thread.kind === 'division'
          ? 'Division channel'
          : thread.kind === 'project'
            ? 'Project channel'
            : thread.kind === 'direct'
              ? 'Direct message'
              : 'Task comments',
      title: thread.title,
      subtitle: thread.subtitle,
      lastMessageAtLabel: formatTimestamp(
        MESSAGES.filter((message) => message.threadId === thread.id)
          .map((message) => message.createdAt)
          .sort()
          .at(-1) ?? '2026-09-01T09:00:00+06:00',
      ),
      unreadCount: thread.unreadCount,
      messages: MESSAGES.filter((message) => message.threadId === thread.id).map((message) => ({
        id: message.id,
        authorName: message.authorName,
        body: message.body,
        atLabel: formatTimestamp(message.createdAt),
        isOwn: message.authorUserId === userId,
      })),
    }));

    return success<MessagePrototypeView>({
      threads,
      prototypeNote:
        'Messaging is a prototype, not a delivered module. Nothing is sent, stored or notified, and no message here reaches another person.',
      deliveryPhaseLabel: 'Deferred to product Phase 3',
    });
  },

  async getWfhSelfService(userId) {
    await delay();
    const employeeId = employeeIdOf(userId);
    if (!employeeId) return notFound('Requests not found.');

    const requests = mockStore.wfhFor(employeeId).map(wfhSelfView);
    return success({
      requests: requests.sort((a, b) => b.startDate.localeCompare(a.startDate)),
      approvedUpcoming: requests.filter(
        (request) => request.state === 'approved' && request.startDate >= DEMO_TODAY,
      ),
      divisionOptions: (viewerOf(userId)?.scopedDivisionIds ?? []).map((id) => ({
        value: id,
        label: divisionOf(id).name,
      })),
      canRequest: true,
      disabledReason: null,
    });
  },

  async submitWfhRequest(userId, input: WfhRequestInput) {
    await delay();
    const employeeId = employeeIdOf(userId);
    if (!employeeId) return notFound('Requests not found.');

    if (!input.reason.trim()) {
      return invalid(
        'reason',
        'Give a reason for the request.',
        'Say why the work is better done from home on this date.',
      );
    }
    if (!input.plannedTasks.trim()) {
      return invalid(
        'plannedTasks',
        'List the work you plan to do.',
        'Name the tasks or deliverables so your Team Lead can judge the request.',
      );
    }
    if (input.wfhDate < DEMO_TODAY) {
      return invalid(
        'wfhDate',
        'Choose a date that has not passed.',
        'A work-from-home day is requested in advance. Record the day as WFH on the timesheet if it already happened.',
      );
    }
    const existing = mockStore
      .wfhFor(employeeId)
      .find((request) => request.wfhDate === input.wfhDate && request.state !== 'cancelled' && request.state !== 'rejected');
    if (existing) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `You already have a ${REQUEST_STATE_LABEL[existing.state].toLowerCase()} request for ${formatDate(input.wfhDate)}.`,
        guidance: 'Cancel the existing request before submitting another for the same day.',
      };
    }

    const now = new Date().toISOString();
    const request: WfhRequest = {
      id: `wfh-${Date.now()}`,
      employeeId,
      requestDate: DEMO_TODAY,
      wfhDate: input.wfhDate,
      portion: input.portion,
      reason: input.reason.trim(),
      plannedTasks: input.plannedTasks.trim(),
      divisionId: input.divisionId,
      contactAvailability: input.contactAvailability.trim(),
      attachmentIds: [],
      state: 'pending',
      decision: null,
      createdAt: now,
      createdBy: { userId, displayName: viewerOf(userId)?.fullName ?? 'Employee' },
      updatedAt: now,
      updatedBy: { userId, displayName: viewerOf(userId)?.fullName ?? 'Employee' },
    };
    mockStore.addWfhRequest(request);
    return success(wfhSelfView(request));
  },

  async cancelRequest(userId, kind, id) {
    await delay();
    const employeeId = employeeIdOf(userId);
    const source = kind === 'wfh' ? mockStore.allWfhRequests() : mockStore.allLeaveRequests();
    const request = source.find((item) => item.id === id);
    // Someone else's request is not found, never denied.
    if (!request || request.employeeId !== employeeId) return notFound('Request not found.');
    if (request.state !== 'pending' && request.state !== 'information_requested') {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `A ${REQUEST_STATE_LABEL[request.state].toLowerCase()} request cannot be cancelled.`,
        guidance: 'Speak to your Team Lead if the decision needs to change.',
      };
    }

    const next = {
      ...request,
      state: 'cancelled' as const,
      updatedAt: new Date().toISOString(),
      updatedBy: { userId, displayName: viewerOf(userId)?.fullName ?? 'Employee' },
    };
    if (kind === 'wfh') {
      mockStore.updateWfhRequest(id, next as WfhRequest);
      return success(wfhSelfView(next as WfhRequest));
    }
    mockStore.updateLeaveRequest(id, next as LeaveRequest);
    return success(leaveSelfView(next as LeaveRequest));
  },

  async getLeaveSelfService(userId) {
    await delay();
    const employeeId = employeeIdOf(userId);
    if (!employeeId) return notFound('Leave not found.');

    const balances = LEAVE_BALANCES.filter((balance) => balance.employeeId === employeeId);
    return success({
      balances: balances.map((balance) => ({
        typeLabel: leaveTypeLabel(balance.leaveType),
        entitledDays: balance.entitledDays,
        consumedDays: balance.consumedDays,
        remainingDays: balance.remainingDays,
      })),
      requests: mockStore
        .leaveFor(employeeId)
        .map(leaveSelfView)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
      leaveTypeOptions: LEAVE_TYPES.map((type) => ({
        value: type.key,
        label: type.label,
        allowsHalfDay: type.allowsHalfDay,
        remainingDays:
          balances.find((balance) => balance.leaveType === type.key)?.remainingDays ?? 0,
      })),
      canRequest: true,
      disabledReason: null,
    });
  },

  async submitLeaveRequest(userId, input: LeaveRequestInput) {
    await delay();
    const employeeId = employeeIdOf(userId);
    if (!employeeId) return notFound('Leave not found.');

    if (!input.reason.trim()) {
      return invalid('reason', 'Give a reason for the leave.', 'A short reason is enough.');
    }
    if (input.endDate < input.startDate) {
      return invalid(
        'endDate',
        'The end date cannot be before the start date.',
        'Choose an end date on or after the start date.',
      );
    }
    const type = LEAVE_TYPES.find((item) => item.key === input.leaveType);
    if (input.portion === 'half_day' && !type?.allowsHalfDay) {
      return invalid(
        'portion',
        `${leaveTypeLabel(input.leaveType)} cannot be taken as a half day.`,
        'Choose a full day, or a leave type that allows half days.',
      );
    }
    if (input.portion === 'half_day' && input.startDate !== input.endDate) {
      return invalid(
        'portion',
        'A half day covers a single date.',
        'Set the same start and end date, or choose a full day.',
      );
    }

    const days =
      input.portion === 'half_day' ? 0.5 : daysBetween(input.startDate, input.endDate) + 1;
    const balance = LEAVE_BALANCES.find(
      (item) => item.employeeId === employeeId && item.leaveType === input.leaveType,
    );
    if (balance && days > balance.remainingDays) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `That is ${days} day(s) against a remaining balance of ${balance.remainingDays}.`,
        guidance:
          'Shorten the request, choose another leave type, or apply for unpaid leave and discuss it with HR.',
      };
    }

    const now = new Date().toISOString();
    const request: LeaveRequest = {
      id: `lv-${Date.now()}`,
      employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      portion: input.portion,
      totalDays: days,
      reason: input.reason.trim(),
      attachmentIds: [],
      state: 'pending',
      decision: null,
      createdAt: now,
      createdBy: { userId, displayName: viewerOf(userId)?.fullName ?? 'Employee' },
      updatedAt: now,
      updatedBy: { userId, displayName: viewerOf(userId)?.fullName ?? 'Employee' },
    };
    mockStore.addLeaveRequest(request);
    return success(leaveSelfView(request));
  },

  async getSelfEvaluation(userId) {
    await delay();
    const employeeId = employeeIdOf(userId);
    if (!employeeId) return notFound('Evaluation not found.');

    const fixture = EVALUATIONS.find((item) => item.employeeId === employeeId);
    if (!fixture) {
      return success<SelfEvaluationView>({
        id: 'none',
        periodLabel: 'No open evaluation period',
        rangeLabel: '—',
        dueDateLabel: '—',
        status: 'not_open',
        statusLabel: 'No evaluation period open',
        statusExplanation:
          'You are not assigned to an evaluation period yet. HR opens periods and assigns reviewers.',
        values: SELF_EVALUATION_EMPTY,
        submittedAtLabel: null,
        isEditable: false,
        published: null,
        facts: [],
      });
    }

    const period = EVALUATION_PERIODS.find((item) => item.id === fixture.periodId);
    const draft = selfEvaluationDrafts[fixture.id];
    const submittedAt = selfEvaluationSubmitted[fixture.id] ?? fixture.selfEvaluation?.submittedAt ?? null;
    const values: SelfEvaluationFormValues = draft ??
      (fixture.selfEvaluation
        ? {
            achievements: fixture.selfEvaluation.achievements,
            completedProjects: fixture.selfEvaluation.completedProjects,
            challenges: fixture.selfEvaluation.challenges,
            skills: fixture.selfEvaluation.skills,
            trainingNeeds: fixture.selfEvaluation.trainingNeeds,
            goals: fixture.selfEvaluation.goals,
            supportRequired: fixture.selfEvaluation.supportRequired,
          }
        : SELF_EVALUATION_EMPTY);

    const isPublished = fixture.state === 'published';
    const status: SelfEvaluationView['status'] = isPublished
      ? 'published'
      : submittedAt
        ? fixture.state === 'reviewer_scoring' || fixture.state === 'hr_review'
          ? 'with_reviewer'
          : 'submitted'
        : draft
          ? 'self_evaluation_draft'
          : 'awaiting_self_evaluation';

    const from = period?.startDate ?? '2026-07-01';
    const to = period?.endDate ?? '2026-09-30';
    const dates: IsoDate[] = [];
    for (let offset = 0; offset <= daysBetween(from, to); offset += 1) {
      dates.push(addDays(from, offset));
    }
    const totals = aggregateSummaries(
      dates.map((date) => summaryFor(employeeId, date)),
      STANDARD_POLICY.overtimeThresholdMinutes,
    );

    const weighted =
      Object.values(fixture.scores).every((score) => score > 0)
        ? Math.round(
            (Object.entries(fixture.scores).reduce(
              (sum, [area, score]) =>
                sum + score * EVALUATION_WEIGHTING.weights[area as keyof typeof AREA_LABELS],
              0,
            ) /
              100) *
              100,
          ) / 100
        : 0;

    return success<SelfEvaluationView>({
      id: fixture.id,
      periodLabel: period?.name ?? fixture.periodId,
      rangeLabel: formatDateRange(from, to),
      dueDateLabel: period ? formatDate(period.dueDate) : '—',
      status,
      statusLabel:
        status === 'published'
          ? 'Published'
          : status === 'with_reviewer'
            ? 'With your reviewer'
            : status === 'submitted'
              ? 'Submitted'
              : status === 'self_evaluation_draft'
                ? 'Draft saved'
                : 'Awaiting your self-evaluation',
      statusExplanation:
        status === 'published'
          ? 'HR has published this evaluation. The result and your reviewer’s comments are below.'
          : status === 'with_reviewer'
            ? 'Your self-evaluation was submitted. Your reviewer is scoring it, and you will see the result only once HR publishes it.'
            : status === 'submitted'
              ? 'Your self-evaluation was submitted and is waiting for your reviewer.'
              : status === 'self_evaluation_draft'
                ? 'A draft is saved. It is not visible to your reviewer until you submit it.'
                : 'Complete your self-evaluation before the due date. Nothing is shared until you submit.',
      values,
      submittedAtLabel: submittedAt ? formatTimestamp(submittedAt) : null,
      isEditable: !isPublished && status !== 'with_reviewer' && status !== 'submitted',
      published: isPublished
        ? {
            weightedScore: weighted,
            reviewerSummary: fixture.reviewerSummary,
            publishedAtLabel: fixture.publishedAt ? formatTimestamp(fixture.publishedAt) : '—',
            areas: (Object.keys(AREA_LABELS) as (keyof typeof AREA_LABELS)[]).map((area) => ({
              label: AREA_LABELS[area],
              weightPercent: EVALUATION_WEIGHTING.weights[area],
              score: fixture.scores[area],
              comment: fixture.comments[area],
            })),
          }
        : null,
      facts: [
        { label: 'Active work', value: toDurationView(totals.activeMinutes).display },
        { label: 'Recognized break', value: toDurationView(totals.breakMinutes).display },
        { label: 'Overtime', value: toDurationView(totals.overtimeMinutes).display },
        { label: 'Complete days', value: String(totals.completeDayCount) },
        { label: 'Missing days', value: String(totals.missingDayCount) },
      ],
    });
  },

  async saveSelfEvaluation(userId, values, submit) {
    await delay();
    const employeeId = employeeIdOf(userId);
    const fixture = EVALUATIONS.find((item) => item.employeeId === employeeId);
    if (!fixture) return notFound('Evaluation not found.');
    if (fixture.state === 'published') {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'This evaluation has been published and cannot be changed.',
        guidance: 'Speak to HR if the published result is wrong.',
      };
    }
    if (submit && !values.achievements.trim()) {
      return invalid(
        'achievements',
        'Describe at least your key achievements before submitting.',
        'Your reviewer uses this alongside the automatic facts. A draft can be saved empty.',
      );
    }

    selfEvaluationDrafts = { ...selfEvaluationDrafts, [fixture.id]: values };
    if (submit) {
      selfEvaluationSubmitted = {
        ...selfEvaluationSubmitted,
        [fixture.id]: new Date().toISOString(),
      };
    }
    return this.getSelfEvaluation(userId);
  },
};

/** Test seam: restores the Phase 7 workspace state. */
export function resetWorkspaceState(): void {
  readOverrides = {};
  recentSearches = {};
  selfEvaluationDrafts = {};
  selfEvaluationSubmitted = {};
}

export { AUDIT_EVENTS };
