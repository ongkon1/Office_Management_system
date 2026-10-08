import { describe, expect, it } from 'vitest';
import type { HrAssignmentView } from '@/contracts/hr';
import {
  describeCurrentPlacements,
  placementHistory,
  placementState,
} from './placement-history';

/**
 * `OH-FE-0305`, `OH-FE-0306` — placement history and transfers.
 *
 * Two answers this fixes rather than adds: a placement that has not started is
 * **scheduled**, which the section used to label "Ended", and a move between
 * departments inside one division is a **transfer**, which a reader previously
 * had to infer from two unrelated-looking rows.
 */

const TODAY = '2026-09-02';

function assignment(overrides: Partial<HrAssignmentView> & { id: string }): HrAssignmentView {
  return {
    employeeId: 'emp-1001',
    division: { id: 'pia', name: 'PowerInAI', code: 'PIA', isRestricted: false },
    department: { id: 'dept-pia-technical', name: 'Technical', code: 'TECH' },
    isPrimary: true,
    effectiveTeamLead: null,
    allocationPercent: 100,
    expectedWeekly: { minutes: 2100, label: '35:00', hours: 35 },
    startDate: '2025-01-01',
    startDateLabel: '1 Jan 2025',
    endDate: null,
    endDateLabel: null,
    isTemporary: false,
    isActive: true,
    isEffectiveToday: true,
    roleInDivision: null,
    ...overrides,
  } as HrAssignmentView;
}

describe('placement state', () => {
  it('separates a future placement from an ended one', () => {
    const scheduled = assignment({
      id: 'future',
      startDate: '2026-12-01',
      startDateLabel: '1 Dec 2026',
      isEffectiveToday: false,
      isActive: true,
    });
    const ended = assignment({
      id: 'past',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      endDateLabel: '31 Dec 2024',
      isEffectiveToday: false,
      isActive: false,
    });
    expect(placementState(scheduled, TODAY)).toBe('scheduled');
    expect(placementState(ended, TODAY)).toBe('ended');
    expect(placementState(assignment({ id: 'now' }), TODAY)).toBe('current');
  });
});

describe('transfers (OH-FE-0306)', () => {
  it('names the department a placement replaced inside one division', () => {
    const rows = placementHistory(
      [
        assignment({
          id: 'new',
          department: { id: 'dept-pia-prompt', name: 'Prompt Engineering', code: 'PROMPT' },
          startDate: '2026-09-01',
          startDateLabel: '1 Sep 2026',
        }),
        assignment({
          id: 'old',
          startDate: '2025-01-01',
          endDate: '2026-08-31',
          endDateLabel: '31 Aug 2026',
          isEffectiveToday: false,
          isActive: false,
        }),
      ],
      TODAY,
    );

    expect(rows.map((row) => [row.assignment.id, row.state])).toEqual([
      ['new', 'current'],
      ['old', 'ended'],
    ]);
    expect(rows[0]?.transferredFrom).toEqual({
      departmentName: 'Technical',
      onDate: '2026-09-01',
      onDateLabel: '1 Sep 2026',
    });
    /* The replaced placement is not itself a transfer. */
    expect(rows[1]?.transferredFrom).toBeNull();
  });

  it('does not call a second division a transfer (OH-FE-0305)', () => {
    const rows = placementHistory(
      [
        assignment({
          id: 'wcf',
          division: { id: 'wcf', name: 'WesternCF', code: 'WCF', isRestricted: false },
          department: { id: 'dept-wcf-sales', name: 'Sales', code: 'SALES' },
          startDate: '2026-06-01',
          startDateLabel: '1 Jun 2026',
          isPrimary: false,
        }),
        assignment({ id: 'pia' }),
      ],
      TODAY,
    );
    expect(rows.every((row) => row.transferredFrom === null)).toBe(true);
  });

  it('ignores a same-department renewal', () => {
    const rows = placementHistory(
      [
        assignment({ id: 'renewed', startDate: '2026-01-01', startDateLabel: '1 Jan 2026' }),
        assignment({
          id: 'original',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          endDateLabel: '31 Dec 2025',
          isEffectiveToday: false,
          isActive: false,
        }),
      ],
      TODAY,
    );
    expect(rows[0]?.transferredFrom).toBeNull();
  });
});

describe('describing current placements (OH-FE-0305)', () => {
  it('reports one, several, or none', () => {
    expect(describeCurrentPlacements([], TODAY)).toBe('No effective placement today.');
    expect(describeCurrentPlacements([assignment({ id: 'one' })], TODAY)).toBe(
      'Placed in Technical (PowerInAI).',
    );
    const two = describeCurrentPlacements(
      [
        assignment({ id: 'one' }),
        assignment({
          id: 'two',
          division: { id: 'wcf', name: 'WesternCF', code: 'WCF', isRestricted: false },
          department: { id: 'dept-wcf-ops', name: 'Operations', code: 'OPS' },
        }),
      ],
      TODAY,
    );
    expect(two).toBe('Placed in 2 departments: Technical (PowerInAI), Operations (WesternCF).');
  });
});
