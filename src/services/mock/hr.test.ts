import { beforeEach, describe, expect, it } from 'vitest';
import { mockHrService, resetHrState } from './hr';
import { mockStore } from './store';
import { summaryFor } from './timesheet';

const HR = 'usr-3001';
const EMPLOYEE = 'usr-1001';
const TEAM_LEAD = 'usr-2001';

beforeEach(() => {
  mockStore.reset();
  resetHrState();
});

describe('HR scope', () => {
  it('denies the employee directory to a non-HR role', async () => {
    const result = await mockHrService.listEmployees(EMPLOYEE);
    expect(result.status).toBe('permission_denied');
  });

  it('returns not-found rather than denied for an employee record', async () => {
    // An unauthorized record and a nonexistent one must be indistinguishable
    // (`REQ-NFR-SEC-004`): a denial here would confirm the record exists.
    const denied = await mockHrService.getEmployee(TEAM_LEAD, 'emp-1001');
    const missing = await mockHrService.getEmployee(HR, 'emp-does-not-exist');
    expect(denied.status).toBe('not_found');
    expect(missing.status).toBe('not_found');
  });
});

describe('assignments', () => {
  it('requires an end date for a temporary assignment', async () => {
    const result = await mockHrService.saveAssignment(HR, {
      employeeId: 'emp-1002',
      divisionId: 'pia',
      isPrimary: false,
      teamLeadEmployeeId: 'emp-2001',
      allocationPercent: 20,
      expectedWeeklyMinutes: 420,
      startDate: '2026-09-01',
      endDate: null,
      isTemporary: true,
      isActive: true,
      roleInDivision: '',
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].field).toBe('endDate');
      // Every validation error carries corrective guidance (`REQ-TIME-025`).
      expect(result.fieldErrors[0].guidance).toBeTruthy();
    }
  });

  it('keeps exactly one primary assignment per employee', async () => {
    const result = await mockHrService.saveAssignment(HR, {
      employeeId: 'emp-1001',
      divisionId: 'wcf',
      isPrimary: true,
      teamLeadEmployeeId: 'emp-2002',
      allocationPercent: 20,
      expectedWeeklyMinutes: 420,
      startDate: '2026-09-01',
      endDate: null,
      isTemporary: false,
      isActive: true,
      roleInDivision: '',
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.filter((assignment) => assignment.isPrimary)).toHaveLength(1);
    }
  });

  it('widens the divisions an employee may record time against', async () => {
    const detailBefore = await mockHrService.getEmployee(HR, 'emp-1002');
    const before =
      detailBefore.status === 'success'
        ? detailBefore.data.assignments.filter((item) => item.isEffectiveToday).length
        : 0;

    await mockHrService.saveAssignment(HR, {
      employeeId: 'emp-1002',
      divisionId: 'pit',
      isPrimary: false,
      teamLeadEmployeeId: 'emp-2001',
      allocationPercent: 10,
      expectedWeeklyMinutes: 210,
      startDate: '2026-08-01',
      endDate: null,
      isTemporary: false,
      isActive: true,
      roleInDivision: '',
    });

    const detailAfter = await mockHrService.getEmployee(HR, 'emp-1002');
    expect(detailAfter.status).toBe('success');
    if (detailAfter.status === 'success') {
      expect(
        detailAfter.data.assignments.filter((item) => item.isEffectiveToday).length,
      ).toBe(before + 1);
    }
  });
});

describe('attendance exemptions (FE-0514)', () => {
  it('does not classify approved leave or a holiday as missing', async () => {
    const result = await mockHrService.getAttendance(HR, '2026-08-17', '2026-08-19');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const days = result.data.rows.flatMap((row) => row.days);
    const leaveDay = days.find(
      (day) => day.employee.id === 'emp-1003' && day.date === '2026-08-19',
    );
    const holidayDay = days.find((day) => day.date === '2026-08-17');

    expect(leaveDay?.state).toBe('approved_leave');
    expect(leaveDay?.isMissing).toBe(false);
    expect(leaveDay?.exemptionNote).toContain('no timesheet required');
    expect(holidayDay?.isMissing).toBe(false);
  });

  it('reduces the visible requirement on a half-day leave', async () => {
    const result = await mockHrService.getAttendance(HR, '2026-08-18', '2026-08-18');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const halfDay = result.data.rows
      .flatMap((row) => row.days)
      .find((day) => day.employee.id === 'emp-1003');

    expect(halfDay?.state).toBe('half_day_leave');
    expect(halfDay?.requiredActive.minutes).toBe(210);
    expect(halfDay?.exemptionNote).toContain('3:30');
  });
});

