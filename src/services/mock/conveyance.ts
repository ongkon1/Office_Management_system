/**
 * Mock conveyance service (`FE-0762`, `FE-0767`, `FE-0769`, `FE-0771`).
 *
 * The approval chain is `./approval-chain`, shared with requisition. What is
 * specific to a travel claim, and enforced here:
 *
 * - **The submitted instant is assigned here, never accepted from the client.**
 *   A claim whose own timestamp the claimant chooses is not evidence of
 *   anything. It also keeps the demo reproducible, since the demo clock is
 *   pinned rather than being whatever the browser says.
 * - **The visited date and time are two controls but one instant**, combined in
 *   the business timezone and refused when in the future — a journey that has
 *   not happened cannot be claimed for.
 * - **The receipt is deny-by-default attachment data.** It is reachable only by
 *   the people who can see the claim, and `getReceipt` re-checks rather than
 *   trusting that a screen omitted the link.
 */

import type {
  ConveyanceClaim,
  ConveyanceDetailView,
  ConveyanceFormContextView,
  ConveyanceFormInput,
  ConveyanceListView,
  ConveyanceRowView,
  ConveyanceService,
  ReceiptFile,
  ReceiptView,
} from '@/contracts/conveyance';
import {
  ACCEPTED_RECEIPT_TYPES,
  MAX_RECEIPT_BYTES,
  TRAVEL_MODE_LABEL,
} from '@/contracts/conveyance';
import type { ApprovalReview } from '@/contracts/approval';
import type { FieldError } from '@/contracts/results';
import { success } from '@/contracts/results';
import {
  formatDate,
  formatMoney,
  formatTimestamp,
  parseIsoDate,
} from '@/lib/format';
import { money } from '@/lib/money';
import { DEMO_TODAY, STANDARD_POLICY } from '@/fixtures';
import { mockStore } from './store';
import {
  applyDecision,
  canDecide,
  canView,
  chainConflict,
  chainDenied,
  chainNotFound,
  employeeName,
  initialStage,
  nextStep,
  reviewerRoleOf,
  scopeLabel,
  stageLabel,
  submitBlockedReason,
  teamLeadOf,
  toTimelineView,
  viewerOf,
} from './approval-chain';

const LATENCY_MS = 140;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

const SUBJECT = 'conveyance claim';

/**
 * The submission instant.
 *
 * Derived from the pinned demo clock rather than `Date.now()`, so a demo run is
 * reproducible and the read-only field on the form shows the same value the
 * record will carry. In the backend milestone this becomes the server clock;
 * what does not change is that the client never supplies it.
 */
function submissionInstant(): string {
  return `${DEMO_TODAY}T09:00:00+06:00`;
}

function notFound() {
  return chainNotFound('conveyance', 'Conveyance claim');
}

function invalid(fieldErrors: readonly FieldError[]) {
  return {
    status: 'validation_failure' as const,
    code: 'VALIDATION_FAILED' as const,
    message:
      fieldErrors.length === 1
        ? fieldErrors[0].message
        : `${fieldErrors.length} fields need attention before this can be submitted.`,
    focusField: fieldErrors[0]?.field,
    fieldErrors,
  };
}

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function typeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/jpeg') return 'JPEG';
  return 'File';
}

function visitedLabel(claim: ConveyanceClaim): string {
  return `${formatDate(claim.visitedDate)} at ${claim.visitedTime}`;
}

/**
 * The receipt as this viewer may see it.
 *
 * Reached only after `canView` has already passed, so the `restricted` branch
 * is defensive rather than routine — but it exists because the alternative is a
 * type that cannot express "you may not see this", which is how a file name
 * leaks into a view model someone later renders.
 */
function receiptView(userId: string, claim: ConveyanceClaim): ReceiptView {
  if (!canView(userId, claim)) return { state: 'restricted' };
  if (!claim.receipt) return { state: 'none' };
  return {
    state: 'attached',
    fileName: claim.receipt.fileName,
    sizeLabel: sizeLabel(claim.receipt.sizeBytes),
    typeLabel: typeLabel(claim.receipt.mimeType),
    href: `/conveyance/${claim.id}?receipt=${claim.receipt.id}`,
  };
}

