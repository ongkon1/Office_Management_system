export const TASK_BILLING_LABELS = {
  billable: 'Billable',
  non_billable: 'Non-billable',
} as const;

export type TaskBillingType = keyof typeof TASK_BILLING_LABELS;

export const TASK_BILLING_OPTIONS = Object.entries(TASK_BILLING_LABELS)
  .map(([value, label]) => ({ value, label }));

export function isTaskBillingType(value: unknown): value is TaskBillingType {
  return value === 'billable' || value === 'non_billable';
}
