import { describe, expect, it } from 'vitest';
import type { TimeEntry, WorkPolicy } from '@/contracts/domain';
import { aggregateSummaries, calculateDay, classifyDay } from './engine';

/** The standard policy: 7 active + 1 break = 8 total, Monday to Friday. */
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

let entrySeq = 0;

function entry(
  divisionId: string,
  activeMinutes: number,
  overrides: Partial<TimeEntry> = {},
): TimeEntry {
  entrySeq += 1;
  return {
    id: `te-${entrySeq}`,
    employeeId: 'emp-1001',
    workDate: '2026-09-01',
    divisionId,
    projectId: null,
    taskId: null,
    entryMethod: 'manual_duration',
    workLocation: 'office',
    startTime: null,
    endTime: null,
    activeMinutes,
    workDescription: 'Work',
    completedWork: 'Done',
    supportingLink: null,
    attachmentIds: [],
    state: 'saved',
    crossMidnightGroupId: null,
    policyVersion: 1,
    createdAt: '2026-09-01T09:00:00+06:00',
    createdBy: { userId: 'usr-1001', displayName: 'Nadia Rahman' },
    updatedAt: '2026-09-01T09:00:00+06:00',
    updatedBy: { userId: 'usr-1001', displayName: 'Nadia Rahman' },
    ...overrides,
  };
}

/** 2026-09-01 is a Tuesday, so a required working day under this policy. */
const WORKDAY = '2026-09-01';

function day(entries: readonly TimeEntry[], extra: Record<string, unknown> = {}) {
  return calculateDay({
    employeeId: 'emp-1001',
    workDate: WORKDAY,
    entries,
    policy: POLICY,
    ...extra,
  });
}

describe('AC-CALC-001 — cross-division complete day', () => {
  it('sums 3h PowerInAI + 2h Government Projects + 2h WesternCF into a complete 8h day', () => {
    const result = day([
      entry('pia', 180),
      entry('gov', 120),
      entry('wcf', 120),
    ]);

    expect(result.activeMinutes).toBe(420);
    expect(result.breakMinutes).toBe(60);
    expect(result.totalMinutes).toBe(480);
    expect(result.status).toBe('complete');
    expect(result.remainingActiveMinutes).toBe(0);
  });

  it('preserves each division contribution rather than only the total', () => {
    const result = day([entry('pia', 180), entry('gov', 120), entry('wcf', 120)]);

    expect(result.divisionContributions).toEqual([
      { divisionId: 'pia', activeMinutes: 180 },
      { divisionId: 'gov', activeMinutes: 120 },
      { divisionId: 'wcf', activeMinutes: 120 },
    ]);
  });

  it('recognizes exactly one break for the day, not one per entry', () => {
    const oneEntry = day([entry('pia', 420)]);
    const threeEntries = day([entry('pia', 180), entry('gov', 120), entry('wcf', 120)]);

    expect(oneEntry.breakMinutes).toBe(60);
    expect(threeEntries.breakMinutes).toBe(60);
    expect(threeEntries.totalMinutes).toBe(oneEntry.totalMinutes);
  });
});

describe('AC-CALC-002 / AC-CALC-003 — under-time and overtime boundaries', () => {
  it('treats 6:59 active plus a 1:00 break as under-time', () => {
    const result = day([entry('pia', 419)]);
    expect(result.activeMinutes).toBe(419);
    expect(result.totalMinutes).toBe(479);
    expect(result.status).toBe('under_time');
    expect(result.remainingActiveMinutes).toBe(1);
  });

  it('treats exactly 7:00 active and 8:00 total as complete', () => {
    expect(day([entry('pia', 420)]).status).toBe('complete');
  });

  it('treats 7:01 active — an 8:01 total — as overtime', () => {
    const result = day([entry('pia', 421)]);
    expect(result.totalMinutes).toBe(481);
    expect(result.status).toBe('overtime');
  });
});

describe('AC-CALC-004 — the twelve-hour boundary', () => {
  it('treats a total of exactly 12:00 as overtime, not critical', () => {
    const result = day([entry('pia', 660)]);
    expect(result.totalMinutes).toBe(720);
    expect(result.status).toBe('overtime');
  });

  it('treats 12:01 as critical', () => {
    const result = day([entry('pia', 661)]);
    expect(result.totalMinutes).toBe(721);
    expect(result.status).toBe('critical');
  });
});

describe('under-time triggers on either threshold', () => {
  it('flags a day that meets the active hours but not the total', () => {
    // 7:00 active with a 0:30 break is 7:30 total — active passes, total fails.
    const result = day([entry('pia', 420)], { breakOverrideMinutes: 30 });
    expect(result.activeMinutes).toBe(420);
    expect(result.totalMinutes).toBe(450);
    expect(result.status).toBe('under_time');
  });

  it('flags a day that meets the total but not the active hours', () => {
    // 6:30 active with a 1:30 break reaches 8:00 total but not 7:00 active.
    const result = day([entry('pia', 390)], { breakOverrideMinutes: 90 });
    expect(result.totalMinutes).toBe(480);
    expect(result.activeMinutes).toBe(390);
    expect(result.status).toBe('under_time');
  });
});

