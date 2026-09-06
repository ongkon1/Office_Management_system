import { describe, expect, it } from 'vitest';
import type { Project, Task, TimeEntry, WorkPolicy } from '@/contracts/domain';
import { draftMinutes, parseClock, validateEntry, type EntryDraft } from './validation';

const POLICY: WorkPolicy = {
  id: 'wp-standard',
  version: 1,
  name: 'Standard',
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  requiredActiveMinutes: 420,
  recognizedBreakMinutes: 60,
  requiredTotalMinutes: 480,
  overtimeThresholdMinutes: 480,
  criticalThresholdMinutes: 720,
  workingWeekdays: [1, 2, 3, 4, 5],
  businessTimezone: 'Asia/Dhaka',
  createdAt: '2025-01-01T00:00:00+06:00',
  createdBy: { userId: 'sys', displayName: 'System' },
  updatedAt: '2025-01-01T00:00:00+06:00',
  updatedBy: { userId: 'sys', displayName: 'System' },
};

const ACTIVE_PROJECT: Project = {
  id: 'prj-pia',
  name: 'Vision Platform v2',
  code: 'PIA-VP2',
  divisionId: 'pia',
  managerEmployeeId: 'emp-2001',
  client: null,
  startDate: '2026-01-01',
  endDate: null,
  priority: 'high',
  description: null,
  estimatedMinutes: 38400,
  budget: null,
  completionPercent: 40,
  status: 'active',
  isActive: true,
  acceptsTimeEntries: true,
  notes: null,
  createdAt: '2026-01-01T00:00:00+06:00',
  createdBy: { userId: 'sys', displayName: 'System' },
  updatedAt: '2026-01-01T00:00:00+06:00',
  updatedBy: { userId: 'sys', displayName: 'System' },
};

const INACTIVE_PROJECT: Project = {
  ...ACTIVE_PROJECT,
  id: 'prj-legacy',
  name: 'Legacy Site Maintenance',
  code: 'PIA-LSM',
  isActive: false,
  acceptsTimeEntries: false,
  status: 'closed',
};

const TASK: Task = {
  id: 'tsk-1',
  title: 'Model evaluation harness',
  divisionId: 'pia',
  projectId: 'prj-pia',
  assigneeEmployeeId: 'emp-1001',
  supportingMemberIds: [],
  creatorEmployeeId: 'emp-2001',
  priority: 'medium',
  startDate: null,
  dueDate: '2026-09-10',
  completedDate: null,
  estimatedMinutes: 2400,
  description: null,
  status: 'in_progress',
  reviewState: 'not_required',
  reviewerEmployeeId: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: '2026-08-01T00:00:00+06:00',
  createdBy: { userId: 'sys', displayName: 'System' },
  updatedAt: '2026-08-01T00:00:00+06:00',
  updatedBy: { userId: 'sys', displayName: 'System' },
};

function existing(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'te-existing',
    employeeId: 'emp-1001',
    workDate: '2026-09-02',
    divisionId: 'pia',
    projectId: 'prj-pia',
    taskId: null,
    entryMethod: 'manual_clock',
    workLocation: 'office',
    startTime: '2026-09-02T09:00:00+06:00',
    endTime: '2026-09-02T11:00:00+06:00',
    activeMinutes: 120,
    workDescription: 'Harness work',
    completedWork: 'Ran the first benchmark',
    supportingLink: null,
    attachmentIds: [],
    state: 'saved',
    crossMidnightGroupId: null,
    policyVersion: 1,
    createdAt: '2026-09-02T09:00:00+06:00',
    createdBy: { userId: 'usr-1001', displayName: 'Nadia Rahman' },
    updatedAt: '2026-09-02T09:00:00+06:00',
    updatedBy: { userId: 'usr-1001', displayName: 'Nadia Rahman' },
    ...overrides,
  };
}

function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    employeeId: 'emp-1001',
    workDate: '2026-09-02',
    divisionId: 'pia',
    projectId: 'prj-pia',
    taskId: null,
    entryMethod: 'manual_clock',
    workLocation: 'office',
    startTime: '13:00',
    endTime: '15:00',
    activeMinutes: null,
    workDescription: 'Latency profiling',
    completedWork: 'Profiled the inference path',
    overtimeReason: null,
    criticalExplanation: null,
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    policy: POLICY,
    existingEntries: [] as readonly TimeEntry[],
    effectiveDivisionIds: ['pia', 'gov', 'wcf'],
    projects: [ACTIVE_PROJECT, INACTIVE_PROJECT],
    tasks: [TASK],
    ...overrides,
  };
}

