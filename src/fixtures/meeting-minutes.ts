/**
 * Meeting Minutes seed data (`FE-1110`, completed by `FE-1130`).
 *
 * Every case the module has to show has a minute here, so each can be seen in
 * the demo and asserted in tests:
 *
 * | Case (`FE-1130`)                 | Minute     | Who sees it                          |
 * |----------------------------------|------------|--------------------------------------|
 * | No AI requested                  | `min-1002` | pit readers                          |
 * | Pending                          | `min-1003` | government-project readers only      |
 * | Processing                       | `min-1005` | pia readers                          |
 * | Processed, mentioned assignee    | `min-1001` | pia readers (`tsk-15`, `tsk-16`)     |
 * | Failed, retryable                | `min-1004` | wcf readers                          |
 * | Processed, no valid tasks        | `min-1007` | pit readers — also the long content  |
 * | Unassigned tasks, duplicate      | `min-1008` | pia readers (`tsk-17`–`tsk-19`)      |
 * | Inaccessible sensitive project   | `min-1009` | government-project readers only      |
 * | Archived                         | `min-1006` | pia readers, with Include archived   |
 *
 * `min-1007` carries a very long title and minute, including an unbroken
 * address, for the responsive checks (`FE-1133`).
 *
 * Clients are derived from the free-text `Project.client` labels already in
 * `./index.ts`, each keeping its old label in `legacyLabels`, so time reports
 * that still group by label reconcile with the new records.
 */

import type { ActorRef } from '@/contracts/domain';
import type {
  Client,
  ExtractedDecision,
  GeneratedTaskLink,
  MeetingMinute,
  MeetingSummary,
  ProjectClientLink,
} from '@/contracts/meeting-minutes';

const SEEDED_AT = '2026-08-01T09:00:00+06:00';
const SYSTEM: ActorRef = { userId: 'usr-9001', displayName: 'Arif Mahmud' };

function client(id: string, name: string): Client {
  return {
    id,
    name,
    status: 'active',
    legacyLabels: [name],
    createdAt: SEEDED_AT,
    createdBy: SYSTEM,
    updatedAt: SEEDED_AT,
    updatedBy: SYSTEM,
  };
}

export const CLIENTS: readonly Client[] = [
  client('cli-meghna', 'Meghna Group'),
  client('cli-bit', 'Bengal Institute of Technology'),
  client('cli-mopa', 'Ministry of Public Administration'),
  client('cli-westbridge', 'Westbridge Capital'),
];

/** `prj-mip` has no recorded client, so it cannot be chosen for a minute. */
export const PROJECT_CLIENT_LINKS: readonly ProjectClientLink[] = [
  { state: 'linked', projectId: 'prj-vp2', clientId: 'cli-meghna' },
  { state: 'linked', projectId: 'prj-lsm', clientId: 'cli-meghna' },
  { state: 'linked', projectId: 'prj-alb', clientId: 'cli-bit' },
  { state: 'linked', projectId: 'prj-nrd', clientId: 'cli-mopa' },
  { state: 'linked', projectId: 'prj-wpr', clientId: 'cli-westbridge' },
  { state: 'none', projectId: 'prj-mip' },
];

const IMRAN: ActorRef = { userId: 'usr-2001', displayName: 'Imran Hossain' };
const REZAUL: ActorRef = { userId: 'usr-3001', displayName: 'Rezaul Haque' };
const ARIF: ActorRef = { userId: 'usr-9001', displayName: 'Arif Mahmud' };
const FARHANA: ActorRef = { userId: 'usr-2002', displayName: 'Farhana Islam' };

