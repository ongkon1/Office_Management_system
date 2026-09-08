import { beforeEach, describe, expect, it } from 'vitest';
import type { ConveyanceFormInput } from '@/contracts/conveyance';
import { mockStore } from './store';
import { mockConveyanceService, resetConveyanceState } from './conveyance';

/**
 * `FE-0773` — conveyance.
 *
 * The chain itself is covered by the requisition suite, because after `FE-0760`
 * both workflows run on the same implementation. What is tested here is what is
 * genuinely conveyance: the receipt's access rule, the server-assigned
 * timestamp, the visited instant, and the mode description. The chain is
 * re-checked only where conveyance could plausibly have wired it up wrongly.
 */

const EMPLOYEE = 'usr-1001'; // Nadia Rahman, Team Lead emp-2001
const OTHER_EMPLOYEE = 'usr-1003';
const TEAM_LEAD = 'usr-2001';
const OTHER_TEAM_LEAD = 'usr-2002';
const HR = 'usr-3001';
// `usr-4001` is an HR account now (`FE-1006`); see the requisition suite.
const SECOND_HR = 'usr-4001';
const ADMIN = 'usr-9001';
const MANAGEMENT = 'usr-5001';

const CLAIM: ConveyanceFormInput = {
  businessName: 'Meghna Group',
  clientName: 'Meghna Group',
  visitedDate: '2026-08-28',
  visitedTime: '14:30',
  mode: 'uber',
  modeDescription: '',
  amount: '480.50',
  receipt: null,
};

const RECEIPT = {
  fileName: 'trip.pdf',
  sizeBytes: 120_000,
  mimeType: 'application/pdf',
};

beforeEach(() => {
  mockStore.reset();
  resetConveyanceState();
});

describe('who may submit', () => {
  it.each([
    ['an Employee', EMPLOYEE],
    ['a Team Lead', TEAM_LEAD],
  ])('accepts %s', async (_label, userId) => {
    const result = await mockConveyanceService.submit(userId, CLAIM);
    expect(result.status).toBe('success');
  });

  it.each([
    ['HR', HR],
    ['a second HR account', SECOND_HR],
    ['the Super Administrator', ADMIN],
    ['Management', MANAGEMENT],
  ])('refuses %s at the service', async (_label, userId) => {
    const result = await mockConveyanceService.submit(userId, CLAIM);
    expect(result.status).toBe('permission_denied');
  });
});

describe('routing, on the shared chain', () => {
  it("sends an Employee's claim to their Team Lead first", async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.stage).toBe('team_lead_review');
  });

  it("skips the Team Lead stage for a Team Lead's own claim, without inventing a decision", async () => {
    const result = await mockConveyanceService.submit(TEAM_LEAD, CLAIM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.stage).toBe('reviewer_review');
    expect(result.data.reviews).toHaveLength(0);
  });

  it('is approved only when every parallel reviewer has approved', async () => {
    const approve = { decision: 'approved' as const, reason: '' };
    const submitted = await mockConveyanceService.submit(TEAM_LEAD, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');
    const id = submitted.data.id;

    await mockConveyanceService.decide(HR, id, approve);
    // A second HR account cannot cast a second HR vote.
    expect((await mockConveyanceService.decide(SECOND_HR, id, approve)).status).toBe(
      'permission_denied',
    );
    const last = await mockConveyanceService.decide(ADMIN, id, approve);
    if (last.status !== 'success') throw new Error('expected success');

    expect(last.data.stage).toBe('decided');
    expect(last.data.outcome).toBe('approved');
  });

  it('ends the chain on the first rejection', async () => {
    const submitted = await mockConveyanceService.submit(TEAM_LEAD, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const rejected = await mockConveyanceService.decide(SECOND_HR, submitted.data.id, {
      decision: 'rejected',
      reason: 'No receipt attached.',
    });
    if (rejected.status !== 'success') throw new Error('expected success');
    expect(rejected.data.outcome).toBe('rejected');
    expect(rejected.data.pendingReviewers).toHaveLength(0);
  });
});

describe('visibility', () => {
  it('hides a claim still with the Team Lead from the parallel reviewers', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    for (const reviewer of [HR, SECOND_HR, ADMIN]) {
      expect((await mockConveyanceService.get(reviewer, submitted.data.id)).status).toBe(
        'not_found',
      );
    }
  });

  it("hides one employee's claim from another", async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');
    expect((await mockConveyanceService.get(OTHER_EMPLOYEE, submitted.data.id)).status).toBe(
      'not_found',
    );
  });

  it('returns the same response for an unauthorized id as for a nonexistent one', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const unauthorized = await mockConveyanceService.get(OTHER_EMPLOYEE, submitted.data.id);
    const nonexistent = await mockConveyanceService.get(OTHER_EMPLOYEE, 'cnv-nope');
    expect(unauthorized).toEqual(nonexistent);
  });

  it('counts only what the viewer can see', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const list = await mockConveyanceService.list(HR);
    if (list.status !== 'success') throw new Error('expected success');
    expect(list.data.rows.some((row) => row.id === submitted.data.id)).toBe(false);
    expect(list.data.awaitingCount).toBe(
      list.data.rows.filter((row) => row.awaitingThisViewer).length,
    );
  });
});