const codes = (errors: readonly { code: string }[]) => errors.map((error) => error.code);

describe('parseClock and draftMinutes', () => {
  it('parses valid clock values and rejects invalid ones', () => {
    expect(parseClock('09:00')).toBe(540);
    expect(parseClock('9:05')).toBe(545);
    expect(parseClock('23:59')).toBe(1439);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('09:60')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('computes clock duration and refuses to wrap past midnight silently', () => {
    expect(draftMinutes(draft({ startTime: '09:00', endTime: '11:30' }))).toBe(150);
    // Cross-midnight is a policy decision, not something to infer from a typo.
    expect(draftMinutes(draft({ startTime: '22:00', endTime: '01:00' }))).toBe(0);
  });

  it('uses the explicit duration for duration-based entries', () => {
    expect(
      draftMinutes(draft({ entryMethod: 'manual_duration', activeMinutes: 180 })),
    ).toBe(180);
  });
});

describe('a valid entry', () => {
  it('produces no errors', () => {
    expect(validateEntry(draft(), context())).toEqual([]);
  });
});

describe('AC-CALC-005 — overlap is rejected across divisions', () => {
  it('rejects an overlap within the same division', () => {
    const errors = validateEntry(
      draft({ startTime: '10:00', endTime: '12:00' }),
      context({ existingEntries: [existing()] }),
    );
    expect(codes(errors)).toContain('OVERLAPPING_ENTRY');
  });

  it('still rejects an overlap when the divisions differ', () => {
    const errors = validateEntry(
      draft({ divisionId: 'gov', projectId: null, startTime: '10:00', endTime: '12:00' }),
      context({ existingEntries: [existing({ divisionId: 'pia' })] }),
    );
    expect(codes(errors)).toContain('OVERLAPPING_ENTRY');
  });

  it('allows entries that touch without overlapping', () => {
    const errors = validateEntry(
      draft({ startTime: '11:00', endTime: '13:00' }),
      context({ existingEntries: [existing()] }),
    );
    expect(codes(errors)).not.toContain('OVERLAPPING_ENTRY');
  });

  it('does not flag an entry as overlapping itself while editing', () => {
    const errors = validateEntry(
      draft({ id: 'te-existing', startTime: '09:00', endTime: '11:00' }),
      context({ existingEntries: [existing()] }),
    );
    expect(codes(errors)).not.toContain('OVERLAPPING_ENTRY');
  });
});

describe('project and division rules', () => {
  it('rejects time against an inactive project', () => {
    const errors = validateEntry(
      draft({ projectId: 'prj-legacy' }),
      context(),
    );
    expect(codes(errors)).toContain('PROJECT_INACTIVE');
  });

  it('rejects a division the employee was not assigned to on that date', () => {
    const errors = validateEntry(
      draft({ divisionId: 'cjg', projectId: null }),
      context({ effectiveDivisionIds: ['pia', 'wcf'] }),
    );
    expect(codes(errors)).toContain('DIVISION_NOT_EFFECTIVE');
  });

  it('rejects a project belonging to another division', () => {
    const errors = validateEntry(
      draft({ divisionId: 'gov', projectId: 'prj-pia' }),
      context(),
    );
    expect(codes(errors)).toContain('PROJECT_DIVISION_MISMATCH');
  });

  it('rejects a task that does not belong to the selected project', () => {
    const errors = validateEntry(
      draft({ taskId: 'tsk-1', projectId: 'prj-legacy' }),
      context(),
    );
    expect(codes(errors)).toContain('TASK_PROJECT_MISMATCH');
  });
});

describe('time rules', () => {
  it('rejects an end time at or before the start time', () => {
    expect(
      codes(validateEntry(draft({ startTime: '13:00', endTime: '13:00' }), context())),
    ).toContain('END_BEFORE_START');
    expect(
      codes(validateEntry(draft({ startTime: '13:00', endTime: '12:00' }), context())),
    ).toContain('END_BEFORE_START');
  });

  it('requires a duration on a duration-based entry', () => {
    const errors = validateEntry(
      draft({ entryMethod: 'manual_duration', activeMinutes: 0 }),
      context(),
    );
    expect(codes(errors)).toContain('DURATION_REQUIRED');
  });
});

describe('required content', () => {
  it('requires a description and completed work', () => {
    const errors = validateEntry(
      draft({ workDescription: '   ', completedWork: '' }),
      context(),
    );
    expect(codes(errors)).toContain('DESCRIPTION_REQUIRED');
    expect(codes(errors)).toContain('COMPLETED_WORK_REQUIRED');
  });

  it('rejects an exact duplicate of an existing entry', () => {
    const errors = validateEntry(
      draft({
        entryMethod: 'manual_duration',
        activeMinutes: 120,
        workDescription: 'Harness work',
      }),
      context({ existingEntries: [existing()] }),
    );
    expect(codes(errors)).toContain('DUPLICATE_ENTRY');
  });
});

describe('leave, holiday and locked periods', () => {
  it('rejects an entry on a day with approved full-day leave', () => {
    const errors = validateEntry(
      draft(),
      context({ leave: { portion: 'full_day', leaveType: 'annual' } }),
    );
    expect(codes(errors)).toContain('LEAVE_CONFLICT');
  });

  it('allows an entry on a half-day leave date', () => {
    const errors = validateEntry(
      draft(),
      context({ leave: { portion: 'half_day', leaveType: 'sick' } }),
    );
    expect(codes(errors)).not.toContain('LEAVE_CONFLICT');
  });

  it('flags a holiday without silently accepting it', () => {
    const errors = validateEntry(draft(), context({ holidayName: 'National Day' }));
    expect(codes(errors)).toContain('HOLIDAY_CONFLICT');
  });

  it('refuses any edit in a locked period and reports nothing else', () => {
    const errors = validateEntry(
      draft({ workDescription: '', completedWork: '' }),
      context({ isPeriodLocked: true }),
    );
    // The locked period is the only actionable problem; listing field errors
    // the user cannot fix would be noise.
    expect(codes(errors)).toEqual(['PERIOD_LOCKED']);
  });
});

describe('overtime and critical explanations', () => {
  it('requires a reason once the day passes eight hours', () => {
    const errors = validateEntry(
      draft({ entryMethod: 'manual_duration', activeMinutes: 421, startTime: null, endTime: null }),
      context(),
    );
    expect(codes(errors)).toContain('OVERTIME_REASON_REQUIRED');
  });

  it('accepts the entry once a reason is given', () => {
    const errors = validateEntry(
      draft({
        entryMethod: 'manual_duration',
        activeMinutes: 421,
        startTime: null,
        endTime: null,
        overtimeReason: 'Release cut-off',
      }),
      context(),
    );
    expect(codes(errors)).not.toContain('OVERTIME_REASON_REQUIRED');
  });

  it('does not require a reason at exactly eight hours', () => {
    const errors = validateEntry(
      draft({ entryMethod: 'manual_duration', activeMinutes: 420, startTime: null, endTime: null }),
      context(),
    );
    expect(codes(errors)).not.toContain('OVERTIME_REASON_REQUIRED');
  });

  it('requires a critical explanation only past twelve hours', () => {
    const atTwelve = validateEntry(
      draft({
        entryMethod: 'manual_duration',
        activeMinutes: 660,
        startTime: null,
        endTime: null,
        overtimeReason: 'Incident',
      }),
      context(),
    );
    expect(codes(atTwelve)).not.toContain('CRITICAL_EXPLANATION_REQUIRED');

    const pastTwelve = validateEntry(
      draft({
        entryMethod: 'manual_duration',
        activeMinutes: 661,
        startTime: null,
        endTime: null,
        overtimeReason: 'Incident',
      }),
      context(),
    );
    expect(codes(pastTwelve)).toContain('CRITICAL_EXPLANATION_REQUIRED');
  });

  it('counts existing entries toward the day when deciding', () => {
    const errors = validateEntry(
      draft({ entryMethod: 'manual_duration', activeMinutes: 301, startTime: null, endTime: null }),
      context({ existingEntries: [existing({ activeMinutes: 120 })] }),
    );
    // 120 existing + 301 new + 60 break = 8:01.
    expect(codes(errors)).toContain('OVERTIME_REASON_REQUIRED');
  });
});

describe('error shape', () => {
  it('gives every error a field, a message and corrective guidance', () => {
    const errors = validateEntry(
      draft({ workDescription: '', endTime: '12:00' }),
      context(),
    );
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.field).toBeTruthy();
      expect(error.message).toBeTruthy();
      // REQ-TIME-025: a message without guidance is an incomplete response.
      expect(error.guidance).toBeTruthy();
    }
  });
});
