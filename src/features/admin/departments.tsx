'use client';

import * as React from 'react';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DepartmentAdminView, DepartmentFormInput } from '@/contracts/admin';
import { mockAdminService } from '@/services/mock/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';
import { DIVISION_OPTIONS } from '@/features/hr/shared';

const EMPTY: DepartmentFormInput = {
  divisionId: 'pia',
  name: '',
  code: '',
  description: '',
};

export function DepartmentAdministration() {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DepartmentAdminView | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<DepartmentAdminView | null>(null);
  const [form, setForm] = React.useState<DepartmentFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockAdminService.listDepartments(user?.userId ?? ''),
    [user?.userId],
  );

  const seedKey = open ? (editing?.id ?? 'new') : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setFailure(null);
    setForm(
      editing
        ? {
            divisionId: editing.division.id,
            name: editing.name,
            code: editing.code,
            description: editing.description ?? '',
          }
        : EMPTY,
    );
  }

  if (state.status === 'loading') return <ReportsLoading label="departments" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Departments" />;
  }
  const departments = state.data;
  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  async function save() {
    setSaving(true);
    setErrors([]);
    setFailure(null);
    const result = await mockAdminService.saveDepartment(
      user?.userId ?? '',
      form,
      editing?.id,
    );
    setSaving(false);
    if (result.status === 'success') {
      setOpen(false);
      reload();
      toast.show({
        tone: 'success',
        title: editing ? 'Department updated' : 'Department created',
        description: `${form.name.trim()} · ${form.code.trim().toUpperCase()}`,
      });
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
      return;
    }
    setFailure(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await mockAdminService.deleteDepartment(user?.userId ?? '', pendingDelete.id);
    setDeleting(false);
    if (result.status === 'success') {
      const removedName = pendingDelete.name;
      setPendingDelete(null);
      reload();
      toast.show({
        tone: 'success',
        title: 'Department deleted',
        description: `${removedName} is no longer available in employee forms.`,
      });
      return;
    }
    toast.show({
      tone: 'error',
      title: 'Could not delete the department',
      description: 'guidance' in result ? (result.guidance ?? result.message) : result.message,
    });
    setPendingDelete(null);
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Departments"
        description="Manage division-owned departments and the Team Lead responsible for each one."
        meta={<Badge tone="neutral">{departments.length} departments</Badge>}
        actions={
          <Button
            variant="primary"
            iconLeading={<Plus aria-hidden className="size-4" />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New department
          </Button>
        }
      />

      <Callout tone="info" className="mt-5">
        Only Super Administrators can change this catalogue. Department names and codes are unique
        within their division. A referenced department cannot be deleted or moved.
      </Callout>

      {departments.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No departments yet"
          description="Create the first department to make it available in the employee form."
          action={{
            label: 'New department',
            onClick: () => {
              setEditing(null);
              setOpen(true);
            },
          }}
        />
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => (
            <Card key={department.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-h3 text-ink">
                    <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    {department.name}
                    <Badge tone="neutral">{department.code}</Badge>
                  </h2>
                  <p className="mt-1 text-caption text-ink-muted">
                    {department.division.name} · {department.employeeCount} employee
                    {department.employeeCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeading={<Pencil aria-hidden className="size-4" />}
                    onClick={() => {
                      setEditing(department);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!department.canDelete}
                    title={
                      department.canDelete
                        ? `Delete ${department.name}`
                        : 'Move assigned employees before deleting this department.'
                    }
                    iconLeading={<Trash2 aria-hidden className="size-4" />}
                    onClick={() => setPendingDelete(department)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {department.description && (
                <p className="mt-3 text-body-sm text-ink-muted">{department.description}</p>
              )}
              <p className="mt-3 text-body-sm text-ink-subtle">
                Team Lead: {department.currentLead?.fullName ?? 'Not appointed'}
              </p>
              {!department.canDelete && (
                <p className="mt-3 border-t border-border pt-3 text-caption text-ink-subtle">
                  Protected while employee records reference this department.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit department' : 'New department'}
        description="The department appears only under its owning division. Lead appointments are managed separately and retain history."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              {editing ? 'Save department' : 'Create department'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorSummary errors={errors} autoFocus={false} />
          {failure && (
            <Alert tone="danger" title="Could not save" live>
              {failure}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Division"
              required
              disabled={Boolean(editing && editing.employeeCount > 0)}
              error={fieldError('divisionId')}
              helperText={
                editing && editing.employeeCount > 0
                  ? 'The division is protected while employees reference this department.'
                  : 'The department is available only to employees in this division.'
              }
            >
              <Select
                value={form.divisionId}
                options={DIVISION_OPTIONS}
                onChange={(event) => setForm({ ...form, divisionId: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required
              disabled={Boolean(editing && editing.employeeCount > 0)}
              error={fieldError('name')}
              helperText={
                editing && editing.employeeCount > 0
                  ? 'The name is protected while employee records reference it.'
                  : undefined
              }
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
              error={fieldError('code')}
              helperText="2–12 letters, numbers, or hyphens."
            >
              <Input
                name="code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete department?"
        description={pendingDelete?.name}
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              Delete department
            </Button>
          </>
        }
      >
        <Alert tone="warning" title="This cannot be undone">
          The department will be removed from the employee form. Departments already referenced by
          employee records are protected and cannot reach this step.
        </Alert>
      </Dialog>
    </PageContainer>
  );
}