function minute(
  fields: Pick<
    MeetingMinute,
    'id' | 'title' | 'clientId' | 'projectId' | 'divisionId' | 'content' | 'processWithAi' | 'processingStatus'
  > & {
    readonly creator: ActorRef;
    readonly createdAt: string;
    readonly processedAt?: string;
    readonly processingError?: MeetingMinute['processingError'];
    readonly latestAttemptId?: string;
    readonly archivedAt?: string;
    readonly version?: number;
  },
): MeetingMinute {
  const { creator, createdAt, ...rest } = fields;
  return {
    id: rest.id,
    title: rest.title,
    clientId: rest.clientId,
    projectId: rest.projectId,
    divisionId: rest.divisionId,
    content: rest.content,
    processWithAi: rest.processWithAi,
    processingStatus: rest.processingStatus,
    processingError: rest.processingError ?? null,
    processedAt: rest.processedAt ?? null,
    latestAttemptId: rest.latestAttemptId ?? null,
    archivedAt: rest.archivedAt ?? null,
    archivedBy: rest.archivedAt ? creator : null,
    version: rest.version ?? 1,
    createdAt,
    createdBy: creator,
    updatedAt: rest.archivedAt ?? rest.processedAt ?? createdAt,
    updatedBy: creator,
  };
}

export const MEETING_MINUTES: readonly MeetingMinute[] = [
  minute({
    id: 'min-1001',
    title: 'Vision Platform v2 sprint review',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    divisionId: 'pia',
    content:
      '<p>Reviewed sprint 14 with Meghna Group. The client accepted the search redesign and asked for an export to PDF before the October release. Nadia will build the PDF export.</p>',
    processWithAi: true,
    processingStatus: 'processed',
    creator: IMRAN,
    createdAt: '2026-09-01T11:00:00+06:00',
    processedAt: '2026-09-01T11:03:00+06:00',
    latestAttemptId: 'att-1001-1',
    version: 2,
  }),
  minute({
    id: 'min-1002',
    title: 'Bootcamp curriculum sign-off',
    clientId: 'cli-bit',
    projectId: 'prj-alb',
    divisionId: 'pit',
    content:
      '<p>Bengal Institute of Technology signed off modules one to four. Module five moves to the November cohort.</p>',
    processWithAi: false,
    processingStatus: 'not_processed',
    creator: REZAUL,
    createdAt: '2026-08-31T15:30:00+06:00',
  }),
  minute({
    id: 'min-1003',
    title: 'Records digitisation steering committee',
    clientId: 'cli-mopa',
    projectId: 'prj-nrd',
    divisionId: 'gov',
    content:
      '<p>Steering committee agreed the scanning backlog priorities for the next quarter.</p>',
    processWithAi: true,
    processingStatus: 'pending',
    creator: ARIF,
    createdAt: '2026-09-02T10:15:00+06:00',
    latestAttemptId: 'att-1003-1',
  }),
  minute({
    id: 'min-1004',
    title: 'Westbridge portal go-live readiness',
    clientId: 'cli-westbridge',
    projectId: 'prj-wpr',
    divisionId: 'wcf',
    content:
      '<p>Go-live readiness walkthrough. Two blocking issues remain in single sign-on; the client will confirm a date once they are closed.</p>',
    processWithAi: true,
    processingStatus: 'failed',
    processingError: {
      code: 'provider_timeout',
      occurredAt: '2026-08-28T14:04:00+06:00',
      retryable: true,
    },
    creator: REZAUL,
    createdAt: '2026-08-28T14:00:00+06:00',
    latestAttemptId: 'att-1004-1',
  }),
  minute({
    id: 'min-1005',
    title: 'Vision Platform v2 client demo',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    divisionId: 'pia',
    content: '<p>Demonstrated the analytics dashboard to the Meghna Group leadership team.</p>',
    processWithAi: true,
    processingStatus: 'processing',
    creator: ARIF,
    createdAt: '2026-09-02T09:40:00+06:00',
    latestAttemptId: 'att-1005-1',
  }),
  minute({
    id: 'min-1006',
    title: 'Legacy site handover',
    clientId: 'cli-meghna',
    projectId: 'prj-lsm',
    divisionId: 'pia',
    content: '<p>Handed the legacy site over to the client’s in-house team.</p>',
    processWithAi: false,
    processingStatus: 'not_processed',
    creator: IMRAN,
    createdAt: '2026-08-12T16:00:00+06:00',
    archivedAt: '2026-08-20T10:00:00+06:00',
    version: 2,
  }),
  minute({
    id: 'min-1007',
    // Deliberately long, and the minute includes an unbroken address, so the
    // list, the heading and the content are checked where they must wrap.
    title:
      'Bootcamp cohort planning with Bengal Institute of Technology: venues, instructor rota, assessment dates and the November scholarship shortlist',
    clientId: 'cli-bit',
    projectId: 'prj-alb',
    divisionId: 'pit',
    content: [
      '<p>Bengal Institute of Technology confirmed the November cohort will run at the Dhaka campus, with the Chattogram satellite as the fallback venue if enrolment passes sixty.</p>',
      '<p>The instructor rota stays as agreed for modules one to four. Module five moves to the second fortnight so the new lab is ready, and the assessment dates follow it.</p>',
      '<p>The scholarship shortlist is published at https://bit.example.edu.bd/scholarships/november-cohort/shortlist-final-version-approved-by-the-selection-committee and is not ours to change.</p>',
      '<p>No follow-up work was agreed for our team: every item is either already scheduled or belongs to the institute.</p>',
    ].join(''),
    processWithAi: true,
    processingStatus: 'processed',
    creator: REZAUL,
    createdAt: '2026-08-25T10:00:00+06:00',
    processedAt: '2026-08-25T10:04:00+06:00',
    latestAttemptId: 'att-1007-1',
  }),
  minute({
    id: 'min-1008',
    title: 'Vision Platform v2 support rota',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    divisionId: 'pia',
    content:
      '<p>Meghna Group asked for weekend support during the October launch. Jamal from their side will join the rota. We need someone to own the on-call runbook, and someone should also keep the on-call runbook up to date.</p>',
    processWithAi: true,
    processingStatus: 'processed',
    creator: IMRAN,
    createdAt: '2026-09-01T15:00:00+06:00',
    processedAt: '2026-09-01T15:03:00+06:00',
    latestAttemptId: 'att-1008-1',
  }),
  minute({
    id: 'min-1009',
    title: 'Records digitisation vendor review',
    clientId: 'cli-mopa',
    projectId: 'prj-nrd',
    divisionId: 'gov',
    content:
      '<p>Reviewed the scanning vendor against the intake targets. Nadia will draft the quality checklist for intake batches.</p>',
    processWithAi: true,
    processingStatus: 'processed',
    creator: FARHANA,
    createdAt: '2026-08-30T11:00:00+06:00',
    processedAt: '2026-08-30T11:02:00+06:00',
    latestAttemptId: 'att-1009-1',
  }),
];