function toRowView(userId: string, claim: ConveyanceClaim): ConveyanceRowView {
  return {
    id: claim.id,
    reference: claim.reference,
    businessName: claim.businessName,
    clientName: claim.clientName,
    visitedLabel: visitedLabel(claim),
    modeLabel: TRAVEL_MODE_LABEL[claim.mode],
    amountDisplay: formatMoney(claim.amount),
    submitterName: employeeName(claim.submitterEmployeeId),
    submittedAtLabel: formatTimestamp(claim.submittedAt),
    hasReceipt: claim.receipt !== null,
    stage: claim.stage,
    stageLabel: stageLabel(claim),
    outcome: claim.outcome,
    nextStep: nextStep(claim, SUBJECT),
    awaitingThisViewer: canDecide(userId, claim),
    href: `/conveyance/${claim.id}`,
  };
}

function toDetailView(userId: string, claim: ConveyanceClaim): ConveyanceDetailView {
  return {
    ...toTimelineView(userId, claim, SUBJECT),
    id: claim.id,
    reference: claim.reference,
    businessName: claim.businessName,
    clientName: claim.clientName,
    visitedLabel: visitedLabel(claim),
    visitedDateLabel: formatDate(claim.visitedDate),
    visitedTimeLabel: claim.visitedTime,
    modeLabel: TRAVEL_MODE_LABEL[claim.mode],
    modeDescription: claim.modeDescription,
    amountDisplay: formatMoney(claim.amount),
    receipt: receiptView(userId, claim),
    submitterName: employeeName(claim.submitterEmployeeId),
    submitterRoleLabel: claim.submitterRole === 'team_lead' ? 'Team Lead' : 'Employee',
    submittedAtLabel: formatTimestamp(claim.submittedAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function validate(input: ConveyanceFormInput): FieldError[] {
  const errors: FieldError[] = [];

  const required = (field: keyof ConveyanceFormInput, label: string, guidance: string) => {
    if (!String(input[field] ?? '').trim()) {
      errors.push({ field, code: 'REQUIRED', message: `${label} is required.`, guidance });
    }
  };

  required('businessName', 'Business name', 'Enter the business you travelled to.');
  required('clientName', 'Client name', 'Enter the client this journey was for.');

  // A mode of "Other" with no detail is unusable for the reviewer who has to
  // decide on it, so the description is required exactly when it applies.
  if (input.mode === 'other' && !input.modeDescription.trim()) {
    errors.push({
      field: 'modeDescription',
      code: 'REQUIRED',
      message: 'A description is required when the mode is Other.',
      guidance: 'Say how you travelled, for example "Rickshaw" or "Company car".',
    });
  }

  const rawDate = input.visitedDate.trim();
  const rawTime = input.visitedTime.trim();

  if (!rawDate) {
    errors.push({
      field: 'visitedDate',
      code: 'REQUIRED',
      message: 'Visited date is required.',
      guidance: 'Choose the date you made the journey.',
    });
  } else if (!parseIsoDate(rawDate)) {
    errors.push({
      field: 'visitedDate',
      code: 'INVALID_DATE',
      message: 'Visited date is not a date.',
      guidance: 'Use the format YYYY-MM-DD, for example 2026-08-31.',
    });
  }

  if (!rawTime) {
    errors.push({
      field: 'visitedTime',
      code: 'REQUIRED',
      message: 'Time is required.',
      guidance: 'Enter the time you travelled, as HH:MM in 24-hour form.',
    });
  } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)) {
    errors.push({
      field: 'visitedTime',
      code: 'INVALID_TIME',
      message: 'Time is not a time.',
      guidance: 'Use 24-hour HH:MM, for example 14:30.',
    });
  }

  // Two controls, one instant. A journey that has not happened yet cannot be
  // claimed for, and the comparison has to include the time — otherwise a
  // claim made later today for a trip "this evening" slips through.
  if (rawDate && rawTime && parseIsoDate(rawDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)) {
    const submittedAt = submissionInstant();
    const visitedAt = `${rawDate}T${rawTime}:00+06:00`;
    if (visitedAt > submittedAt) {
      errors.push({
        field: 'visitedDate',
        code: 'FUTURE_JOURNEY',
        message: 'The visited date and time are in the future.',
        guidance: 'You can only claim for a journey you have already made. Check the date and time.',
      });
    }
  }

  const rawAmount = input.amount.trim().replace(/,/g, '');
  if (!rawAmount) {
    errors.push({
      field: 'amount',
      code: 'REQUIRED',
      message: 'Amount is required.',
      guidance: 'Enter what the journey cost in BDT, for example 480 or 480.50.',
    });
  } else {
    try {
      const parsed = money(rawAmount, 'BDT');
      if (parsed.amount.startsWith('-')) {
        errors.push({
          field: 'amount',
          code: 'NEGATIVE_AMOUNT',
          message: 'Amount cannot be negative.',
          guidance: 'Enter the cost as a positive figure, for example 480.',
        });
      }
    } catch {
      errors.push({
        field: 'amount',
        code: 'INVALID_AMOUNT',
        message: 'Amount is not an amount this system can store exactly.',
        guidance:
          'Use digits with at most two decimal places and no currency symbol, for example 480 or 480.50.',
      });
    }
  }

  // The upload is optional, so an absent receipt is never an error. A receipt
  // that *was* chosen and cannot be accepted is — silently dropping it would
  // produce a claim the submitter believes has evidence attached.
  if (input.receipt) {
    if (input.receipt.sizeBytes > MAX_RECEIPT_BYTES) {
      errors.push({
        field: 'receipt',
        code: 'FILE_TOO_LARGE',
        message: 'That receipt is larger than 5 MB.',
        guidance: 'Attach a smaller file, or submit without one — the receipt is optional.',
      });
    } else if (!ACCEPTED_RECEIPT_TYPES.includes(input.receipt.mimeType as never)) {
      errors.push({
        field: 'receipt',
        code: 'FILE_TYPE',
        message: 'That file type cannot be attached.',
        guidance: 'Attach a JPEG, PNG or PDF, or submit without one — the receipt is optional.',
      });
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

let sequence = 200;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export const mockConveyanceService: ConveyanceService = {
  async list(userId) {
    await delay();
    if (!viewerOf(userId)) return notFound();

    // Authorization before aggregation: the count is derived from rows that
    // already survived the filter (`REQ-SRCH-003`).
    const rows = mockStore
      .conveyanceClaims()
      .filter((claim) => canView(userId, claim))
      .map((claim) => toRowView(userId, claim));

    const blocked = submitBlockedReason(userId, SUBJECT);
    const view: ConveyanceListView = {
      rows,
      awaitingCount: rows.filter((row) => row.awaitingThisViewer).length,
      canSubmit: blocked === null,
      submitBlockedReason: blocked,
      scopeLabel: scopeLabel(userId, 'Conveyance claims'),
    };
    return success(view);
  },

  async formContext(userId) {
    await delay();
    if (!viewerOf(userId)) return notFound();
    const blocked = submitBlockedReason(userId, SUBJECT);
    const view: ConveyanceFormContextView = {
      nowLabel: formatTimestamp(submissionInstant()),
      timezone: STANDARD_POLICY.businessTimezone,
      canSubmit: blocked === null,
      submitBlockedReason: blocked,
      maxVisitedDate: DEMO_TODAY,
    };
    return success(view);
  },

  async get(userId, claimId) {
    await delay();
    const claim = mockStore.findConveyanceClaim(claimId);
    if (!claim || !canView(userId, claim)) return notFound();
    return success(toDetailView(userId, claim));
  },

  async getReceipt(userId, claimId) {
    await delay();
    const claim = mockStore.findConveyanceClaim(claimId);
    // The receipt inherits the claim's visibility exactly. Asking for it
    // directly is the access path that matters, and it is refused here rather
    // than by a screen choosing not to render a link.
    if (!claim || !canView(userId, claim) || !claim.receipt) return notFound();
    return success(claim.receipt);
  },

  async submit(userId, input) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    const role = viewer.primaryRole;
    if (role !== 'employee' && role !== 'team_lead') {
      return chainDenied(
        'Only an Employee or a Team Lead can submit a conveyance claim.',
        'You can review the claims that reach you.',
      );
    }

    const errors = validate(input);
    if (errors.length > 0) return invalid(errors);

    const isTeamLead = role === 'team_lead';
    const teamLeadEmployeeId = isTeamLead ? null : teamLeadOf(viewer.employeeId);
    if (!isTeamLead && !teamLeadEmployeeId) {
      return chainConflict(
        'You have no Team Lead assigned, so this claim has nowhere to go.',
        'Ask HR to record your Team Lead, then submit the claim again.',
      );
    }

    const submittedAt = submissionInstant();
    const visitedDate = input.visitedDate.trim();
    const visitedTime = input.visitedTime.trim();

    const receipt: ReceiptFile | null = input.receipt
      ? {
          id: nextId('rcp'),
          fileName: input.receipt.fileName,
          sizeBytes: input.receipt.sizeBytes,
          mimeType: input.receipt.mimeType,
          uploadedAt: submittedAt,
        }
      : null;

    const claim: ConveyanceClaim = {
      id: nextId('cnv'),
      reference: `CV-2026-${String(mockStore.conveyanceClaims().length + 1).padStart(3, '0')}`,
      submitterUserId: userId,
      submitterEmployeeId: viewer.employeeId,
      submitterRole: role,
      teamLeadEmployeeId,
      businessName: input.businessName.trim(),
      clientName: input.clientName.trim(),
      visitedAt: `${visitedDate}T${visitedTime}:00+06:00`,
      visitedDate,
      visitedTime,
      timezone: STANDARD_POLICY.businessTimezone,
      mode: input.mode,
      modeDescription: input.mode === 'other' ? input.modeDescription.trim() : null,
      amount: money(input.amount.trim().replace(/,/g, ''), 'BDT'),
      receipt,
      stage: initialStage(role),
      outcome: null,
      submittedAt,
      decidedAt: null,
      reviews: [],
    };

    mockStore.addConveyanceClaim(claim);
    return success(toDetailView(userId, claim));
  },

  async decide(userId, claimId, input) {
    await delay();
    const viewer = viewerOf(userId);
    const claim = mockStore.findConveyanceClaim(claimId);
    if (!viewer || !claim || !canView(userId, claim)) return notFound();

    if (claim.stage === 'decided') {
      return chainConflict(
        `This claim has already been ${claim.outcome ?? 'decided'}.`,
        'Reload the page to see the recorded decision.',
      );
    }

    if (!canDecide(userId, claim)) {
      return chainDenied(
        'This claim is not waiting for your decision.',
        'It either has not reached your stage yet, or you have already decided on it.',
      );
    }

    if (input.decision === 'rejected' && !input.reason.trim()) {
      return invalid([
        {
          field: 'reason',
          code: 'REQUIRED',
          message: 'A reason is required when rejecting.',
          guidance: 'Say why it was rejected so the person who claimed knows what to do next.',
        },
      ]);
    }

    const role = reviewerRoleOf(userId);
    if (!role) return notFound();

    const review: ApprovalReview = {
      id: nextId('cvr'),
      reviewerUserId: userId,
      reviewerEmployeeId: viewer.employeeId,
      reviewerRole: role,
      decision: input.decision,
      reason: input.reason.trim() || null,
      decidedAt: `${DEMO_TODAY}T11:30:00+06:00`,
    };

    const next: ConveyanceClaim = { ...claim, ...applyDecision(claim, review) };
    mockStore.updateConveyanceClaim(claim.id, next);
    return success(toDetailView(userId, next));
  },

  async withdraw(userId, claimId) {
    await delay();
    const claim = mockStore.findConveyanceClaim(claimId);
    if (!claim || !canView(userId, claim)) return notFound();

    if (claim.submitterUserId !== userId) {
      return chainDenied(
        'Only the person who submitted a claim can withdraw it.',
        'Ask them to withdraw it, or record a decision instead.',
      );
    }

    if (claim.stage === 'decided') {
      return chainConflict(
        `This claim has already been ${claim.outcome ?? 'decided'}.`,
        'A decided claim cannot be withdrawn. Submit a new one if it is still needed.',
      );
    }

    const next: ConveyanceClaim = {
      ...claim,
      stage: 'decided',
      outcome: 'withdrawn',
      decidedAt: `${DEMO_TODAY}T11:30:00+06:00`,
    };
    mockStore.updateConveyanceClaim(claim.id, next);
    return success(toDetailView(userId, next));
  },

  async queue(userId) {
    await delay();
    if (!viewerOf(userId)) return notFound();
    const awaitingCount = mockStore
      .conveyanceClaims()
      .filter((claim) => canView(userId, claim) && canDecide(userId, claim)).length;
    return success({ awaitingCount, href: '/conveyance' });
  },
};

/** Test seam mirroring the other mock services. */
export function resetConveyanceState(): void {
  sequence = 200;
}