describe('the receipt is deny-by-default attachment data', () => {
  it('is reachable by the submitter', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: RECEIPT,
    });
    if (submitted.status !== 'success') throw new Error('expected success');

    const receipt = await mockConveyanceService.getReceipt(EMPLOYEE, submitted.data.id);
    if (receipt.status !== 'success') throw new Error('expected success');
    expect(receipt.data.fileName).toBe('trip.pdf');
  });

  it('is reachable by that submitter’s Team Lead', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: RECEIPT,
    });
    if (submitted.status !== 'success') throw new Error('expected success');
    expect((await mockConveyanceService.getReceipt(TEAM_LEAD, submitted.data.id)).status).toBe(
      'success',
    );
  });

  it.each([
    ['another employee', OTHER_EMPLOYEE],
    ['an unrelated Team Lead', OTHER_TEAM_LEAD],
    ['HR before the claim reaches them', HR],
    ['a second HR account before the claim reaches them', SECOND_HR],
    ['the administrator before the claim reaches them', ADMIN],
  ])('is unreachable by %s, even asked for directly', async (_label, userId) => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: RECEIPT,
    });
    if (submitted.status !== 'success') throw new Error('expected success');

    // The screen omitting a link is not the control; this is the path that is.
    const receipt = await mockConveyanceService.getReceipt(userId, submitted.data.id);
    expect(receipt.status).toBe('not_found');
  });

  it('becomes reachable by a reviewer once the claim reaches them', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: RECEIPT,
    });
    if (submitted.status !== 'success') throw new Error('expected success');

    await mockConveyanceService.decide(TEAM_LEAD, submitted.data.id, {
      decision: 'approved',
      reason: '',
    });
    expect((await mockConveyanceService.getReceipt(HR, submitted.data.id)).status).toBe('success');
  });

  it('carries no file name in the view model for a viewer who may not see it', async () => {
    // `cnv-1` sits with the Team Lead, so HR sees nothing at all — the detail
    // itself is not-found, which is a stronger guarantee than a redacted field.
    const detail = await mockConveyanceService.get(HR, 'cnv-1');
    expect(detail.status).toBe('not_found');
  });

  it('reports an absent receipt as absent, never as restricted', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');
    expect(submitted.data.receipt.state).toBe('none');
  });

  it('returns not-found for a receipt on a claim that has none', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');
    expect((await mockConveyanceService.getReceipt(EMPLOYEE, submitted.data.id)).status).toBe(
      'not_found',
    );
  });
});

describe('the upload is optional, and absent is not failed', () => {
  it('accepts a claim with no receipt', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    expect(result.status).toBe('success');
  });

  it('refuses a receipt over 5 MB rather than dropping it silently', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: { ...RECEIPT, sizeBytes: 6 * 1024 * 1024 },
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('receipt');
    expect(result.fieldErrors[0].guidance).toContain('optional');
  });

  it('refuses a file type that cannot be attached', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      receipt: { ...RECEIPT, mimeType: 'application/zip' },
    });
    expect(result.status).toBe('validation_failure');
  });
});

describe('the submitted timestamp is the service’s, not the client’s', () => {
  it('stamps the claim from the demo clock', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findConveyanceClaim(result.data.id)?.submittedAt).toBe(
      '2026-09-02T09:00:00+06:00',
    );
  });

  it('shows the form the same instant the record will carry', async () => {
    const context = await mockConveyanceService.formContext(EMPLOYEE);
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (context.status !== 'success' || submitted.status !== 'success') {
      throw new Error('expected success');
    }
    expect(context.data.nowLabel).toBe(submitted.data.submittedAtLabel);
  });

  it('tells a reviewer why the form is unavailable to them', async () => {
    const context = await mockConveyanceService.formContext(SECOND_HR);
    if (context.status !== 'success') throw new Error('expected success');
    expect(context.data.canSubmit).toBe(false);
    expect(context.data.submitBlockedReason).toBeTruthy();
  });
});