describe('request overrides', () => {
  it('refuses to replace an existing decision without a reason', async () => {
    const result = await mockHrService.decideRequest({
      userId: HR,
      kind: 'wfh',
      id: 'wfh-2',
      outcome: 'rejected',
      comment: '',
      overrideReason: null,
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].field).toBe('overrideReason');
    }
  });

  it('records the override reason and the previous outcome', async () => {
    const result = await mockHrService.decideRequest({
      userId: HR,
      kind: 'wfh',
      id: 'wfh-2',
      outcome: 'rejected',
      comment: 'Site attendance is required that week.',
      overrideReason: 'Client audit moved to the same day.',
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.overrideReason).toBe('Client audit moved to the same day.');
      expect(result.data.previousOutcomeLabel).toBe('Approved');
    }
  });

  it('does not treat a first decision as an override', async () => {
    const result = await mockHrService.decideRequest({
      userId: HR,
      kind: 'leave',
      id: 'lv-3',
      outcome: 'approved',
      comment: '',
      overrideReason: null,
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') expect(result.data.overrideReason).toBeNull();
  });
});

describe('period verification', () => {
  it('blocks verification while a correction request is unresolved', async () => {
    const result = await mockHrService.verifyPeriod({
      userId: HR,
      periodId: 'per-2026-08',
      acknowledgedExceptions: true,
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.message).toContain('correction');
    }
  });

  it('refuses to verify an already verified period', async () => {
    const result = await mockHrService.verifyPeriod({
      userId: HR,
      periodId: 'per-2026-07',
      acknowledgedExceptions: true,
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.code).toBe('PERIOD_LOCKED');
  });

  it('locks every date in the period once verified', async () => {
    // September has no unresolved corrections in the fixture set.
    const before = summaryFor('emp-1001', '2026-09-02').isLocked;
    expect(before).toBe(false);

    const result = await mockHrService.verifyPeriod({
      userId: HR,
      periodId: 'per-2026-09',
      acknowledgedExceptions: true,
    });
    expect(result.status).toBe('success');
    expect(summaryFor('emp-1001', '2026-09-02').isLocked).toBe(true);
  });

  it('requires a reason for an amendment and marks the period amended', async () => {
    const missingReason = await mockHrService.amendPeriod({
      userId: HR,
      periodId: 'per-2026-07',
      employeeId: 'emp-1001',
      recordLabel: 'Time entry, 23 Jul 2026',
      reason: '   ',
      before: 'PIA 3:00',
      after: 'GOV 3:00',
    });
    expect(missingReason.status).toBe('validation_failure');

    const amended = await mockHrService.amendPeriod({
      userId: HR,
      periodId: 'per-2026-07',
      employeeId: 'emp-1001',
      recordLabel: 'Time entry, 24 Jul 2026',
      reason: 'Division corrected after the client confirmed the work.',
      before: 'PIA 3:00',
      after: 'GOV 3:00',
    });
    expect(amended.status).toBe('success');
    if (amended.status === 'success') {
      expect(amended.data.status).toBe('amended');
      expect(amended.data.amendments.length).toBeGreaterThan(1);
    }
  });
});

describe('evaluations', () => {
  it('applies the 30/25/15/10/10/10 weighting to the final result', async () => {
    const result = await mockHrService.getEvaluation(HR, 'eval-emp-1003');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    // 4·30 + 5·25 + 3·15 + 5·10 + 4·10 + 4·10 = 420 → 4.20
    expect(result.data.weightedScore).toBe(4.2);
    expect(result.data.weights.task_completion).toBe(30);
  });

  it('publishes only from HR review and then becomes read-only', async () => {
    const tooEarly = await mockHrService.publishEvaluation(HR, 'eval-emp-1002');
    expect(tooEarly.status).toBe('conflict');

    const published = await mockHrService.publishEvaluation(HR, 'eval-emp-1003');
    expect(published.status).toBe('success');
    if (published.status === 'success') {
      expect(published.data.state).toBe('published');
      expect(published.data.isReadOnly).toBe(true);
      expect(published.data.publishedByLabel).toBe('Rezaul Haque');
    }
  });

  it('distinguishes an unsubmitted self-evaluation from a restricted one', async () => {
    const notSubmitted = await mockHrService.getEvaluation(HR, 'eval-emp-1002');
    expect(notSubmitted.status).toBe('success');
    if (notSubmitted.status === 'success') {
      expect(notSubmitted.data.selfEvaluationState).toBe('not_submitted');
      expect(notSubmitted.data.restrictedNote).toBeNull();
    }

    const submitted = await mockHrService.getEvaluation(HR, 'eval-emp-1001');
    if (submitted.status === 'success') {
      expect(submitted.data.selfEvaluationState).toBe('submitted');
      expect(submitted.data.selfEvaluation).not.toBeNull();
    }
  });

  it('creates a period with one evaluation per assigned employee', async () => {
    const result = await mockHrService.createEvaluationPeriod(HR, {
      name: 'September 2026 monthly review',
      type: 'monthly',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      dueDate: '2026-10-07',
      employeeIds: ['emp-1001', 'emp-1002'],
      reviewerByEmployeeId: { 'emp-1001': 'emp-2001', 'emp-1002': 'emp-2001' },
    });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.total).toBe(2);
      expect(result.data.notStarted).toBe(2);
      expect(result.data.typeLabel).toBe('Monthly');
    }
  });

  it('rejects a due date before the period ends', async () => {
    const result = await mockHrService.createEvaluationPeriod(HR, {
      name: 'Bad period',
      type: 'quarterly',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      dueDate: '2026-09-15',
      employeeIds: ['emp-1001'],
      reviewerByEmployeeId: {},
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].field).toBe('dueDate');
    }
  });
});

describe('holidays', () => {
  it('requires a weekday for a weekly holiday and a date otherwise', async () => {
    const weekly = await mockHrService.saveHoliday(HR, {
      name: 'Weekly holiday',
      scope: 'weekly',
      divisionId: null,
      date: null,
      weekday: null,
    });
    expect(weekly.status).toBe('validation_failure');

    const dated = await mockHrService.saveHoliday(HR, {
      name: 'Company day',
      scope: 'company',
      divisionId: null,
      date: null,
      weekday: null,
    });
    expect(dated.status).toBe('validation_failure');
  });

  it('deactivating a holiday makes the day a required working day again', async () => {
    // 17 Aug 2026 is a Monday company holiday in the fixture set.
    expect(summaryFor('emp-1001', '2026-08-17').exemption).toBe('holiday');

    const result = await mockHrService.setHolidayActive(HR, 'hol-1', false);
    expect(result.status).toBe('success');
    expect(summaryFor('emp-1001', '2026-08-17').exemption).not.toBe('holiday');
  });
});
