import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEFAULT_MEETING_MINUTE_SORT,
  GENERATED_TASK_INITIAL_STATUS,
  MEETING_MINUTE_OPERATION_FAILURES,
  MEETING_MINUTE_UNIVERSAL_FAILURES,
  MINUTE_PROCESSING_STATUSES,
  MINUTE_PROCESSING_TRANSITIONS,
  SAFE_PROCESSING_ERROR_MESSAGE,
  TEAM_MATCH_BASIS_ORDER,
  canChangeProcessingStatus,
  findProtectedMeetingMinuteFields,
  isProcessingInFlight,
  type ArchiveMeetingMinuteInput,
  type CreateMeetingMinuteInput,
  type GeneratedTaskView,
  type MeetingMinuteDetailView,
  type MeetingMinuteEditContextView,
  type MeetingMinuteListView,
  type MeetingMinuteSummaryView,
  type MeetingMinutesOperation,
  type MeetingMinutesService,
  type MeetingMinutesSuccessData,
  type MinuteProcessingSnapshotView,
  type ProtectedKeysIn,
  type ProcessingAttempt,
  type RequestProcessingInput,
  type RetryProcessingInput,
  type SafeProcessingError,
  type TaskSourceMinuteView,
  type TeamMatchOutcome,
  type UpdateMeetingMinuteInput,
} from './meeting-minutes';
import { QUERY_PARAM_KEYS } from './query';
import type { Result } from './results';

describe('meeting-minute processing status (FE-1103)', () => {
  it('stores the legal moves as data', () => {
    expect(MINUTE_PROCESSING_TRANSITIONS.map(({ from, to }) => `${from}:${to}`)).toEqual([
      'not_processed:pending',
      'pending:processing',
      'pending:failed',
      'processing:processed',
      'processing:failed',
      'failed:pending',
    ]);
  });

  it('keeps Processed terminal so a minute is never processed twice', () => {
    for (const to of MINUTE_PROCESSING_STATUSES) {
      expect(canChangeProcessingStatus('processed', to)).toBe(false);
    }
  });

  it('never returns to Not Processed and never skips Pending', () => {
    for (const from of MINUTE_PROCESSING_STATUSES) {
      expect(canChangeProcessingStatus(from, 'not_processed')).toBe(false);
    }
    expect(canChangeProcessingStatus('not_processed', 'processing')).toBe(false);
    expect(canChangeProcessingStatus('failed', 'processing')).toBe(false);
  });

  it('allows retry only from Failed', () => {
    expect(canChangeProcessingStatus('failed', 'pending')).toBe(true);
    expect(canChangeProcessingStatus('processing', 'pending')).toBe(false);
  });

  it('treats only Pending and Processing as in flight', () => {
    expect(MINUTE_PROCESSING_STATUSES.filter(isProcessingInFlight)).toEqual(['pending', 'processing']);
  });
});

