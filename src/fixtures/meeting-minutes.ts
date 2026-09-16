/**
 * Meeting Minutes seed data (`FE-1110`).
 *
 * A starter set so the list is demonstrable: one minute in each processing
 * status, a government-project minute only some viewers may see, and an
 * archived minute. `FE-1130` extends it with the full case list (no valid
 * tasks, unassigned tasks, duplicates, and so on).
 *
 * Clients are derived from the free-text `Project.client` labels already in
 * `./index.ts`, each keeping its old label in `legacyLabels`, so time reports
 * that still group by label reconcile with the new records.
 */

import type { ActorRef } from '@/contracts/domain';
import type { Client, MeetingMinute, ProjectClientLink } from '@/contracts/meeting-minutes';

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
      '<p>Reviewed sprint 14 with Meghna Group. The client accepted the search redesign and asked for an export to PDF before the October release.</p>',
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
];
