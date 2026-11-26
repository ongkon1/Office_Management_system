'use client';

import { Field } from '@/components/forms/field';
import { Select } from '@/components/forms/inputs';
import { isTaskBillingType, TASK_BILLING_OPTIONS, type TaskBillingType } from '@/contracts/task-billing';

export function TaskBillingField({ value, onChange, error }: {
  value?: TaskBillingType;
  onChange: (value: TaskBillingType) => void;
  error?: string;
}) {
  return (
    <Field label="Billing type" error={error}>
      <Select name="billingType" value={value ?? ''} placeholder="Select billing type"
        options={TASK_BILLING_OPTIONS} onChange={event => {
          const selected = event.target.value;
          if (isTaskBillingType(selected)) onChange(selected);
        }} />
    </Field>
  );
}
