'use client';

import * as React from 'react';
import { Building2, Pencil, Plus, TriangleAlert } from 'lucide-react';
import type { DivisionAdminView, DivisionFormInput } from '@/contracts/admin';
import { mockAdminService } from '@/services/mock/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, Input, Select, Switch, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

const TEAM_LEAD_OPTIONS = [
  { value: 'emp-2001', label: 'Imran Hossain' },
  { value: 'emp-2002', label: 'Farhana Islam' },
];

const EMPTY: DivisionFormInput = {
  name: '',
  code: '',
  description: '',
  teamLeadEmployeeId: 'emp-2001',
  isRestricted: false,
};

/**
 * FE-0730 — division management.
 *
 * The deactivation safeguard is the substance here. Blockers are computed by
 * the service and shown *before* the switch is offered, so the control is
 * disabled with its reasons visible rather than failing after the click. A
 * deactivated division whose assignments still point at it would silently
 * break time recording for everyone in it.
 */
export function DivisionAdministration() {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DivisionAdminView | null>(null);
  const [form, setForm] = React.useState<DivisionFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockAdminService.listDivisions(user?.userId ?? ''),
    [user?.userId],
  );

  const seedKey = open ? (editing?.id ?? 'new') : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setConflict(null);
    setForm(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            description: editing.description ?? '',
            teamLeadEmployeeId: editing.teamLead?.id ?? 'emp-2001',
            isRestricted: editing.isRestricted,
          }
        : EMPTY,
    );
  }

  if (state.status === 'loading') return <ReportsLoading label="divisions" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Divisions" />;
  }
  const divisions = state.data;

  async function save() {
    setErrors([]);
    setConflict(null);
    const result = await mockAdminService.saveDivision(user?.userId ?? '', form, editing?.id);
    if (result.status === 'success') {
      setOpen(false);
      reload();
      toast.show({
        tone: 'success',
        title: editing ? 'Division updated' : 'Division created',
        description: `${form.name} · ${form.code.toUpperCase()}`,
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
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  async function toggleActive(division: DivisionAdminView) {
    const result = await mockAdminService.setDivisionActive(
      user?.userId ?? '',
      division.id,
      !division.isActive,
    );
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: division.isActive ? 'Division deactivated' : 'Division activated',
        description: division.isActive
          ? 'No new time can be recorded against it. Existing records keep their division.'
          : 'It can accept assignments and time again.',
      });
      return;
    }
    toast.show({
      tone: 'error',
      title: 'Could not change the division',
      description:
        'guidance' in result ? (result.guidance ?? result.message) : result.message,
    });
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Divisions"
        description="Create, edit and deactivate divisions. Deactivation is blocked while records still depend on one."
        meta={<Badge tone="neutral">{divisions.length} divisions</Badge>}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            iconLeading={<Plus aria-hidden className="size-4" />}
          >
            New division
          </Button>
        }
      />

      <Callout tone="info" className="mt-5">
        A division cannot be deactivated while active assignments, projects or open tasks still
        reference it. The reasons are listed on the division, and the switch stays disabled until
        they are cleared.
      </Callout>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {divisions.map((division) => (
          <Card key={division.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-h3 text-ink">
                  <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  {division.name}
                  <Badge tone="neutral">{division.code}</Badge>
                  {division.isRestricted && <Badge tone="warning">Restricted</Badge>}
                </h2>
                <p className="mt-1 text-caption text-ink-muted">
                  Team Lead {division.teamLead?.fullName ?? 'not assigned'}
                </p>
                {division.description && (
                  <p className="mt-1 text-caption text-ink-subtle">{division.description}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconLeading={<Pencil aria-hidden className="size-4" />}
                onClick={() => {
                  setEditing(division);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-caption text-ink-muted">Assignments</dt>
                <dd className="font-semibold text-ink tabular">{division.activeAssignmentCount}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Projects</dt>
                <dd className="font-semibold text-ink tabular">{division.activeProjectCount}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Open tasks</dt>
                <dd className="font-semibold text-ink tabular">{division.openTaskCount}</dd>
              </div>
            </dl>

            {division.deactivationBlockers.length > 0 && (
              <div className="mt-4 rounded-md border border-undertime-border bg-undertime-surface p-3">
                <p className="flex items-center gap-2 text-caption font-semibold text-undertime">
                  <TriangleAlert aria-hidden className="size-3.5" />
                  Cannot be deactivated yet
                </p>
                <ul className="mt-1 ml-5 list-disc space-y-0.5">
                  {division.deactivationBlockers.map((blocker) => (
                    <li key={blocker} className="text-caption text-undertime">
                      {blocker}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <Switch
                checked={division.isActive}
                disabled={division.isActive && division.deactivationBlockers.length > 0}
                onCheckedChange={() => toggleActive(division)}
                label="Active"
                description={
                  division.isActive
                    ? 'Accepting assignments and new time entries.'
                    : 'No new time can be recorded. Existing records keep their division.'
                }
              />
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit division' : 'New division'}
        description="Divisions own projects, assignments and the time recorded against them."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing ? 'Save division' : 'Create division'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorSummary errors={errors} autoFocus={false} />
          {conflict && (
            <Alert tone="danger" title="Could not save" live>
              {conflict}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={fieldError('name')}>
              <Input
                name="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Code" required error={fieldError('code')} helperText="Short uppercase code.">
              <Input
                name="code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Team Lead">
            <Select
              value={form.teamLeadEmployeeId}
              options={TEAM_LEAD_OPTIONS}
              onChange={(event) => setForm({ ...form, teamLeadEmployeeId: event.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Checkbox
            label="Restricted division"
            description="Records are denied by default and need a separately granted permission to read."
            checked={form.isRestricted}
            onChange={(event) => setForm({ ...form, isRestricted: event.target.checked })}
          />
        </div>
      </Dialog>
    </PageContainer>
  );
}
