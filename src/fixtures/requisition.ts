/**
 * `FE-0741` — requisition fixtures.
 *
 * Chosen so every stage of the chain is on screen at once, including the two
 * that are easiest to get wrong:
 *
 * - `req-4` is a Team Lead's own requisition. It has **no** Team Lead review
 *   row, because that stage is skipped rather than auto-approved.
 * - `req-5` was rejected by Finance while HR had already approved, proving a
 *   rejection ends the chain without waiting for the Super Administrator.
 */

import type { Requisition } from '@/contracts/requisition';

export const REQUISITIONS: readonly Requisition[] = [
  /* Waiting for the Team Lead — the state that drives the dashboard tile. */
  {
    id: 'req-1',
    reference: 'RQ-2026-001',
    kind: 'in_house',
    submitterUserId: 'usr-1001',
    submitterEmployeeId: 'emp-1001',
    submitterRole: 'employee',
    teamLeadEmployeeId: 'emp-2001',
    itemName: 'Dell Latitude charger',
    purpose: 'Repair',
    urgency: 'High',
    approxAmount: { amount: '4500.00', currency: 'BDT' },
    modelName: 'Dell 65W USB-C',
    lastRecoverDate: '2026-03-14',
    stage: 'team_lead_review',
    outcome: null,
    submittedAt: '2026-09-01T10:12:00+06:00',
    decidedAt: null,
    reviews: [],
  },

  /* Team Lead approved; now with all three reviewers, none decided. */
  {
    id: 'req-2',
    reference: 'RQ-2026-002',
    kind: 'new',
    submitterUserId: 'usr-1002',
    submitterEmployeeId: 'emp-1002',
    submitterRole: 'employee',
    teamLeadEmployeeId: 'emp-2001',
    itemName: 'Second monitor',
    purpose: 'Two-screen work on the annotation review queue',
    urgency: 'Medium',
    approxAmount: { amount: '18750.50', currency: 'BDT' },
    modelName: 'Dell P2422H',
    lastRecoverDate: null,
    stage: 'reviewer_review',
    outcome: null,
    submittedAt: '2026-08-27T14:40:00+06:00',
    decidedAt: null,
    reviews: [
      {
        id: 'rqr-1',
        reviewerUserId: 'usr-2001',
        reviewerEmployeeId: 'emp-2001',
        reviewerRole: 'team_lead',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-28T09:05:00+06:00',
      },
    ],
  },

  /* Partly reviewed: HR has approved, Finance and the administrator have not. */
  {
    id: 'req-3',
    reference: 'RQ-2026-003',
    kind: 'in_house',
    submitterUserId: 'usr-1003',
    submitterEmployeeId: 'emp-1003',
    submitterRole: 'employee',
    teamLeadEmployeeId: 'emp-2001',
    itemName: 'Training room projector',
    purpose: 'Lost',
    urgency: 'Low',
    approxAmount: { amount: '62000.00', currency: 'BDT' },
    modelName: 'Epson EB-X51',
    lastRecoverDate: '2025-11-02',
    stage: 'reviewer_review',
    outcome: null,
    submittedAt: '2026-08-20T11:00:00+06:00',
    decidedAt: null,
    reviews: [
      {
        id: 'rqr-2',
        reviewerUserId: 'usr-2001',
        reviewerEmployeeId: 'emp-2001',
        reviewerRole: 'team_lead',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-21T08:30:00+06:00',
      },
      {
        id: 'rqr-3',
        reviewerUserId: 'usr-3001',
        reviewerEmployeeId: 'emp-3001',
        reviewerRole: 'hr_manager',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-24T15:12:00+06:00',
      },
    ],
  },

  /*
   * A Team Lead's own requisition. No Team Lead review row exists and none
   * should ever be added: the stage is skipped, not decided.
   */
  {
    id: 'req-4',
    reference: 'RQ-2026-004',
    kind: 'new',
    submitterUserId: 'usr-2001',
    submitterEmployeeId: 'emp-2001',
    submitterRole: 'team_lead',
    teamLeadEmployeeId: null,
    itemName: 'Standing desk converter',
    purpose: 'Back strain during long review sessions',
    urgency: 'Medium',
    approxAmount: { amount: '23000.00', currency: 'BDT' },
    modelName: 'Flexispot M7',
    lastRecoverDate: null,
    stage: 'reviewer_review',
    outcome: null,
    submittedAt: '2026-08-31T17:25:00+06:00',
    decidedAt: null,
    reviews: [],
  },

  /* Rejected by Finance after HR approved: one rejection ends the chain. */
  {
    id: 'req-5',
    reference: 'RQ-2026-005',
    kind: 'new',
    submitterUserId: 'usr-1004',
    submitterEmployeeId: 'emp-1004',
    submitterRole: 'employee',
    teamLeadEmployeeId: 'emp-2002',
    itemName: 'Noise-cancelling headset',
    purpose: 'Call quality on the records digitisation stand-ups',
    urgency: 'Low',
    approxAmount: { amount: '31200.00', currency: 'BDT' },
    modelName: 'Sony WH-1000XM5',
    lastRecoverDate: null,
    stage: 'decided',
    outcome: 'rejected',
    submittedAt: '2026-08-10T09:00:00+06:00',
    decidedAt: '2026-08-18T16:45:00+06:00',
    reviews: [
      {
        id: 'rqr-4',
        reviewerUserId: 'usr-2002',
        reviewerEmployeeId: 'emp-2002',
        reviewerRole: 'team_lead',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-11T10:10:00+06:00',
      },
      {
        id: 'rqr-5',
        reviewerUserId: 'usr-3001',
        reviewerEmployeeId: 'emp-3001',
        reviewerRole: 'hr_manager',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-14T11:20:00+06:00',
      },
      {
        id: 'rqr-6',
        reviewerUserId: 'usr-4001',
        reviewerEmployeeId: 'emp-4001',
        reviewerRole: 'finance_manager',
        decision: 'rejected',
        reason: 'Outside the quarter budget. Re-raise after 1 October.',
        decidedAt: '2026-08-18T16:45:00+06:00',
      },
    ],
  },

  /* Fully approved, so the completed timeline is demonstrable. */
  {
    id: 'req-6',
    reference: 'RQ-2026-006',
    kind: 'in_house',
    submitterUserId: 'usr-1002',
    submitterEmployeeId: 'emp-1002',
    submitterRole: 'employee',
    teamLeadEmployeeId: 'emp-2001',
    itemName: 'Mechanical keyboard',
    purpose: 'Repair',
    urgency: 'Low',
    approxAmount: { amount: '7800.00', currency: 'BDT' },
    modelName: 'Keychron K2',
    lastRecoverDate: '2026-01-19',
    stage: 'decided',
    outcome: 'approved',
    submittedAt: '2026-07-30T13:15:00+06:00',
    decidedAt: '2026-08-06T10:00:00+06:00',
    reviews: [
      {
        id: 'rqr-7',
        reviewerUserId: 'usr-2001',
        reviewerEmployeeId: 'emp-2001',
        reviewerRole: 'team_lead',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-07-31T09:40:00+06:00',
      },
      {
        id: 'rqr-8',
        reviewerUserId: 'usr-3001',
        reviewerEmployeeId: 'emp-3001',
        reviewerRole: 'hr_manager',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-03T14:05:00+06:00',
      },
      {
        id: 'rqr-9',
        reviewerUserId: 'usr-4001',
        reviewerEmployeeId: 'emp-4001',
        reviewerRole: 'finance_manager',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-05T11:30:00+06:00',
      },
      {
        id: 'rqr-10',
        reviewerUserId: 'usr-9001',
        reviewerEmployeeId: 'emp-9001',
        reviewerRole: 'super_admin',
        decision: 'approved',
        reason: null,
        decidedAt: '2026-08-06T10:00:00+06:00',
      },
    ],
  },
];