/* ------------------------------------------------------------------------- */
/* AI interpretation (`FE-1122`)                                             */
/* ------------------------------------------------------------------------- */

/**
 * What the successful run on `min-1001` produced. Only a `processed` minute
 * has one; `min-1005` is still processing and `min-1004` failed, so neither
 * does. `FE-1130` adds the fuller case list — no valid tasks, duplicates, and
 * so on.
 *
 * Plain text, as a model returns it. It is never rendered as markup.
 */
export const MEETING_SUMMARIES: readonly MeetingSummary[] = [
  {
    minuteId: 'min-1001',
    attemptId: 'att-1001-1',
    text: 'Meghna Group accepted the search redesign delivered in sprint 14 and asked for export to PDF before the October release.',
  },
  {
    minuteId: 'min-1007',
    attemptId: 'att-1007-1',
    text: 'The November cohort runs at the Dhaka campus, module five moves to the second fortnight, and no follow-up work falls to our team.',
  },
  {
    minuteId: 'min-1008',
    attemptId: 'att-1008-1',
    text: 'Meghna Group asked for weekend support during the October launch, with their own contact on the rota and an owner for the on-call runbook.',
  },
  {
    minuteId: 'min-1009',
    attemptId: 'att-1009-1',
    text: 'The scanning vendor was reviewed against intake targets, and a quality checklist for intake batches is to be drafted.',
  },
];

export const EXTRACTED_DECISIONS: readonly ExtractedDecision[] = [
  {
    id: 'dec-1001-1',
    minuteId: 'min-1001',
    attemptId: 'att-1001-1',
    position: 1,
    text: 'Accept the search redesign as delivered in sprint 14.',
  },
  {
    id: 'dec-1001-2',
    minuteId: 'min-1001',
    attemptId: 'att-1001-1',
    position: 2,
    text: 'Add export to PDF to the October release scope.',
  },
  { id: 'dec-1007-1', minuteId: 'min-1007', attemptId: 'att-1007-1', position: 1, text: 'Run the November cohort at the Dhaka campus.' },
  { id: 'dec-1007-2', minuteId: 'min-1007', attemptId: 'att-1007-1', position: 2, text: 'Move module five to the second fortnight.' },
  { id: 'dec-1008-1', minuteId: 'min-1008', attemptId: 'att-1008-1', position: 1, text: 'Provide weekend support during the October launch.' },
  { id: 'dec-1009-1', minuteId: 'min-1009', attemptId: 'att-1009-1', position: 1, text: 'Keep the current scanning vendor.' },
];

