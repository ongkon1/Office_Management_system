/**
 * Mock requisition service (`FE-0741`, `FE-0747`, `FE-0749`, `FE-0750`).
 *
 * The approval chain — who may see a requisition, who may decide on it now, and
 * what a decision does — lives in `./approval-chain`, shared with conveyance
 * (`FE-0760`). What remains here is what is genuinely a requisition: its two
 * forms, its validation, and its presentation.
 *
 * The one rule still enforced here rather than in the chain is the amount. The
 * form sends free text, as specified; it becomes `Money` at this boundary or
 * the submission fails with guidance, so a bare number never reaches a record.
 */

import type {
  Requisition,
  RequisitionDetailView,
  RequisitionFormInput,
  RequisitionListView,
  RequisitionRowView,
  RequisitionService,
} from '@/contracts/requisition';
import { REQUISITION_KIND_LABEL } from '@/contracts/requisition';
import type { ApprovalReview } from '@/contracts/approval';
import type { FieldError } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate, formatMoney, formatTimestamp, parseIsoDate } from '@/lib/format';
import { money } from '@/lib/money';
import { DEMO_TODAY } from '@/fixtures';
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

const SUBJECT = 'requisition';

function notFound() {
  return chainNotFound('requisition', 'Requisition');
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

function toRowView(userId: string, requisition: Requisition): RequisitionRowView {
  return {
    id: requisition.id,
    reference: requisition.reference,
    kind: requisition.kind,
    kindLabel: REQUISITION_KIND_LABEL[requisition.kind],
    itemName: requisition.itemName,
    purpose: requisition.purpose,
    urgency: requisition.urgency,
    submitterName: employeeName(requisition.submitterEmployeeId),
    submittedAtLabel: formatTimestamp(requisition.submittedAt),
    amountDisplay: formatMoney(requisition.approxAmount),
    stage: requisition.stage,
    stageLabel: stageLabel(requisition),
    outcome: requisition.outcome,
    nextStep: nextStep(requisition, SUBJECT),
    awaitingThisViewer: canDecide(userId, requisition),
    href: `/requisitions/${requisition.id}`,
  };
}

function toDetailView(userId: string, requisition: Requisition): RequisitionDetailView {
  return {
    ...toTimelineView(userId, requisition, SUBJECT),
    id: requisition.id,
    reference: requisition.reference,
    kind: requisition.kind,
    kindLabel: REQUISITION_KIND_LABEL[requisition.kind],
    itemName: requisition.itemName,
    purpose: requisition.purpose,
    urgency: requisition.urgency,
    modelName: requisition.modelName,
    amountDisplay: formatMoney(requisition.approxAmount),
    lastRecoverDateLabel: requisition.lastRecoverDate
      ? formatDate(requisition.lastRecoverDate)
      : null,
    submitterName: employeeName(requisition.submitterEmployeeId),
    submitterRoleLabel: requisition.submitterRole === 'team_lead' ? 'Team Lead' : 'Employee',
    submittedAtLabel: formatTimestamp(requisition.submittedAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Field-level validation.
 *
 * Every failure carries a field, a message *and* corrective guidance, because
 * `REQ-TIME-025` requires all three and a form that only says "invalid" leaves
 * the person guessing.
 */
function validate(input: RequisitionFormInput): FieldError[] {
  const errors: FieldError[] = [];

  const required = (
    field: keyof RequisitionFormInput,
    label: string,
    guidance: string,
  ) => {
    if (!String(input[field] ?? '').trim()) {
      errors.push({
        field,
        code: 'REQUIRED',
        message: `${label} is required.`,
        guidance,
      });
    }
  };

  required('itemName', 'Name', 'Enter the name of the item being requested.');
  required('purpose', 'Purpose', 'Say why the item is needed.');
  required('urgency', 'Urgency', 'State how urgent this is, for example High, Medium or Low.');
  required('modelName', 'Model', 'Enter the model, or "Unknown" if it has not been chosen yet.');

  // Money is never a bare number here. The field is text, as specified, so the
  // parse happens once, at the boundary, and a value that cannot be represented
  // exactly is refused rather than rounded into the record.
  const rawAmount = input.approxAmount.trim().replace(/,/g, '');
  if (!rawAmount) {
    errors.push({
      field: 'approxAmount',
      code: 'REQUIRED',
      message: 'Approx amount is required.',
      guidance: 'Enter an approximate cost in BDT, for example 4500 or 4500.50.',
    });
  } else {
    try {
      const parsed = money(rawAmount, 'BDT');
      if (parsed.amount.startsWith('-')) {
        errors.push({
          field: 'approxAmount',
          code: 'NEGATIVE_AMOUNT',
          message: 'Approx amount cannot be negative.',
          guidance: 'Enter the cost as a positive figure, for example 4500.',
        });
      }
    } catch {
      errors.push({
        field: 'approxAmount',
        code: 'INVALID_AMOUNT',
        message: 'Approx amount is not an amount this system can store exactly.',
        guidance:
          'Use digits with at most two decimal places and no currency symbol, for example 4500 or 4500.50.',
      });
    }
  }

  if (input.kind === 'in_house') {
    const rawDate = input.lastRecoverDate.trim();
    if (!rawDate) {
      errors.push({
        field: 'lastRecoverDate',
        code: 'REQUIRED',
        message: 'Last recover date is required for an in-house requisition.',
        guidance: 'Enter the date the item was last recovered, as YYYY-MM-DD.',
      });
    } else if (!parseIsoDate(rawDate)) {
      errors.push({
        field: 'lastRecoverDate',
        code: 'INVALID_DATE',
        message: 'Last recover date is not a date.',
        guidance: 'Use the format YYYY-MM-DD, for example 2026-03-14.',
      });
    } else if (rawDate > DEMO_TODAY) {
      errors.push({
        field: 'lastRecoverDate',
        code: 'FUTURE_DATE',
        message: 'Last recover date is in the future.',
        guidance: 'An item cannot have been recovered after today. Check the date.',
      });
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

let sequence = 100;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export const mockRequisitionService: RequisitionService = {
  async list(userId) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    // Authorization before aggregation: `awaitingCount` is computed from rows
    // that survived the filter, so a count can never reveal a requisition the
    // viewer cannot open (`REQ-SRCH-003`).
    const rows = mockStore
      .requisitions()
      .filter((requisition) => canView(userId, requisition))
      .map((requisition) => toRowView(userId, requisition));

    const blocked = submitBlockedReason(userId, SUBJECT);
    const view: RequisitionListView = {
      rows,
      awaitingCount: rows.filter((row) => row.awaitingThisViewer).length,
      canSubmit: blocked === null,
      submitBlockedReason: blocked,
      scopeLabel: scopeLabel(userId, 'Requisitions'),
    };
    return success(view);
  },

  async get(userId, requisitionId) {
    await delay();
    const requisition = mockStore.findRequisition(requisitionId);
    // A requisition the viewer may not see is indistinguishable from one that
    // does not exist. Both take the same path, so timing matches too.
    if (!requisition || !canView(userId, requisition)) return notFound();
    return success(toDetailView(userId, requisition));
  },

  async submit(userId, input) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    const role = viewer.primaryRole;
    if (role !== 'employee' && role !== 'team_lead') {
      return chainDenied(
        'Only an Employee or a Team Lead can raise a requisition.',
        'If you need an item, ask an employee in your division to raise it.',
      );
    }

    const errors = validate(input);
    if (errors.length > 0) return invalid(errors);

    const isTeamLead = role === 'team_lead';
    const teamLeadEmployeeId = isTeamLead ? null : teamLeadOf(viewer.employeeId);

    if (!isTeamLead && !teamLeadEmployeeId) {
      return chainConflict(
        'You have no Team Lead assigned, so this requisition has nowhere to go.',
        'Ask HR to record your Team Lead, then raise the requisition again.',
      );
    }

    const submittedAt = `${DEMO_TODAY}T09:00:00+06:00`;
    const requisition: Requisition = {
      id: nextId('req'),
      reference: `RQ-2026-${String(mockStore.requisitions().length + 1).padStart(3, '0')}`,
      kind: input.kind,
      submitterUserId: userId,
      submitterEmployeeId: viewer.employeeId,
      submitterRole: role,
      teamLeadEmployeeId,
      itemName: input.itemName.trim(),
      purpose: input.purpose.trim(),
      urgency: input.urgency.trim(),
      approxAmount: money(input.approxAmount.trim().replace(/,/g, ''), 'BDT'),
      modelName: input.modelName.trim(),
      lastRecoverDate: input.kind === 'in_house' ? input.lastRecoverDate.trim() : null,
      stage: initialStage(role),
      outcome: null,
      submittedAt,
      decidedAt: null,
      reviews: [],
    };

    mockStore.addRequisition(requisition);
    return success(toDetailView(userId, requisition));
  },

  async decide(userId, requisitionId, input) {
    await delay();
    const viewer = viewerOf(userId);
    const requisition = mockStore.findRequisition(requisitionId);
    if (!viewer || !requisition || !canView(userId, requisition)) return notFound();

    if (requisition.stage === 'decided') {
      return chainConflict(
        `This requisition has already been ${requisition.outcome ?? 'decided'}.`,
        'Reload the page to see the recorded decision.',
      );
    }

    if (!canDecide(userId, requisition)) {
      return chainDenied(
        'This requisition is not waiting for your decision.',
        'It either has not reached your stage yet, or you have already decided on it.',
      );
    }

    if (input.decision === 'rejected' && !input.reason.trim()) {
      return invalid([
        {
          field: 'reason',
          code: 'REQUIRED',
          message: 'A reason is required when rejecting.',
          guidance: 'Say why it was rejected so the person who raised it knows what to do next.',
        },
      ]);
    }

    const role = reviewerRoleOf(userId);
    if (!role) return notFound();

    const review: ApprovalReview = {
      id: nextId('rqr'),
      reviewerUserId: userId,
      reviewerEmployeeId: viewer.employeeId,
      reviewerRole: role,
      decision: input.decision,
      reason: input.reason.trim() || null,
      decidedAt: `${DEMO_TODAY}T11:30:00+06:00`,
    };

    const next: Requisition = { ...requisition, ...applyDecision(requisition, review) };
    mockStore.updateRequisition(requisition.id, next);
    return success(toDetailView(userId, next));
  },

  async withdraw(userId, requisitionId) {
    await delay();
    const requisition = mockStore.findRequisition(requisitionId);
    if (!requisition || !canView(userId, requisition)) return notFound();

    if (requisition.submitterUserId !== userId) {
      return chainDenied(
        'Only the person who raised a requisition can withdraw it.',
        'Ask them to withdraw it, or record a decision instead.',
      );
    }

    if (requisition.stage === 'decided') {
      return chainConflict(
        `This requisition has already been ${requisition.outcome ?? 'decided'}.`,
        'A decided requisition cannot be withdrawn. Raise a new one if it is still needed.',
      );
    }

    const next: Requisition = {
      ...requisition,
      stage: 'decided',
      outcome: 'withdrawn',
      decidedAt: `${DEMO_TODAY}T11:30:00+06:00`,
    };
    mockStore.updateRequisition(requisition.id, next);
    return success(toDetailView(userId, next));
  },

  async queue(userId) {
    await delay();
    if (!viewerOf(userId)) return notFound();
    const awaitingCount = mockStore
      .requisitions()
      .filter((requisition) => canView(userId, requisition) && canDecide(userId, requisition))
      .length;
    return success({ awaitingCount, href: '/requisitions' });
  },
};

/** Test seam mirroring the other mock services. */
export function resetRequisitionState(): void {
  sequence = 100;
}

