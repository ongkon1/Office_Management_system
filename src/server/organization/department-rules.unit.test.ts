import { describe, expect, it } from 'vitest';

import {
  appointmentDecision,
  conflictingPlacement,
  effectiveLeadPeriod,
  isEffectiveOn,
  previousDay,
  rangesOverlap,
  type LeadPeriod,
} from './department-rules';

/**
 * `OH-BE-0106`, `OH-BE-0107` — the hierarchy decisions, without a database.
 *
 * The repository reads rows under a lock and then asks these functions; these
 * cases are the reason the answers cannot drift from the frontend's refusals.
 */

const period = (
  id: string,
  leadEmployeeId: string,
  effectiveFrom: string,
  effectiveTo: string | null = null,
): LeadPeriod => ({ id, leadEmployeeId, effectiveFrom, effectiveTo });

/** Newest first, the order the repository reads history in. */
const history: readonly LeadPeriod[] = [
  period('open', 'emp-lead', '2025-01-01'),
  period('closed', 'emp-previous', '2024-01-01', '2024-12-31'),
];

describe('effective ranges', () => {
  it('treats an open end as unbounded', () => {
    expect(isEffectiveOn(period('p', 'e', '2025-01-01'), '2099-01-01')).toBe(true);
    expect(isEffectiveOn(period('p', 'e', '2025-01-01', '2025-06-30'), '2025-07-01')).toBe(false);
    expect(rangesOverlap(period('a', 'e', '2026-01-01'), period('b', 'e', '2024-01-01', '2024-12-31'))).toBe(false);
    expect(rangesOverlap(period('a', 'e', '2026-01-01'), period('b', 'e', '2024-01-01', '2026-01-01'))).toBe(true);
  });

  it('resolves the lead effective on a date, including a historical one', () => {
    expect(effectiveLeadPeriod(history, '2026-09-02')?.leadEmployeeId).toBe('emp-lead');
    expect(effectiveLeadPeriod(history, '2024-06-01')?.leadEmployeeId).toBe('emp-previous');
    expect(effectiveLeadPeriod(history, '2023-01-01')).toBeNull();
  });

  it('ends a replaced appointment the day before its successor, across a month and a year', () => {
    expect(previousDay('2026-09-02')).toBe('2026-09-01');
    expect(previousDay('2026-10-01')).toBe('2026-09-30');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });
});

describe('appointment decisions (OH-BE-0107)', () => {
  it('closes the open period the day before a new appointment begins', () => {
    expect(appointmentDecision(history, '2026-09-02', 'emp-new')).toEqual({
      kind: 'append',
      closePeriodId: 'open',
      closeOn: '2026-09-01',
    });
  });

  it('appends without closing anything when the department has no lead', () => {
    expect(appointmentDecision([], '2026-09-02', 'emp-new')).toEqual({
      kind: 'append',
      closePeriodId: null,
      closeOn: null,
    });
  });

  it('refuses a date already covered by an appointment that starts on or after it', () => {
    const scheduled = [period('future', 'emp-next', '2026-10-01'), ...history];
    expect(appointmentDecision(scheduled, '2026-10-01', 'emp-other')).toEqual({
      kind: 'overlap',
      periodId: 'future',
    });
    expect(appointmentDecision(scheduled, '2026-09-15', 'emp-other')).toEqual({
      kind: 'overlap',
      periodId: 'future',
    });
    /* A date after the scheduled one is fine: it closes that period instead. */
    expect(appointmentDecision(scheduled, '2026-11-01', 'emp-other')).toEqual({
      kind: 'append',
      closePeriodId: 'future',
      closeOn: '2026-10-31',
    });
  });

  it('refuses reappointing the employee who already holds the open period', () => {
    expect(appointmentDecision(history, '2026-09-02', 'emp-lead')).toEqual({
      kind: 'already_leads',
      periodId: 'open',
    });
  });

  it('never closes a period that has already ended', () => {
    const closedOnly = [period('closed', 'emp-previous', '2024-01-01', '2024-12-31')];
    expect(appointmentDecision(closedOnly, '2026-09-02', 'emp-new')).toEqual({
      kind: 'append',
      closePeriodId: null,
      closeOn: null,
    });
  });

  it('lets the same employee lead another department from the same date', () => {
    /* History is per department, so an employee leading elsewhere is absent. */
    expect(appointmentDecision([], '2026-09-02', 'emp-lead').kind).toBe('append');
  });
});

describe('placement conflicts (OH-BE-0106)', () => {
  const target = {
    assignmentId: 'asg-target',
    departmentId: 'dept-a',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  };

  it('refuses a second department for the same employee, division and date', () => {
    const conflict = conflictingPlacement(
      [
        {
          assignmentId: 'asg-other',
          departmentId: 'dept-b',
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          isActive: true,
        },
      ],
      target,
    );
    expect(conflict?.assignmentId).toBe('asg-other');
  });

  it('accepts an ended or inactive placement, and the same department twice', () => {
    expect(
      conflictingPlacement(
        [
          {
            assignmentId: 'asg-ended',
            departmentId: 'dept-b',
            effectiveFrom: '2024-01-01',
            effectiveTo: '2025-12-31',
            isActive: true,
          },
          {
            assignmentId: 'asg-inactive',
            departmentId: 'dept-c',
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            isActive: false,
          },
          {
            assignmentId: 'asg-same',
            departmentId: 'dept-a',
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            isActive: true,
          },
          {
            assignmentId: 'asg-unplaced',
            departmentId: null,
            effectiveFrom: '2026-01-01',
            effectiveTo: null,
            isActive: true,
          },
        ],
        target,
      ),
    ).toBeNull();
  });
});