/**
 * Proposals a run dropped because they repeated a task it had already created
 * (`REQ-MTG-011`), by attempt. `min-1008` asked twice for the on-call runbook
 * to be owned; one task was created and the repeat was not.
 */
export const DUPLICATE_PROPOSALS: Readonly<Record<string, number>> = {
  'att-1008-1': 1,
};

/* ------------------------------------------------------------------------- */
/* Generated-task links (`FE-1123`)                                          */
/* ------------------------------------------------------------------------- */

/**
 * The immutable links from `min-1001`'s successful run to the two tasks it
 * created (`tsk-15`, `tsk-16` in `./index.ts`).
 *
 * They exercise both named match outcomes. `tsk-15` went to the person the
 * minute names. `tsk-16` was matched on project membership and workload, and
 * its assignee, Tanvir Ahmed, cannot read `pia` minutes — so his task page is
 * where the *restricted* source-minute view is seen (`AC-MTG-010`).
 *
 * The unassigned outcome (`REQ-MTG-014`) is seeded on `min-1008` below, now
 * that the core `Task` allows no assignee (`FE-1130`).
 */
export const GENERATED_TASK_LINKS: readonly GeneratedTaskLink[] = [
  {
    id: 'lnk-1001-1',
    taskId: 'tsk-15',
    minuteId: 'min-1001',
    attemptId: 'att-1001-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: IMRAN,
    matchOutcome: { kind: 'mentioned_assignee', employeeId: 'emp-1001' },
    position: 1,
    createdAt: '2026-09-01T11:03:00+06:00',
  },
  {
    id: 'lnk-1001-2',
    taskId: 'tsk-16',
    minuteId: 'min-1001',
    attemptId: 'att-1001-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: IMRAN,
    matchOutcome: { kind: 'matched', employeeId: 'emp-1002', basis: ['project_membership', 'workload'] },
    position: 2,
    createdAt: '2026-09-01T11:03:00+06:00',
  },
  // `min-1008`: two unassigned, one matched.
  {
    id: 'lnk-1008-1',
    taskId: 'tsk-17',
    minuteId: 'min-1008',
    attemptId: 'att-1008-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: IMRAN,
    matchOutcome: { kind: 'unassigned', reason: 'no_eligible_candidate' },
    position: 1,
    createdAt: '2026-09-01T15:03:00+06:00',
  },
  {
    id: 'lnk-1008-2',
    taskId: 'tsk-18',
    minuteId: 'min-1008',
    attemptId: 'att-1008-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: IMRAN,
    // The minute names Jamal, the client's contact: not someone matching may
    // assign, and the outcome deliberately does not say why (`UnassignedReason`).
    matchOutcome: { kind: 'unassigned', reason: 'mentioned_person_ineligible' },
    position: 2,
    createdAt: '2026-09-01T15:03:00+06:00',
  },
  {
    id: 'lnk-1008-3',
    taskId: 'tsk-19',
    minuteId: 'min-1008',
    attemptId: 'att-1008-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: IMRAN,
    matchOutcome: { kind: 'matched', employeeId: 'emp-1003', basis: ['department', 'availability'] },
    position: 3,
    createdAt: '2026-09-01T15:03:00+06:00',
  },
  // `min-1009`: a government-project task, named in the minute.
  {
    id: 'lnk-1009-1',
    taskId: 'tsk-20',
    minuteId: 'min-1009',
    attemptId: 'att-1009-1',
    origin: 'meeting_minute_ai',
    generatedBy: 'system',
    minuteCreator: FARHANA,
    matchOutcome: { kind: 'mentioned_assignee', employeeId: 'emp-1001' },
    position: 1,
    createdAt: '2026-08-30T11:02:00+06:00',
  },
];