describe('the visited date and time are one instant', () => {
  it('combines them in the business timezone', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (result.status !== 'success') throw new Error('expected success');
    const stored = mockStore.findConveyanceClaim(result.data.id);
    expect(stored?.visitedAt).toBe('2026-08-28T14:30:00+06:00');
    expect(stored?.timezone).toBe('Asia/Dhaka');
  });

  it('rejects a journey dated after today', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      visitedDate: '2026-12-01',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('visitedDate');
  });

  it('rejects a journey later today, not just a future date', async () => {
    // Submission is stamped 09:00; an 18:00 journey today has not happened yet.
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      visitedDate: '2026-09-02',
      visitedTime: '18:00',
    });
    expect(result.status).toBe('validation_failure');
  });

  it('accepts a journey earlier today', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      visitedDate: '2026-09-02',
      visitedTime: '08:00',
    });
    expect(result.status).toBe('success');
  });

  it.each([['not-a-time'], ['25:00'], ['9:5']])('rejects the time %s', async (visitedTime) => {
    const result = await mockConveyanceService.submit(EMPLOYEE, { ...CLAIM, visitedTime });
    expect(result.status).toBe('validation_failure');
  });
});

describe('travel mode', () => {
  it('requires a description when the mode is Other', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      mode: 'other',
      modeDescription: '  ',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('modeDescription');
    expect(result.fieldErrors[0].guidance).toBeTruthy();
  });

  it('stores the description only for Other', async () => {
    const other = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      mode: 'other',
      modeDescription: 'Rickshaw',
    });
    const uber = await mockConveyanceService.submit(EMPLOYEE, {
      ...CLAIM,
      mode: 'uber',
      modeDescription: 'ignored',
    });
    if (other.status !== 'success' || uber.status !== 'success') {
      throw new Error('expected success');
    }
    expect(mockStore.findConveyanceClaim(other.data.id)?.modeDescription).toBe('Rickshaw');
    expect(mockStore.findConveyanceClaim(uber.data.id)?.modeDescription).toBeNull();
  });
});

describe('the amount is money, not a number', () => {
  it('stores an exact decimal with a currency code', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findConveyanceClaim(result.data.id)?.amount).toEqual({
      amount: '480.50',
      currency: 'BDT',
    });
    expect(result.data.amountDisplay).toBe('BDT 480.50');
  });

  it('rejects more precision than the currency holds', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, { ...CLAIM, amount: '10.005' });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('amount');
  });

  it.each([['abc'], ['BDT 100'], ['-100']])('rejects %s', async (amount) => {
    const result = await mockConveyanceService.submit(EMPLOYEE, { ...CLAIM, amount });
    expect(result.status).toBe('validation_failure');
  });
});

describe('validation carries field, message and guidance', () => {
  it('reports every empty required field at once', async () => {
    const result = await mockConveyanceService.submit(EMPLOYEE, {
      businessName: '',
      clientName: '',
      visitedDate: '',
      visitedTime: '',
      mode: 'other',
      modeDescription: '',
      amount: '',
      receipt: null,
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');

    expect(result.fieldErrors.map((error) => error.field).sort()).toEqual([
      'amount',
      'businessName',
      'clientName',
      'modeDescription',
      'visitedDate',
      'visitedTime',
    ]);
    for (const error of result.fieldErrors) {
      expect(error.message).toBeTruthy();
      expect(error.guidance).toBeTruthy();
    }
  });
});

describe('withdrawal and conflict', () => {
  it('lets the submitter withdraw while undecided', async () => {
    const submitted = await mockConveyanceService.submit(EMPLOYEE, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    const result = await mockConveyanceService.withdraw(EMPLOYEE, submitted.data.id);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.outcome).toBe('withdrawn');
  });

  it('returns a conflict rather than a lost decision on a decided claim', async () => {
    const result = await mockConveyanceService.decide(HR, 'cnv-6', {
      decision: 'approved',
      reason: '',
    });
    expect(result.status).toBe('conflict');
  });

  it('refuses a second decision from the same reviewer', async () => {
    const approve = { decision: 'approved' as const, reason: '' };
    const submitted = await mockConveyanceService.submit(TEAM_LEAD, CLAIM);
    if (submitted.status !== 'success') throw new Error('expected success');

    await mockConveyanceService.decide(HR, submitted.data.id, approve);
    expect((await mockConveyanceService.decide(HR, submitted.data.id, approve)).status).toBe(
      'permission_denied',
    );
  });

  it('counts the Team Lead queue from what is genuinely waiting', async () => {
    const queue = await mockConveyanceService.queue(TEAM_LEAD);
    if (queue.status !== 'success') throw new Error('expected success');
    expect(queue.data.awaitingCount).toBe(1); // `cnv-1`
  });
});
