'use client';

import * as React from 'react';
import type {
  DepartmentCatalogueRowView,
  DepartmentInput,
} from '@/contracts/organization-hierarchy';
import { mockDepartmentAdminService } from '@/services/mock/department-admin';
import { Dialog } from '@/components/feedback/overlay';
import { Alert, Callout } from '@/components/feedback/alert';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import {
  NO_FORM_FAILURE,
  fieldErrorFor,
  toFormFailure,
  type DepartmentFormFailure,
} from './department-shared';

const BLANK: DepartmentInput = { divisionId: 'pia', name: '', code: '', description: '' };

/**
 * Create and edit a department (`OH-FE-0203`).
 *
 * Three things the form does deliberately:
 *
 * - **It never caps a field with `maxLength`.** A cap silently truncates pasted
 *   text and makes the over-length refusal unreachable, so the limit is stated
 *   in words and the service enforces it.
 * - **It says which division uniqueness was checked against.** "Already exists"
 *   with no division reads as company-wide, and two divisions may each have a
 *   Sales department.
 * - **It does not decide whether the division may change.** The service answers
 *   that (`canChangeDivision`); the form disables the control and says why, and
 *   the service still refuses the change if it is attempted another way.
 */
export function DepartmentFormDialog({
  open,
  userId,
  editing,
  divisionOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: string;
  /** `null` creates. */
  editing: DepartmentCatalogueRowView | null;
  divisionOptions: readonly { readonly value: string; readonly label: string }[];
  onClose: () => void;
  onSaved: (message: string, description: string) => void;
}) {
  const [form, setForm] = React.useState<DepartmentInput>(BLANK);
  const [failure, setFailure] = React.useState<DepartmentFormFailure>(NO_FORM_FAILURE);
  const [saving, setSaving] = React.useState(false);

  /*
   * Seeding the fields during render rather than in an effect: an effect that
   * sets state paints the previous department's values for one frame, and the
   * React Compiler rejects the pattern outright.
   */
  const seedKey = open ? (editing?.department.id ?? 'new') : null;
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setFailure(NO_FORM_FAILURE);
    setForm(
      editing
        ? {
            divisionId: editing.division.id,
            name: editing.department.name,
            code: editing.department.code,
            description: editing.department.description ?? '',
          }
        : BLANK,
    );
  }

  const divisionName =
    divisionOptions.find((option) => option.value === form.divisionId)?.label ?? 'this division';
  const divisionLocked = Boolean(editing && !editing.canChangeDivision);

  async function save() {
    setSaving(true);
    setFailure(NO_FORM_FAILURE);
    const result = editing
      ? await mockDepartmentAdminService.update(userId, editing.department.id, form)
      : await mockDepartmentAdminService.create(userId, form);
    setSaving(false);

    if (result.status === 'success') {
      onSaved(
        editing ? 'Department updated' : 'Department created',
        `${result.data.department.name} · ${result.data.department.code} · ${result.data.division.name}`,
      );
      return;
    }
    setFailure(toFormFailure(result));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.department.name}` : 'New department'}
      description="A department belongs to one division. Its lead is appointed separately, so leadership history is kept."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {editing ? 'Save department' : 'Create department'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormErrorSummary errors={failure.fieldErrors} title="This department was not saved" />

        {failure.blocking && (
          <Alert tone="danger" title={failure.blocking.title} live>
            {failure.blocking.detail}
          </Alert>
        )}

        <Field
          label="Division"
          required
          disabled={divisionLocked}
          error={fieldErrorFor(failure, 'divisionId')}
          helperText={
            divisionLocked
              ? (editing?.referenceGuidance ??
                'This department is referenced, so it cannot move to another division.')
              : 'The department is available only to employees assigned to this division.'
          }
        >
          <Select
            name="divisionId"
            value={form.divisionId}
            options={divisionOptions.map((option) => ({ ...option }))}
            onChange={(event) => setForm({ ...form, divisionId: event.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            required
            error={fieldErrorFor(failure, 'name')}
            helperText={`Up to 60 characters, and unique inside ${divisionName}.`}
          >
            <Input
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>

          <Field
            label="Code"
            required
            error={fieldErrorFor(failure, 'code')}
            helperText={`2 to 12 letters, numbers or hyphens, and unique inside ${divisionName}.`}
          >
            <Input
              name="code"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Description"
          error={fieldErrorFor(failure, 'description')}
          helperText="Optional. Up to 240 characters."
        >
          <Textarea
            name="description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        {!editing && (
          <Callout tone="info">
            A new department starts active with no lead. Appoint its lead from the catalogue when you
            are ready.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
