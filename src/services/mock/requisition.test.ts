import { beforeEach, describe, expect, it } from 'vitest';
import type { RequisitionFormInput } from '@/contracts/requisition';
import { mockStore } from './store';
import { mockRequisitionService, resetRequisitionState } from './requisition';

/**
 * `FE-0752` — the review chain and the scope rules.
 *
 * These two are tested together on purpose. The chain decides *where* a
 * requisition is, and the scope rule decides *who can see it there* — a bug in
 * either one alone produces the same symptom, a reviewer seeing something too
 * early, so testing them apart would not catch it.
 */

const EMPLOYEE = 'usr-1001'; // Nadia Rahman, Team Lead emp-2001
const OTHER_EMPLOYEE = 'usr-1003'; // Sadia Karim, same Team Lead
const TEAM_LEAD = 'usr-2001'; // Imran Hossain
const OTHER_TEAM_LEAD = 'usr-2002'; // Farhana Islam
const HR = 'usr-3001';
/*
 * `usr-4001` is an HR account now (`FE-1006`). It is kept as a *second* HR
 * reviewer only where a test needs one; the parallel chain is HR and the
 * administrator, so a test that decided as "Finance" after HR would be
 * deciding twice as the same role and would pass for the wrong reason.
 */
const SECOND_HR = 'usr-4001';
const ADMIN = 'usr-9001';
const MANAGEMENT = 'usr-5001';

const IN_HOUSE: RequisitionFormInput = {
  kind: 'in_house',
  itemName: 'Laptop dock',
  purpose: 'Repair',
  urgency: 'High',
  approxAmount: '5500',
  modelName: 'Dell WD19',
  lastRecoverDate: '2026-04-02',
};

const NEW_ITEM: RequisitionFormInput = {
  kind: 'new',
  itemName: 'Ergonomic chair',
  purpose: 'Back support',
  urgency: 'Medium',
  approxAmount: '19999.99',
  modelName: 'Herman Miller Sayl',
  lastRecoverDate: '',
};

beforeEach(() => {
  mockStore.reset();
  resetRequisitionState();
});

describe('who may raise a requisition', () => {
  it('accepts an Employee', async () => {
    const result = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    expect(result.status).toBe('success');
  });

  it('accepts a Team Lead', async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    expect(result.status).toBe('success');
  });

  it.each([
    ['HR', HR],
    ['a second HR account', SECOND_HR],
    ['the Super Administrator', ADMIN],
    ['Management', MANAGEMENT],
  ])('refuses %s at the service, not in the UI', async (_label, userId) => {
    const result = await mockRequisitionService.submit(userId, NEW_ITEM);
    expect(result.status).toBe('permission_denied');
  });

  it('tells a reviewer why they cannot submit rather than hiding the reason', async () => {
    const list = await mockRequisitionService.list(SECOND_HR);
    if (list.status !== 'success') throw new Error('expected success');
    expect(list.data.canSubmit).toBe(false);
    expect(list.data.submitBlockedReason).toBeTruthy();
  });
});

describe('routing', () => {
  it("sends an Employee's requisition to their Team Lead first", async () => {
    const result = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.stage).toBe('team_lead_review');
    expect(result.data.stageLabel).toContain('Team Lead');
  });

  it("skips the Team Lead stage for a Team Lead's own requisition", async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.stage).toBe('reviewer_review');
    // Skipped, not auto-approved: no decision was made, so none is recorded.
    expect(result.data.reviews).toHaveLength(0);
  });

  it('moves to the parallel reviewers only once the Team Lead approves', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const decided = await mockRequisitionService.decide(TEAM_LEAD, submitted.data.id, {
      decision: 'approved',
      reason: '',
    });
    if (decided.status !== 'success') throw new Error('expected success');
    expect(decided.data.stage).toBe('reviewer_review');
    expect(decided.data.pendingReviewers.map((item) => item.roleLabel)).toEqual([
      'HR',
      'Super Administrator',
    ]);
  });

  it('is approved only when every parallel reviewer has approved', async () => {
    const approve = { decision: 'approved' as const, reason: '' };
    const submitted = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (submitted.status !== 'success') throw new Error('expected success');
    const id = submitted.data.id;

    const afterHr = await mockRequisitionService.decide(HR, id, approve);
    if (afterHr.status !== 'success') throw new Error('expected success');
    expect(afterHr.data.stage).toBe('reviewer_review');

    // A second HR account is not a second vote: the stage tracks roles, not
    // people, so HR having decided is what matters.
    const secondHr = await mockRequisitionService.decide(SECOND_HR, id, approve);
    expect(secondHr.status).toBe('permission_denied');

    const afterAdmin = await mockRequisitionService.decide(ADMIN, id, approve);
    if (afterAdmin.status !== 'success') throw new Error('expected success');
    expect(afterAdmin.data.stage).toBe('decided');
    expect(afterAdmin.data.outcome).toBe('approved');
  });

  it('ends the chain on the first rejection without waiting for the rest', async () => {
    const submitted = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const rejected = await mockRequisitionService.decide(SECOND_HR, submitted.data.id, {
      decision: 'rejected',
      reason: 'Outside budget this quarter.',
    });
    if (rejected.status !== 'success') throw new Error('expected success');
    expect(rejected.data.stage).toBe('decided');
    expect(rejected.data.outcome).toBe('rejected');
    expect(rejected.data.pendingReviewers).toHaveLength(0);
  });

  it('requires a reason when rejecting, with guidance', async () => {
    const submitted = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockRequisitionService.decide(HR, submitted.data.id, {
      decision: 'rejected',
      reason: '   ',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].guidance).toBeTruthy();
  });
});