describe('AC-CALC-006 — leave and holidays never read as missing', () => {
  it('does not mark an empty day missing when full-day leave is approved', () => {
    const result = day([], { leave: { portion: 'full_day', leaveType: 'annual' } });
    expect(result.status).not.toBe('missing');
    expect(result.exemption).toBe('full_day_leave');
    expect(result.isRequiredWorkingDay).toBe(false);
    expect(result.attendance).toBe('approved_leave');
  });

  it('does not mark an empty day missing when it is a holiday', () => {
    const result = day([], { holidayName: 'National Day' });
    expect(result.status).not.toBe('missing');
    expect(result.exemption).toBe('holiday');
    expect(result.attendance).toBe('holiday');
  });

  it('does not mark a weekend missing', () => {
    // 2026-09-05 is a Saturday.
    const result = calculateDay({
      employeeId: 'emp-1001',
      workDate: '2026-09-05',
      entries: [],
      policy: POLICY,
    });
    expect(result.status).not.toBe('missing');
    expect(result.exemption).toBe('weekly_off');
    expect(result.isRequiredWorkingDay).toBe(false);
  });

  it('marks a required working day with no entry and no exemption as missing', () => {
    const result = day([]);
    expect(result.status).toBe('missing');
    expect(result.isRequiredWorkingDay).toBe(true);
    expect(result.attendance).toBe('missing_timesheet');
  });
});

describe('AC-CALC-007 — half-day leave adjusts the requirement proportionally', () => {
  it('halves the required active time, the break and the total', () => {
    const result = day([entry('pia', 210)], {
      leave: { portion: 'half_day', leaveType: 'sick' },
    });

    expect(result.requiredActiveMinutes).toBe(210);
    expect(result.requiredTotalMinutes).toBe(240);
    expect(result.breakMinutes).toBe(30);
    expect(result.totalMinutes).toBe(240);
    expect(result.status).toBe('complete');
    expect(result.attendance).toBe('half_day_leave');
  });

  it('still applies the absolute overtime threshold on a half day', () => {
    // A half day that runs long is still overtime past eight hours.
    const result = day([entry('pia', 460)], {
      leave: { portion: 'half_day', leaveType: 'sick' },
    });
    expect(result.totalMinutes).toBe(490);
    expect(result.status).toBe('overtime');
  });
});

describe('break handling', () => {
  it('recognizes no break on a day with no recorded work', () => {
    expect(day([]).breakMinutes).toBe(0);
  });

  it('honours an authorized override, including zero', () => {
    expect(day([entry('pia', 420)], { breakOverrideMinutes: 0 }).breakMinutes).toBe(0);
    expect(day([entry('pia', 420)], { breakOverrideMinutes: 45 }).breakMinutes).toBe(45);
  });
});

describe('reproducibility', () => {
  it('records the policy version and timezone that produced the result', () => {
    const result = day([entry('pia', 420)]);
    expect(result.policyVersion).toBe(POLICY.version);
    expect(result.timezone).toBe('Asia/Dhaka');
  });

  it('lists the entries the totals came from', () => {
    const entries = [entry('pia', 180), entry('gov', 240)];
    const result = day(entries);
    expect(result.entryIds).toEqual(entries.map((item) => item.id));
  });

  it('is a pure function of its inputs', () => {
    const entries = [entry('pia', 180), entry('gov', 240)];
    expect(day(entries)).toEqual(day(entries));
  });
});

describe('attendance derivation', () => {
  it('takes the location holding the most active time', () => {
    const result = day([
      entry('pia', 120, { workLocation: 'office' }),
      entry('gov', 300, { workLocation: 'wfh' }),
    ]);
    expect(result.attendance).toBe('wfh');
  });

  it('reports office when work is recorded at the office', () => {
    expect(day([entry('pia', 420)]).attendance).toBe('office');
  });
});

describe('classifyDay', () => {
  const base = {
    requiredActiveMinutes: 420,
    requiredTotalMinutes: 480,
    overtimeThresholdMinutes: 480,
    criticalThresholdMinutes: 720,
    isRequiredWorkingDay: true,
    hasExemption: false,
  };

  it('never returns missing for a day that has entries', () => {
    expect(
      classifyDay({ ...base, hasEntries: true, activeMinutes: 1, totalMinutes: 61 }),
    ).toBe('under_time');
  });

  it('returns complete for an exempt day with nothing recorded', () => {
    expect(
      classifyDay({
        ...base,
        hasEntries: false,
        activeMinutes: 0,
        totalMinutes: 0,
        requiredActiveMinutes: 0,
        requiredTotalMinutes: 0,
        isRequiredWorkingDay: false,
        hasExemption: true,
      }),
    ).toBe('complete');
  });
});

describe('aggregateSummaries', () => {
  it('totals a week and counts each status', () => {
    const summaries = [
      day([entry('pia', 420)]), // complete
      day([entry('pia', 419)]), // under-time
      day([entry('pia', 480)]), // overtime, 9:00 total
      day([]), // missing
    ];

    const totals = aggregateSummaries(summaries);

    expect(totals.activeMinutes).toBe(420 + 419 + 480);
    expect(totals.completeDayCount).toBe(1);
    expect(totals.underTimeDayCount).toBe(1);
    expect(totals.overtimeDayCount).toBe(1);
    expect(totals.missingDayCount).toBe(1);
  });

  it('counts overtime per day so a short day cannot offset a long one', () => {
    const totals = aggregateSummaries([
      day([entry('pia', 480)]), // 9:00 total, 1:00 overtime
      day([entry('pia', 300)]), // 6:00 total, no overtime
    ]);

    expect(totals.overtimeMinutes).toBe(60);
  });
});
