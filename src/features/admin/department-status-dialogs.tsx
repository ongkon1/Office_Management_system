'use client';

import * as React from 'react';
import type { DepartmentCatalogueRowView } from '@/contracts/organization-hierarchy';
import { departmentAdminService as mockDepartmentAdminService } from '@/services/runtime/department-admin';
import { Dialog } from '@/components/feedback/overlay';
import { Alert, Callout } from '@/components/feedback/alert';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import {
  NO_FORM_FAILURE,
  fieldErrorFor,
  toFormFailure,
  type DepartmentFormFailure,
} from './department-shared';

/**
 * Deactivate or reactivate a department (`OH-FE-0207`).
 *
 * Deactivation is the product's answer to "this department is finished", and it
 * is not a delete: current placements stay exactly as recorded and only *new*
 * placements are refused. Saying that here is the difference between an
 * administrator understanding the change and assuming the members were moved.
 */
export function DepartmentStatusDialog({
  open,
  userId,
  department,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: string;
  department: DepartmentCatalogueRowView | null;
  onClose: () => void;
  onSaved: (message: string, description: string) => void;
}) {
  if (!open || !department) return null;
  return (
    <DepartmentStatusDialogBody
      userId={userId}
      department={department}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function DepartmentStatusDialogBody({
  userId,
  department,
  onClose,
  onSaved,
}: {
  userId: string;
  department: DepartmentCatalogueRowView;
  onClose: () => void;
  onSaved: (message: string, description: string) => void;
}) {
  const deactivating = department.department.isActive;
  const [reason, setReason] = React.useState('');
  const [failure, setFailure] = React.useState<DepartmentFormFailure>(NO_FORM_FAILURE);
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setSaving(true);
    setFailure(NO_FORM_FAILURE);
    const result = await mockDepartmentAdminService.setStatus(userId, {
      departmentId: department.department.id,
      isActive: !deactivating,
      reason,
    });
    setSaving(false);

    if (result.status === 'success') {
      onSaved(
        deactivating ? 'Department deactivated' : 'Department reactivated',
        result.warnings?.[0]?.message ??
          (deactivating
            ? `${result.data.department.name} accepts no new placements.`
            : `${result.data.department.name} accepts placements again.`),
      );
      return;
    }
    setFailure(toFormFailure(result));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        deactivating
          ? `Deactivate ${department.department.name}?`
          : `Reactivate ${department.department.name}?`
      }
      description={`${department.division.name} · ${department.department.code}`}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={deactivating ? 'danger' : 'primary'}
            loading={saving}
            onClick={submit}
          >
            {deactivating ? 'Deactivate department' : 'Reactivate department'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormErrorSummary errors={failure.fieldErrors} title="The status was not changed" />

        {failure.blocking && (
          <Alert tone="danger" title={failure.blocking.title} live>
            {failure.blocking.detail}
          </Alert>
        )}

        {deactivating ? (
          <>
            <Alert tone="warning" title="Nothing is deleted">
              {department.activeEmployeeCount === 0
                ? 'No employee is placed here today. Historical placements and leadership stay exactly as recorded.'
                : `${department.activeEmployeeCount} employee${department.activeEmployeeCount === 1 ? '' : 's'} keep their placement. No new placement can be made into an inactive department.`}
            </Alert>
            <Field
              label="Reason"
              required
              error={fieldErrorFor(failure, 'reason')}
              helperText="Up to 200 characters. Kept with the department so the change stays explainable."
            >
              <Textarea
                name="reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </>
        ) : (
          <Callout tone="info">
            The department becomes selectable again on division assignment forms. Its leadership
            history is unchanged, so appoint a lead if it has none.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Delete a department (`OH-FE-0208`).
 *
 * Reachable only for a department nothing has ever referenced — no placement,
 * no appointment. Anything else is deactivated instead, and the service refuses
 * the delete even if this dialog is somehow reached.
 */
export function DepartmentDeleteDialog({
  open,
  userId,
  department,
  onClose,
  onDeleted,
}: {
  open: boolean;
  userId: string;
  department: DepartmentCatalogueRowView | null;
  onClose: () => void;
  onDeleted: (message: string, description: string) => void;
}) {
  const [failure, setFailure] = React.useState<DepartmentFormFailure>(NO_FORM_FAILURE);
  const [deleting, setDeleting] = React.useState(false);

  const seedKey = open ? (department?.department.id ?? '') : null;
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setFailure(NO_FORM_FAILURE);
  }

  async function remove() {
    if (!department) return;
    setDeleting(true);
    const result = await mockDepartmentAdminService.remove(userId, department.department.id);
    setDeleting(false);
    if (result.status === 'success') {
      onDeleted(
        'Department deleted',
        `${department.department.name} is no longer available in ${department.division.name}.`,
      );
      return;
    }
    setFailure(toFormFailure(result));
  }

  return (
    <Dialog
      open={open && department !== null}
      onClose={onClose}
      title={department ? `Delete ${department.department.name}?` : 'Delete department?'}
      description={department ? `${department.division.name} · ${department.department.code}` : undefined}
      size="sm"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={remove}>
            Delete department
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {failure.blocking && (
          <Alert tone="danger" title={failure.blocking.title} live>
            {failure.blocking.detail}
          </Alert>
        )}
        <Alert tone="warning" title="This cannot be undone">
          Nothing references this department — no employee placement and no leadership appointment —
          so deleting it removes no history. A referenced department is deactivated instead.
        </Alert>
      </div>
    </Dialog>
  );
}