describe('visibility', () => {
  it('hides a requisition still with the Team Lead from HR and the administrator', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');
    const id = submitted.data.id;

    for (const reviewer of [HR, SECOND_HR, ADMIN]) {
      const result = await mockRequisitionService.get(reviewer, id);
      expect(result.status).toBe('not_found');
    }
  });

  it('shows it to them once the Team Lead has approved', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');
    await mockRequisitionService.decide(TEAM_LEAD, submitted.data.id, {
      decision: 'approved',
      reason: '',
    });

    for (const reviewer of [HR, SECOND_HR, ADMIN]) {
      const result = await mockRequisitionService.get(reviewer, submitted.data.id);
      expect(result.status).toBe('success');
    }
  });

  it("hides one employee's requisition from another employee", async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockRequisitionService.get(OTHER_EMPLOYEE, submitted.data.id);
    expect(result.status).toBe('not_found');
  });

  it('returns the same response for an unauthorized id as for a nonexistent one', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const unauthorized = await mockRequisitionService.get(OTHER_EMPLOYEE, submitted.data.id);
    const nonexistent = await mockRequisitionService.get(OTHER_EMPLOYEE, 'req-does-not-exist');
    expect(unauthorized).toEqual(nonexistent);
  });

  it("hides it from a Team Lead who is not the submitter's Team Lead", async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockRequisitionService.get(OTHER_TEAM_LEAD, submitted.data.id);
    expect(result.status).toBe('not_found');
  });

  it('never lists a requisition the viewer cannot open', async () => {
    const list = await mockRequisitionService.list(HR);
    if (list.status !== 'success') throw new Error('expected success');

    for (const row of list.data.rows) {
      const detail = await mockRequisitionService.get(HR, row.id);
      expect(detail.status).toBe('success');
    }
  });

  it('counts only rows the viewer can see, so a count cannot leak', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const hrList = await mockRequisitionService.list(HR);
    if (hrList.status !== 'success') throw new Error('expected success');
    expect(hrList.data.rows.some((row) => row.id === submitted.data.id)).toBe(false);
    expect(hrList.data.awaitingCount).toBe(
      hrList.data.rows.filter((row) => row.awaitingThisViewer).length,
    );
  });
});

describe('who may decide, and when', () => {
  it('refuses a reviewer whose stage has not been reached', async () => {
    // `req-1` is still with the Team Lead in the fixtures.
    const result = await mockRequisitionService.decide(HR, 'req-1', {
      decision: 'approved',
      reason: '',
    });
    // Not visible to HR yet, so it is not found rather than denied.
    expect(result.status).toBe('not_found');
  });

  it('refuses a Team Lead who is not the assigned one', async () => {
    const result = await mockRequisitionService.decide(OTHER_TEAM_LEAD, 'req-1', {
      decision: 'approved',
      reason: '',
    });
    expect(result.status).toBe('not_found');
  });

  it('refuses a second decision from the same reviewer', async () => {
    const approve = { decision: 'approved' as const, reason: '' };
    const submitted = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (submitted.status !== 'success') throw new Error('expected success');

    await mockRequisitionService.decide(HR, submitted.data.id, approve);
    const second = await mockRequisitionService.decide(HR, submitted.data.id, approve);
    expect(second.status).toBe('permission_denied');
  });

  it('returns a conflict rather than a lost decision on an already-decided requisition', async () => {
    const result = await mockRequisitionService.decide(HR, 'req-6', {
      decision: 'approved',
      reason: '',
    });
    expect(result.status).toBe('conflict');
  });

  it('counts the Team Lead queue from what is genuinely waiting on them', async () => {
    const queue = await mockRequisitionService.queue(TEAM_LEAD);
    if (queue.status !== 'success') throw new Error('expected success');
    expect(queue.data.awaitingCount).toBe(1); // `req-1`

    await mockRequisitionService.decide(TEAM_LEAD, 'req-1', {
      decision: 'approved',
      reason: '',
    });
    const after = await mockRequisitionService.queue(TEAM_LEAD);
    if (after.status !== 'success') throw new Error('expected success');
    expect(after.data.awaitingCount).toBe(0);
  });
});