describe('safe processing error (FE-1103)', () => {
  it('has no free-text field a provider message could be copied into', () => {
    expectTypeOf<SafeProcessingError>().toEqualTypeOf<{
      readonly code: SafeProcessingError['code'];
      readonly occurredAt: string;
      readonly retryable: boolean;
    }>();
  });

  it('gives every code fixed wording that reassures the minute was saved', () => {
    for (const message of Object.values(SAFE_PROCESSING_ERROR_MESSAGE)) {
      expect(message).toMatch(/Your meeting minute was saved\.$/);
      expect(message).not.toMatch(/[{}<>]|\$\{/);
    }
  });
});

describe('generated tasks and matching (FE-1103)', () => {
  it('starts generated tasks in the ordinary Pending status', () => {
    expect(GENERATED_TASK_INITIAL_STATUS).toBe('pending');
  });

  it('lists match criteria in the order REQ-MTG-013 applies them', () => {
    expect(TEAM_MATCH_BASIS_ORDER).toEqual([
      'project_membership',
      'department',
      'role',
      'availability',
      'workload',
      'active_status',
    ]);
  });

  it('names no employee when nobody was assigned', () => {
    type Unassigned = Extract<TeamMatchOutcome, { kind: 'unassigned' }>;
    expectTypeOf<Unassigned>().not.toHaveProperty('employeeId');
  });

  it('carries nothing identifying on restricted task and source-minute variants', () => {
    type RestrictedTask = Extract<GeneratedTaskView, { access: 'restricted' }>;
    expectTypeOf<RestrictedTask>().not.toHaveProperty('title');
    expectTypeOf<RestrictedTask>().not.toHaveProperty('href');
    expectTypeOf<RestrictedTask>().not.toHaveProperty('assigneeName');

    type RestrictedSource = Extract<TaskSourceMinuteView, { access: 'restricted' }>;
    expectTypeOf<RestrictedSource>().toEqualTypeOf<{ readonly access: 'restricted' }>();
  });

  it('keeps protected machinery and content out of attempts and list rows (FE-1103)', () => {
    expectTypeOf<ProcessingAttempt>().not.toHaveProperty('idempotencyKey');
    expectTypeOf<ProcessingAttempt>().not.toHaveProperty('rawResponse');
    expectTypeOf<ProcessingAttempt>().not.toHaveProperty('model');
    expectTypeOf<MeetingMinuteSummaryView>().not.toHaveProperty('content');
    expectTypeOf<MeetingMinuteSummaryView>().not.toHaveProperty('generatedTaskCount');
  });
});

describe('Meeting Minutes service contract (FE-1104)', () => {
  const OPERATIONS = Object.keys(MEETING_MINUTE_OPERATION_FAILURES) as MeetingMinutesOperation[];
  const READ_BY_ID: readonly MeetingMinutesOperation[] = [
    'get',
    'getProcessingSnapshot',
    'openGeneratedTask',
    'getTaskSourceMinute',
  ];
  const WRITES: readonly MeetingMinutesOperation[] = [
    'create',
    'update',
    'archive',
    'requestProcessing',
    'retryProcessing',
  ];

  it('covers all thirteen operations the task names', () => {
    expect(OPERATIONS).toEqual([
      'list',
      'get',
      'createContext',
      'listProjectOptions',
      'create',
      'editContext',
      'update',
      'archive',
      'requestProcessing',
      'retryProcessing',
      'getProcessingSnapshot',
      'openGeneratedTask',
      'getTaskSourceMinute',
    ]);
  });

  it('hides existence on every read by id: not found, never permission denied', () => {
    for (const operation of READ_BY_ID) {
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).toContain('not_found');
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).not.toContain('permission_denied');
    }
  });

  it('lets every write refuse the read-only roles (Employee, Management/View-Only) with permission denied', () => {
    for (const operation of WRITES) {
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).toContain('permission_denied');
    }
  });

  it('never lists not found for the list, so a filter cannot probe for records', () => {
    expect(MEETING_MINUTE_OPERATION_FAILURES.list).not.toContain('not_found');
    expect(MEETING_MINUTE_OPERATION_FAILURES.list).not.toContain('permission_denied');
  });

  it('treats every change to an existing minute as a possible conflict', () => {
    for (const operation of ['update', 'archive', 'requestProcessing', 'retryProcessing'] as const) {
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).toContain('conflict');
    }
  });

  it('lists unauthenticated and error once, not per operation', () => {
    expect(MEETING_MINUTE_UNIVERSAL_FAILURES).toEqual(['unauthenticated', 'error']);
    for (const operation of OPERATIONS) {
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).not.toContain('unauthenticated');
      expect(MEETING_MINUTE_OPERATION_FAILURES[operation]).not.toContain('error');
    }
  });

  it('makes creates and processing requests idempotent and edits version-checked', () => {
    expectTypeOf<CreateMeetingMinuteInput>().toHaveProperty('idempotencyKey');
    expectTypeOf<RequestProcessingInput>().toHaveProperty('idempotencyKey');
    expectTypeOf<RetryProcessingInput>().toHaveProperty('idempotencyKey');
    expectTypeOf<ArchiveMeetingMinuteInput>().toHaveProperty('expectedVersion');
    expectTypeOf<UpdateMeetingMinuteInput>().toHaveProperty('expectedVersion');
  });

  it('never lets an edit start, repeat or cancel AI processing', () => {
    expectTypeOf<UpdateMeetingMinuteInput>().not.toHaveProperty('processWithAi');
  });

  it('returns Result values from every operation', () => {
    type Returns = ReturnType<MeetingMinutesService[MeetingMinutesOperation]>;
    expectTypeOf<Awaited<Returns>['status']>().toEqualTypeOf<Result<unknown>['status']>();
  });

  it('names URL keys for the new filters without colliding with existing ones', () => {
    expect(QUERY_PARAM_KEYS.client).toBe('client');
    expect(QUERY_PARAM_KEYS.processingStatus).toBe('processing');
    expect(QUERY_PARAM_KEYS.includeArchived).toBe('archived');
    const values = Object.values(QUERY_PARAM_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('sorts newest first by default', () => {
    expect(DEFAULT_MEETING_MINUTE_SORT).toEqual({ field: 'createdAt', direction: 'desc' });
  });
});

describe('protected data never enters ordinary models (FE-1105)', () => {
  it('finds no protected field or unreviewed count in any view model', () => {
    expectTypeOf<ProtectedKeysIn<MeetingMinuteSummaryView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<MeetingMinuteListView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<MeetingMinuteDetailView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<GeneratedTaskView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<TaskSourceMinuteView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<MinuteProcessingSnapshotView>>().toBeNever();
    expectTypeOf<ProtectedKeysIn<MeetingMinuteEditContextView>>().toBeNever();
  });

  it('finds none in the success data of any service operation', () => {
    expectTypeOf<ProtectedKeysIn<MeetingMinutesSuccessData<MeetingMinutesOperation>>>().toBeNever();
  });

  it('recognises the protected names the guard exists for', () => {
    expectTypeOf<ProtectedKeysIn<{ rawResponse: string }>>().toEqualTypeOf<'rawResponse'>();
    expectTypeOf<ProtectedKeysIn<{ a: { systemPrompt: string } }>>().toEqualTypeOf<'systemPrompt'>();
    expectTypeOf<ProtectedKeysIn<{ items: { matchScore: number }[] }>>().toEqualTypeOf<'matchScore'>();
    expectTypeOf<ProtectedKeysIn<{ modelId: string }>>().toEqualTypeOf<'modelId'>();
    expectTypeOf<ProtectedKeysIn<{ hiddenMinuteCount: number }>>().toEqualTypeOf<'hiddenMinuteCount'>();
    expectTypeOf<ProtectedKeysIn<{ totalItems: number; attemptCount: number }>>().toBeNever();
  });

  const cleanDetail: MeetingMinuteDetailView = {
    id: 'min-1',
    title: 'Vision Platform kickoff',
    client: { id: 'client-1', name: 'Acme Health' },
    project: { id: 'prj-1', name: 'Vision Platform v2' },
    content: '<p>Agreed the release scope.</p>',
    creatorName: 'Imran Hossain',
    createdAt: '2026-09-02T10:00:00+06:00',
    createdAtLabel: '2 Sep 2026, 10:00',
    updatedAtLabel: '2 Sep 2026, 10:00',
    aiRequested: true,
    aiRequestedLabel: 'Yes',
    processing: {
      status: 'processed',
      label: 'Processed',
      processedAtLabel: '2 Sep 2026, 10:02',
      error: null,
      attemptCount: 1,
    },
    interpretation: {
      summary: 'Release scope agreed.',
      decisions: [{ id: 'dec-1', position: 1, text: 'Ship in October.' }],
    },
    generatedTasks: [
      {
        access: 'visible',
        linkId: 'lnk-1',
        taskId: 'tsk-1',
        position: 1,
        title: 'Draft release plan',
        assigneeName: null,
        priority: 'high',
        priorityLabel: 'High',
        dueDate: null,
        dueDateLabel: 'No due date',
        status: 'pending',
        statusLabel: 'Pending',
        matchOutcome: { kind: 'unassigned', label: 'No eligible team member' },
        reassignedSinceGeneration: false,
        href: '/tasks/tsk-1',
      },
      { access: 'restricted', linkId: 'lnk-2', position: 2 },
    ],
    archived: null,
    version: 3,
    actions: { canEdit: true, canArchive: true, canRequestProcessing: false, canRetry: false },
    editHref: '/meeting-minutes/min-1/edit',
  };

  it('passes a clean detail payload', () => {
    expect(findProtectedMeetingMinuteFields(cleanDetail)).toEqual([]);
  });

  it('reports protected fields an implementation spreads in, with their paths', () => {
    const leaky = {
      ...cleanDetail,
      raw_ai_json: '{"tasks":[]}',
      processing: { ...cleanDetail.processing, providerError: 'upstream 500', correlationId: 'c-1' },
      generatedTasks: [{ ...cleanDetail.generatedTasks[0], matchScore: 0.82, candidates: [] }],
      interpretation: { ...cleanDetail.interpretation, promptTokens: 812, modelName: 'x' },
    };
    expect(findProtectedMeetingMinuteFields(leaky)).toEqual([
      'processing.providerError',
      'processing.correlationId',
      'interpretation.promptTokens',
      'interpretation.modelName',
      'generatedTasks[0].matchScore',
      'generatedTasks[0].candidates',
      'raw_ai_json',
    ]);
  });

  it('reports unreviewed counts but allows the authorized ones', () => {
    const list = {
      page: { items: [], pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } },
      hiddenCount: 4,
      totalMinutesInOrganisation: 90,
    };
    expect(findProtectedMeetingMinuteFields(list)).toEqual(['hiddenCount', 'totalMinutesInOrganisation']);
  });

  it('survives cycles and never includes values in its report', () => {
    const node: Record<string, unknown> = { title: 'secret meeting', rawPrompt: 'the whole minute text' };
    node.self = node;
    const report = findProtectedMeetingMinuteFields(node);
    expect(report).toEqual(['rawPrompt']);
    expect(report.join(' ')).not.toMatch(/secret|minute text/);
  });
});
