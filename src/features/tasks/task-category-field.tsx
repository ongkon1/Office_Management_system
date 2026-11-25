'use client';

import { Field } from '@/components/forms/field';
import { Select2 } from '@/components/forms/select2';
import { useAsync } from '@/lib/use-async';
import { taskCategories } from '@/services/server/task-categories';

export function TaskCategoryField({ value, onChange, error }: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  error?: string;
}) {
  const { state } = useAsync(() => taskCategories({ action: 'list' }), []);
  const categories = state.status === 'success' ? state.data : [];
  return (
    <Field label="Task category" error={error} helperText={
      state.status === 'loading' ? 'Loading categories…'
        : state.status !== 'success' ? 'Categories are unavailable. Reopen the form to retry.'
        : categories.length === 0 ? 'No active categories have been added.' : undefined
    }>
      <Select2
        options={categories.map(category => ({ value: category.id, label: category.name }))}
        value={value ?? ''}
        onChange={id => onChange(id || null)}
        disabled={categories.length === 0}
      />
    </Field>
  );
}
