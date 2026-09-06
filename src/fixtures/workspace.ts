/**
 * Phase 7 demo data: notifications, documents, message threads and audit events.
 *
 * Two things are deliberate throughout.
 *
 * Notification bodies say *that* something needs attention and never *what* the
 * protected value is — an escalation about a critical day names the day, not
 * the division or the cost (`REQ-NOT-004`).
 *
 * Audit entries exist for restricted records too. Their before/after values are
 * withheld while the event itself stays visible, because hiding the event would
 * make the log an unreliable account of what happened.
 *
 * Development only. Nothing above the service layer imports this file.
 */

import type { NotificationType } from '@/contracts/domain';

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export interface NotificationFixture {
  readonly id: string;
  readonly recipientUserId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
  readonly relatedLabel: string | null;
  readonly createdAt: string;
  readonly isRead: boolean;
}

export const NOTIFICATIONS: readonly NotificationFixture[] = [
  /* --- Nadia Rahman (employee) ------------------------------------------ */
  {
    id: 'ntf-1',
    recipientUserId: 'usr-1001',
    type: 'correction_requested',
    title: 'Correction requested on 26 August',
    body: 'Imran Hossain asked you to confirm the break and split the entry by task.',
    href: '/remarks/rmk-1',
    relatedLabel: 'Timesheet, 26 Aug 2026',
    createdAt: '2026-09-01T09:20:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-2',
    recipientUserId: 'usr-1001',
    type: 'deadline_approaching',
    title: 'Model evaluation harness is due in 8 days',
    body: 'Due 10 September 2026.',
    href: '/tasks/tsk-1',
    relatedLabel: 'Task',
    createdAt: '2026-09-02T08:00:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-3',
    recipientUserId: 'usr-1001',
    type: 'task_overdue',
    title: 'Portal accessibility audit is overdue',
    body: 'It was due on 25 August 2026 and is still in progress.',
    href: '/tasks/tsk-6',
    relatedLabel: 'Task',
    createdAt: '2026-08-26T08:00:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-4',
    recipientUserId: 'usr-1001',
    type: 'wfh_decision',
    title: 'WFH request approved for 28 August',
    body: 'Imran Hossain approved it. Record your completed work for the day as usual.',
    href: '/wfh',
    relatedLabel: 'WFH request',
    createdAt: '2026-08-27T10:12:00+06:00',
    isRead: true,
  },
  {
    id: 'ntf-5',
    recipientUserId: 'usr-1001',
    type: 'period_verified',
    title: 'July 2026 has been verified',
    body: 'Time records for July are now locked. Changes need an HR amendment.',
    href: '/timesheets',
    relatedLabel: 'Payroll period',
    createdAt: '2026-08-04T16:20:00+06:00',
    isRead: true,
  },

  /* --- Imran Hossain (Team Lead) ---------------------------------------- */
  {
    id: 'ntf-10',
    recipientUserId: 'usr-2001',
    type: 'critical_time',
    title: 'Critical time recorded by Tanvir Ahmed',
    body: 'A day above twelve hours was recorded on 24 August 2026 and needs review. HR was notified at the same time.',
    href: '/team/timesheets/emp-1002/2026-08-24',
    relatedLabel: 'Timesheet, 24 Aug 2026',
    createdAt: '2026-08-25T07:30:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-11',
    recipientUserId: 'usr-2001',
    type: 'missing_time',
    title: 'Missing timesheet for Sadia Karim',
    body: 'No entry for 20 August 2026 and no approved leave on that date.',
    href: '/team/timesheets',
    relatedLabel: 'Timesheet, 20 Aug 2026',
    createdAt: '2026-08-21T08:00:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-12',
    recipientUserId: 'usr-2001',
    type: 'request_submitted',
    title: 'Nadia Rahman requested WFH for 4 September',
    body: 'Awaiting your decision.',
    href: '/requests/wfh/wfh-1',
    relatedLabel: 'WFH request',
    createdAt: '2026-09-01T14:05:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-13',
    recipientUserId: 'usr-2001',
    type: 'evaluation_due',
    title: 'Q3 2026 evaluations are due on 30 September',
    body: 'Three assigned employees still need reviewer scoring.',
    href: '/evaluations',
    relatedLabel: 'Evaluation period',
    createdAt: '2026-09-01T09:00:00+06:00',
    isRead: true,
  },
  {
    id: 'ntf-14',
    recipientUserId: 'usr-2001',
    type: 'workload_warning',
    title: 'Nadia Rahman is overallocated this week',
    body: 'Planned allocation exceeds weekly capacity for 31 Aug – 6 Sep 2026.',
    href: '/workload',
    relatedLabel: 'Workload',
    createdAt: '2026-08-31T08:00:00+06:00',
    isRead: false,
  },

  /* --- Rezaul Haque (HR) ------------------------------------------------- */
  {
    id: 'ntf-20',
    recipientUserId: 'usr-3001',
    type: 'critical_time',
    title: 'Critical time recorded by Tanvir Ahmed',
    body: 'A day above twelve hours was recorded on 24 August 2026. The Team Lead was notified at the same time.',
    href: '/hr/timesheets',
    relatedLabel: 'Timesheet, 24 Aug 2026',
    createdAt: '2026-08-25T07:30:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-21',
    recipientUserId: 'usr-3001',
    type: 'request_submitted',
    title: 'August 2026 is ready for verification review',
    body: 'Four open exceptions and two unresolved correction requests remain.',
    href: '/hr/timesheets',
    relatedLabel: 'Payroll period',
    createdAt: '2026-09-01T09:00:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-22',
    recipientUserId: 'usr-3001',
    type: 'evaluation_published',
    title: 'H1 2026 evaluation published for Sumaiya Noor',
    body: 'The employee can now see the result.',
    href: '/evaluations/eval-emp-1004',
    relatedLabel: 'Evaluation',
    createdAt: '2026-07-15T15:30:00+06:00',
    isRead: true,
  },

  /* --- Mahmuda Akter (Finance) ------------------------------------------ */
  {
    id: 'ntf-30',
    recipientUserId: 'usr-4001',
    type: 'period_verified',
    title: 'July 2026 has been verified',
    body: 'The payroll period is locked and ready for export.',
    href: '/finance/payroll',
    relatedLabel: 'Payroll period',
    createdAt: '2026-08-04T16:21:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-31',
    recipientUserId: 'usr-4001',
    type: 'export_ready',
    title: 'Payroll summary export is ready',
    body: 'July 2026, Excel. The file expires on 5 September 2026.',
    href: '/finance/payroll',
    relatedLabel: 'Export',
    createdAt: '2026-08-05T10:13:20+06:00',
    isRead: true,
  },

  /*
   * Requisition (`FE-0749`). These reuse `request_submitted` rather than
   * introducing a type of their own: it is already in `ACTION_TYPES`, so a
   * requisition waiting on someone lands in "Action required" without a new
   * grouping rule, and the notification centre needs no change at all.
   *
   * Each recipient matches the stage of its requisition. HR, Finance and the
   * administrator are notified about `req-2` because it has reached them;
   * nobody is notified about it before the Team Lead approved it.
   */
  {
    id: 'ntf-40',
    recipientUserId: 'usr-2001',
    type: 'request_submitted',
    title: 'Requisition waiting for your review',
    body: 'Nadia Rahman raised an in-house requisition for a Dell Latitude charger.',
    href: '/requisitions/req-1',
    relatedLabel: 'Requisition RQ-2026-001',
    createdAt: '2026-09-01T10:12:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-41',
    recipientUserId: 'usr-3001',
    type: 'request_submitted',
    title: 'Requisition reached HR review',
    body: 'Second monitor for Tanvir Ahmed, approved by the Team Lead on 28 August.',
    href: '/requisitions/req-2',
    relatedLabel: 'Requisition RQ-2026-002',
    createdAt: '2026-08-28T09:05:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-42',
    recipientUserId: 'usr-4001',
    type: 'request_submitted',
    title: 'Requisition reached Finance review',
    body: 'Second monitor for Tanvir Ahmed, approved by the Team Lead on 28 August.',
    href: '/requisitions/req-2',
    relatedLabel: 'Requisition RQ-2026-002',
    createdAt: '2026-08-28T09:05:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-43',
    recipientUserId: 'usr-9001',
    type: 'request_submitted',
    title: 'Requisition reached administrator review',
    body: 'Standing desk converter raised by Imran Hossain, a Team Lead, so no Team Lead review applies.',
    href: '/requisitions/req-4',
    relatedLabel: 'Requisition RQ-2026-004',
    createdAt: '2026-08-31T17:25:00+06:00',
    isRead: false,
  },

  /* Conveyance (`FE-0769`), on the same notification type as requisition. */
  {
    id: 'ntf-50',
    recipientUserId: 'usr-2001',
    type: 'request_submitted',
    title: 'Conveyance claim waiting for your review',
    body: 'Nadia Rahman claimed a journey to Meghna Group on 31 August.',
    href: '/conveyance/cnv-1',
    relatedLabel: 'Conveyance CV-2026-001',
    createdAt: '2026-09-01T09:40:00+06:00',
    isRead: false,
  },
  {
    id: 'ntf-51',
    recipientUserId: 'usr-4001',
    type: 'request_submitted',
    title: 'Conveyance claim reached Finance review',
    body: 'Bengal Institute of Technology visit claimed by Tanvir Ahmed, with a receipt attached.',
    href: '/conveyance/cnv-2',
    relatedLabel: 'Conveyance CV-2026-002',
    createdAt: '2026-08-28T08:50:00+06:00',
    isRead: false,
  },

  /* Task review (`FE-0783`), on the same notification type. */
  {
    id: 'ntf-60',
    recipientUserId: 'usr-2001',
    type: 'request_submitted',
    title: 'Task raised for your review',
    body: 'Nadia Rahman raised "Refactor the annotation import script" and cannot record time against it until you approve.',
    href: '/tasks/tsk-10',
    relatedLabel: 'Task review',
    createdAt: '2026-09-01T08:15:00+06:00',
    isRead: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

export interface DocumentFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly scope: 'company' | 'division' | 'project';
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly version: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly uploadedBy: string;
  /** Needs the government-project permission to open. */
  readonly requiresPermission: string | null;
}

export const DOCUMENTS: readonly DocumentFixture[] = [
  {
    id: 'lib-1',
    title: 'Employee handbook',
    description: 'Working hours, leave, conduct and escalation.',
    scope: 'company',
    divisionId: null,
    projectId: null,
    version: '4.2',
    fileName: 'employee-handbook-v4.2.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 2_412_000,
    uploadedAt: '2026-01-15T10:00:00+06:00',
    uploadedBy: 'Rezaul Haque',
    requiresPermission: null,
  },
  {
    id: 'lib-2',
    title: 'Timesheet policy',
    description: 'The 7 active + 1 break rule, classifications and correction workflow.',
    scope: 'company',
    divisionId: null,
    projectId: null,
    version: '3.0',
    fileName: 'timesheet-policy-v3.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 640_000,
    uploadedAt: '2026-01-05T09:00:00+06:00',
    uploadedBy: 'Rezaul Haque',
    requiresPermission: null,
  },
  {
    id: 'lib-3',
    title: 'PowerInAI engineering standards',
    description: 'Code review, testing and release expectations.',
    scope: 'division',
    divisionId: 'pia',
    projectId: null,
    version: '2.1',
    fileName: 'pia-engineering-standards.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 1_120_000,
    uploadedAt: '2026-03-02T11:30:00+06:00',
    uploadedBy: 'Imran Hossain',
    requiresPermission: null,
  },
  {
    id: 'lib-4',
    title: 'Government Projects security protocol',
    description: 'Handling and classification rules for government engagements.',
    scope: 'division',
    divisionId: 'gov',
    projectId: null,
    version: '1.4',
    fileName: 'gov-security-protocol.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 880_000,
    uploadedAt: '2026-02-18T14:00:00+06:00',
    uploadedBy: 'Farhana Islam',
    requiresPermission: 'organization.government.view',
  },
  {
    id: 'lib-5',
    title: 'Vision Platform v2 architecture',
    description: 'Service boundaries and model-serving design.',
    scope: 'project',
    divisionId: 'pia',
    projectId: 'prj-vp2',
    version: '1.0',
    fileName: 'vp2-architecture.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 3_240_000,
    uploadedAt: '2026-04-09T16:45:00+06:00',
    uploadedBy: 'Nadia Rahman',
    requiresPermission: null,
  },
  {
    id: 'lib-6',
    title: 'Cohort 7 curriculum',
    description: 'Session plan, assessments and facilitator notes.',
    scope: 'project',
    divisionId: 'pit',
    projectId: 'prj-alb',
    version: '2.0',
    fileName: 'alb-cohort-7-curriculum.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1_680_000,
    uploadedAt: '2026-06-21T09:20:00+06:00',
    uploadedBy: 'Sadia Karim',
    requiresPermission: null,
  },
  {
    id: 'lib-7',
    title: 'National Records intake schema',
    description: 'Field list and validation rules agreed with the client.',
    scope: 'project',
    divisionId: 'gov',
    projectId: 'prj-nrd',
    version: '0.9',
    fileName: 'nrd-intake-schema.xlsx',
    mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 420_000,
    uploadedAt: '2026-08-12T13:10:00+06:00',
    uploadedBy: 'Nadia Rahman',
    requiresPermission: 'organization.government.view',
  },
];

/* -------------------------------------------------------------------------- */
/* Message threads (prototype)                                                */
/* -------------------------------------------------------------------------- */

export interface MessageFixture {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface MessageThreadFixture {
  readonly id: string;
  readonly kind: 'division' | 'project' | 'direct' | 'task_comment';
  readonly title: string;
  readonly subtitle: string;
  readonly participantUserIds: readonly string[];
  readonly unreadCount: number;
}

export const MESSAGE_THREADS: readonly MessageThreadFixture[] = [
  {
    id: 'thr-1',
    kind: 'division',
    title: 'PowerInAI',
    subtitle: 'Division channel',
    participantUserIds: ['usr-1001', 'usr-2001', 'usr-1003'],
    unreadCount: 2,
  },
  {
    id: 'thr-2',
    kind: 'project',
    title: 'Vision Platform v2',
    subtitle: 'PIA-VP2 project channel',
    participantUserIds: ['usr-1001', 'usr-1002', 'usr-2001'],
    unreadCount: 0,
  },
  {
    id: 'thr-3',
    kind: 'direct',
    title: 'Imran Hossain',
    subtitle: 'Direct message',
    participantUserIds: ['usr-1001', 'usr-2001'],
    unreadCount: 1,
  },
  {
    id: 'thr-4',
    kind: 'task_comment',
    title: 'Model evaluation harness',
    subtitle: 'Task comments',
    participantUserIds: ['usr-1001', 'usr-2001'],
    unreadCount: 0,
  },
];

export const MESSAGES: readonly MessageFixture[] = [
  { id: 'msg-1', threadId: 'thr-1', authorUserId: 'usr-2001', authorName: 'Imran Hossain', body: 'Reminder: September timesheets close on the 30th.', createdAt: '2026-09-01T09:10:00+06:00' },
  { id: 'msg-2', threadId: 'thr-1', authorUserId: 'usr-1003', authorName: 'Sadia Karim', body: 'Cohort 7 wrapped up. Materials are in the library.', createdAt: '2026-09-01T11:40:00+06:00' },
  { id: 'msg-3', threadId: 'thr-2', authorUserId: 'usr-1002', authorName: 'Tanvir Ahmed', body: 'Latency profiling is done; results are in the benchmark sheet.', createdAt: '2026-08-31T16:20:00+06:00' },
  { id: 'msg-4', threadId: 'thr-2', authorUserId: 'usr-1001', authorName: 'Nadia Rahman', body: 'Thanks. I will fold that into the harness report.', createdAt: '2026-08-31T17:02:00+06:00' },
  { id: 'msg-5', threadId: 'thr-3', authorUserId: 'usr-2001', authorName: 'Imran Hossain', body: 'Any progress on the staging credentials for the portal audit?', createdAt: '2026-09-02T08:45:00+06:00' },
  { id: 'msg-6', threadId: 'thr-4', authorUserId: 'usr-2001', authorName: 'Imran Hossain', body: 'Can you document the metric definitions before closing this?', createdAt: '2026-08-28T10:05:00+06:00' },
  { id: 'msg-7', threadId: 'thr-4', authorUserId: 'usr-1001', authorName: 'Nadia Rahman', body: 'Yes, adding them to the results write-up.', createdAt: '2026-08-28T10:31:00+06:00' },
];

/* -------------------------------------------------------------------------- */
/* Audit events                                                               */
/* -------------------------------------------------------------------------- */

export interface AuditEventFixture {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorUserId: string;
  readonly actorName: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly resourceType: string;
  readonly resourceLabel: string;
  readonly scopeDivisionId: string | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly before: Readonly<Record<string, string>> | null;
  readonly after: Readonly<Record<string, string>> | null;
  /** Values are withheld without this permission; the event still shows. */
  readonly valuePermission: string | null;
}

export const AUDIT_EVENTS: readonly AuditEventFixture[] = [
  {
    id: 'aud-e1',
    occurredAt: '2026-08-04T16:20:00+06:00',
    actorUserId: 'usr-3001',
    actorName: 'Rezaul Haque',
    action: 'period.verify',
    actionLabel: 'Payroll period verified',
    resourceType: 'timesheet_period',
    resourceLabel: 'July 2026',
    scopeDivisionId: null,
    reason: null,
    correlationId: 'cor-8f21',
    before: { status: 'Pending verification' },
    after: { status: 'Verified and locked' },
    valuePermission: null,
  },
  {
    id: 'aud-e2',
    occurredAt: '2026-08-06T11:10:00+06:00',
    actorUserId: 'usr-3001',
    actorName: 'Rezaul Haque',
    action: 'period.amend',
    actionLabel: 'Verified period amended',
    resourceType: 'time_entry',
    resourceLabel: 'Time entry, 23 Jul 2026',
    scopeDivisionId: 'gov',
    reason: 'Division corrected after the client confirmed the work was Government Projects.',
    correlationId: 'cor-9a04',
    before: { division: 'PowerInAI', active: '3:00' },
    after: { division: 'Government Projects', active: '3:00' },
    valuePermission: 'organization.government.view',
  },
  {
    id: 'aud-e3',
    occurredAt: '2026-08-27T10:12:00+06:00',
    actorUserId: 'usr-2001',
    actorName: 'Imran Hossain',
    action: 'request.decide',
    actionLabel: 'WFH request approved',
    resourceType: 'wfh_request',
    resourceLabel: 'WFH request, 28 Aug 2026',
    scopeDivisionId: 'pia',
    reason: null,
    correlationId: 'cor-3c77',
    before: { state: 'Pending' },
    after: { state: 'Approved' },
    valuePermission: null,
  },
  {
    id: 'aud-e4',
    occurredAt: '2026-01-12T11:31:00+06:00',
    actorUserId: 'usr-3001',
    actorName: 'Rezaul Haque',
    action: 'document.upload',
    actionLabel: 'Document uploaded',
    resourceType: 'document',
    resourceLabel: 'Salary revision letter',
    scopeDivisionId: 'pia',
    reason: null,
    correlationId: 'cor-1b55',
    before: null,
    after: { title: 'Salary revision letter', category: 'Compensation' },
    valuePermission: 'finance.cost.view',
  },
  {
    id: 'aud-e5',
    occurredAt: '2026-07-01T09:00:00+06:00',
    actorUserId: 'usr-3001',
    actorName: 'Rezaul Haque',
    action: 'assignment.create',
    actionLabel: 'Temporary assignment created',
    resourceType: 'assignment',
    resourceLabel: 'Sumaiya Noor, Government Projects',
    scopeDivisionId: 'gov',
    reason: 'Records digitisation surge',
    correlationId: 'cor-7e12',
    before: null,
    after: { division: 'Government Projects', allocation: '25%', endDate: '31 Aug 2026' },
    valuePermission: 'organization.government.view',
  },
  {
    id: 'aud-e6',
    occurredAt: '2026-08-31T17:05:00+06:00',
    actorUserId: 'usr-system',
    actorName: 'System',
    action: 'assignment.expire',
    actionLabel: 'Assignment expired',
    resourceType: 'assignment',
    resourceLabel: 'Sumaiya Noor, Government Projects',
    scopeDivisionId: 'gov',
    reason: 'End date reached',
    correlationId: 'cor-7e13',
    before: { isActive: 'true' },
    after: { isActive: 'false' },
    valuePermission: 'organization.government.view',
  },
  {
    id: 'aud-e7',
    occurredAt: '2026-09-01T08:15:00+06:00',
    actorUserId: 'usr-9001',
    actorName: 'Arif Mahmud',
    action: 'permission.grant',
    actionLabel: 'Sensitive permission granted',
    resourceType: 'user',
    resourceLabel: 'Mahmuda Akter',
    scopeDivisionId: null,
    reason: 'Finance Manager appointment',
    correlationId: 'cor-5d90',
    before: { permissions: 'reporting.export.protected' },
    after: { permissions: 'reporting.export.protected, finance.cost.view' },
    valuePermission: null,
  },
  {
    id: 'aud-e8',
    occurredAt: '2026-08-14T09:02:00+06:00',
    actorUserId: 'usr-system',
    actorName: 'System',
    action: 'account.lock',
    actionLabel: 'Account locked',
    resourceType: 'user',
    resourceLabel: 'Rafiq Chowdhury',
    scopeDivisionId: 'cjg',
    reason: 'Five consecutive failed sign-in attempts',
    correlationId: 'cor-2a48',
    before: { status: 'Active' },
    after: { status: 'Locked' },
    valuePermission: null,
  },
];