describe('the amount is money, not a number', () => {
  it('stores an exact decimal with a currency code', async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (result.status !== 'success') throw new Error('expected success');

    const stored = mockStore.findRequisition(result.data.id);
    expect(stored?.approxAmount).toEqual({ amount: '19999.99', currency: 'BDT' });
    expect(result.data.amountDisplay).toBe('BDT 19,999.99');
  });

  it('accepts a grouped figure the way a person would type it', async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, {
      ...NEW_ITEM,
      approxAmount: '1,250.75',
    });
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findRequisition(result.data.id)?.approxAmount.amount).toBe('1250.75');
  });

  it('rejects more precision than the currency holds rather than rounding it away', async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, {
      ...NEW_ITEM,
      approxAmount: '100.005',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('approxAmount');
    expect(result.fieldErrors[0].guidance).toBeTruthy();
  });

  it.each([['abc'], ['BDT 500'], ['-500']])('rejects %s', async (amount) => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, {
      ...NEW_ITEM,
      approxAmount: amount,
    });
    expect(result.status).toBe('validation_failure');
  });
});

describe('validation carries field, message and guidance', () => {
  it('reports every empty required field at once', async () => {
    const result = await mockRequisitionService.submit(EMPLOYEE, {
      kind: 'in_house',
      itemName: '',
      purpose: '',
      urgency: '',
      approxAmount: '',
      modelName: '',
      lastRecoverDate: '',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');

    expect(result.fieldErrors.map((error) => error.field).sort()).toEqual([
      'approxAmount',
      'itemName',
      'lastRecoverDate',
      'modelName',
      'purpose',
      'urgency',
    ]);
    for (const error of result.fieldErrors) {
      expect(error.message).toBeTruthy();
      expect(error.guidance).toBeTruthy();
    }
    expect(result.focusField).toBeTruthy();
  });

  it('requires the last recover date only for an in-house requisition', async () => {
    const asNew = await mockRequisitionService.submit(EMPLOYEE, {
      ...NEW_ITEM,
      lastRecoverDate: '',
    });
    expect(asNew.status).toBe('success');

    const asInHouse = await mockRequisitionService.submit(EMPLOYEE, {
      ...IN_HOUSE,
      lastRecoverDate: '',
    });
    expect(asInHouse.status).toBe('validation_failure');
  });

  it('rejects a last recover date in the future', async () => {
    const result = await mockRequisitionService.submit(EMPLOYEE, {
      ...IN_HOUSE,
      lastRecoverDate: '2027-01-01',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('lastRecoverDate');
  });

  it('never stores a last recover date on a new-item requisition', async () => {
    const result = await mockRequisitionService.submit(EMPLOYEE, {
      ...NEW_ITEM,
      lastRecoverDate: '2026-01-01',
    });
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findRequisition(result.data.id)?.lastRecoverDate).toBeNull();
  });
});

describe('withdrawal', () => {
  it('lets the submitter withdraw while it is undecided', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockRequisitionService.withdraw(EMPLOYEE, submitted.data.id);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.outcome).toBe('withdrawn');
  });

  it('refuses to let a reviewer withdraw someone else’s requisition', async () => {
    const submitted = await mockRequisitionService.submit(EMPLOYEE, IN_HOUSE);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockRequisitionService.withdraw(TEAM_LEAD, submitted.data.id);
    expect(result.status).toBe('permission_denied');
  });

  it('refuses to withdraw one that has already been decided', async () => {
    const result = await mockRequisitionService.withdraw('usr-1002', 'req-6');
    expect(result.status).toBe('conflict');
  });
});

describe('the chain a requisition travelled stays reproducible', () => {
  it('records the submitter role at submission, not the role read back later', async () => {
    const result = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findRequisition(result.data.id)?.submitterRole).toBe('team_lead');
  });

  it('appends reviews rather than replacing them', async () => {
    const approve = { decision: 'approved' as const, reason: '' };
    const submitted = await mockRequisitionService.submit(TEAM_LEAD, NEW_ITEM);
    if (submitted.status !== 'success') throw new Error('expected success');

    await mockRequisitionService.decide(HR, submitted.data.id, approve);
    const after = await mockRequisitionService.decide(ADMIN, submitted.data.id, approve);
    if (after.status !== 'success') throw new Error('expected success');

    expect(after.data.reviews.map((review) => review.reviewerRoleLabel)).toEqual([
      'HR',
      'Super Administrator',
    ]);
  });
});
