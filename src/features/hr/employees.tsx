'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Pencil, Plus, Save, UserPlus } from 'lucide-react';
import type {
  AssignmentFormInput,
  EmployeeFormInput,
  HrAssignmentView,
  HrEmployeeRowView,
} from '@/contracts/hr';
import type { Employee } from '@/contracts/domain';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { DataTable } from '@/components/data/data-table';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, Input, NumberInput, SearchInput, Select, Textarea } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Duration, RestrictedValue } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  CompanyScope,
  DIVISION_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  HrLoading,
  HrResultFallback,
  TEAM_LEAD_OPTIONS,
  WORK_MODE_OPTIONS,
} from './shared';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/* -------------------------------------------------------------------------- */
/* FE-0502 — directory                                                        */
/* -------------------------------------------------------------------------- */

export function EmployeeDirectory({ incompleteOnly = false }: { incompleteOnly?: boolean }) {
  const router = useRouter();
  const { user } = useSession();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<readonly string[]>([]);
  const [divisionIds, setDivisionIds] = React.useState<readonly string[]>([]);
  const [teamLeadIds, setTeamLeadIds] = React.useState<readonly string[]>([]);
  const [employmentTypes, setEmploymentTypes] = React.useState<readonly string[]>([]);
  const [workModes, setWorkModes] = React.useState<readonly string[]>([]);
  const [incomplete, setIncomplete] = React.useState(incompleteOnly);

  const { state } = useAsync(
    () =>
      mockHrService.listEmployees(user?.userId ?? '', {
        search,
        status,
        divisionIds,
        teamLeadIds,
        employmentTypes,
        workModes,
        incompleteOnly: incomplete,
      }),
    [user?.userId, search, status, divisionIds, teamLeadIds, employmentTypes, workModes, incomplete],
  );

  const applied = [
    ...status.map((value) => ({
      key: `status-${value}`,
      label: 'Status',
      value: STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setStatus(status.filter((item) => item !== value)),
    })),
    ...divisionIds.map((value) => ({
      key: `division-${value}`,
      label: 'Division',
      value: DIVISION_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setDivisionIds(divisionIds.filter((item) => item !== value)),
    })),
    ...teamLeadIds.map((value) => ({
      key: `lead-${value}`,
      label: 'Team Lead',
      value: TEAM_LEAD_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setTeamLeadIds(teamLeadIds.filter((item) => item !== value)),
    })),
    ...employmentTypes.map((value) => ({
      key: `type-${value}`,
      label: 'Employment',
      value: EMPLOYMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setEmploymentTypes(employmentTypes.filter((item) => item !== value)),
    })),
    ...workModes.map((value) => ({
      key: `mode-${value}`,
      label: 'Work mode',
      value: WORK_MODE_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setWorkModes(workModes.filter((item) => item !== value)),
    })),
    ...(incomplete
      ? [
          {
            key: 'incomplete',
            label: 'Profile',
            value: 'Incomplete only',
            onRemove: () => setIncomplete(false),
          },
        ]
      : []),
  ];

  if (state.status !== 'loading' && state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject="Employee directory" />;
  }
  const rows = state.status === 'success' ? state.data : [];

  return (
    <PageContainer width="full">
      <PageHeader
        title="Employees"
        description="Every employee record, with the division assignments and profile completeness HR maintains."
        meta={<CompanyScope />}
        actions={
          <LinkButton
            variant="primary"
            href="/employees/new"
            iconLeading={<UserPlus aria-hidden className="size-4" />}
          >
            Add employee
          </LinkButton>
        }
      />

      <FilterBar
        className="mt-5"
        applied={applied}
        onClearAll={() => {
          setStatus([]);
          setDivisionIds([]);
          setTeamLeadIds([]);
          setEmploymentTypes([]);
          setWorkModes([]);
          setIncomplete(false);
        }}
        resultSummary={`${rows.length} employee${rows.length === 1 ? '' : 's'}`}
      >
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search employees by name or code"
          placeholder="Name or code"
          className="w-full sm:w-56"
        />
        <MultiSelectFilter label="Status" options={STATUS_OPTIONS} selected={status} onChange={setStatus} />
        <MultiSelectFilter
          label="Division"
          options={DIVISION_OPTIONS}
          selected={divisionIds}
          onChange={setDivisionIds}
        />
        <MultiSelectFilter
          label="Team Lead"
          options={TEAM_LEAD_OPTIONS}
          selected={teamLeadIds}
          onChange={setTeamLeadIds}
        />
        <MultiSelectFilter
          label="Employment type"
          options={EMPLOYMENT_TYPE_OPTIONS}
          selected={employmentTypes}
          onChange={setEmploymentTypes}
        />
        <MultiSelectFilter
          label="Work mode"
          options={WORK_MODE_OPTIONS}
          selected={workModes}
          onChange={setWorkModes}
        />
        <Checkbox
          label="Incomplete profile only"
          checked={incomplete}
          onChange={(event) => setIncomplete(event.target.checked)}
        />
      </FilterBar>

      <DataTable<HrEmployeeRowView>
        className="mt-4"
        caption="Employee directory"
        loading={state.status === 'loading'}
        rows={rows}
        getRowId={(row) => row.employee.id}
        onRowClick={(row) => router.push(row.href)}
        emptyState={{
          variant: applied.length || search ? 'no-results' : 'empty',
          title: applied.length || search ? 'No employees match these filters' : 'No employees yet',
          description:
            applied.length || search
              ? 'Clear a filter to widen the result set.'
              : 'Add the first employee record to begin.',
        }}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            alwaysVisible: true,
            render: (row) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {row.employee.fullName}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">
                    {row.employee.employeeCode} · {row.employee.designation}
                  </span>
                </span>
              </span>
            ),
          },
          {
            key: 'divisions',
            header: 'Divisions',
            hideBelow: 'md',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                {row.primaryDivision && (
                  <Badge tone="accent">{row.primaryDivision.code} primary</Badge>
                )}
                {row.divisionCodes
                  .filter((code) => code !== row.primaryDivision?.code)
                  .map((code) => (
                    <Badge key={code} tone="neutral">
                      {code}
                    </Badge>
                  ))}
              </span>
            ),
          },
          {
            key: 'lead',
            header: 'Team Lead',
            hideBelow: 'lg',
            render: (row) => row.teamLeadName ?? <span className="text-ink-muted">Not assigned</span>,
          },
          {
            key: 'employment',
            header: 'Employment',
            hideBelow: 'lg',
            render: (row) => row.employmentTypeLabel,
          },
          { key: 'mode', header: 'Work mode', hideBelow: 'lg', render: (row) => row.workModeLabel },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>
                  {row.statusLabel}
                </Badge>
                {row.isProfileIncomplete && <Badge tone="warning">Incomplete profile</Badge>}
              </span>
            ),
          },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {row.employee.fullName}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">
                    {row.employee.employeeCode}
                  </span>
                </span>
              </span>
              <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>{row.statusLabel}</Badge>
            </div>
            <p className="mt-2 text-caption text-ink-muted">
              {row.employmentTypeLabel} · {row.workModeLabel} · {row.divisionCodes.join(', ')}
            </p>
            {row.isProfileIncomplete && (
              <Badge tone="warning" className="mt-2">
                Missing: {row.missingFields.join(', ')}
              </Badge>
            )}
          </div>
        )}
      />
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0503 — create and edit                                                  */
/* -------------------------------------------------------------------------- */

const EMPTY_FORM: EmployeeFormInput = {
  fullName: '',
  employeeCode: '',
  designation: '',
  department: '',
  employmentType: 'full_time',
  joiningDate: '2026-09-01',
  email: '',
  phone: '',
  officeLocation: '',
  primaryDivisionId: 'pia',
  teamLeadEmployeeId: 'emp-2001',
  normalWorkMode: 'office',
  standardDailyActiveMinutes: 420,
  standardWeeklyActiveMinutes: 2100,
  skills: [],
  status: 'active',
};

export function EmployeeForm({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const [form, setForm] = React.useState<EmployeeFormInput>(EMPTY_FORM);
  const [skillText, setSkillText] = React.useState('');
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const { state } = useAsync(
    () =>
      employeeId
        ? mockHrService.getEmployee(user?.userId ?? '', employeeId)
        : Promise.resolve({ status: 'success' as const, data: null }),
    [user?.userId, employeeId],
  );

  // Adjusting state during render rather than in an effect: the form is
  // seeded once per loaded employee, and an effect here would run after a
  // paint with empty fields.
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  if (state.status === 'success' && state.data && seededFor !== state.data.employee.id) {
    const detail = state.data;
    setSeededFor(detail.employee.id);
    setForm({
      fullName: detail.employee.fullName,
      employeeCode: detail.employee.employeeCode,
      designation: detail.employee.designation ?? '',
      department: detail.department ?? '',
      employmentType: detail.employmentType,
      joiningDate: '2026-01-01',
      email: detail.email,
      phone: detail.phone ?? '',
      officeLocation: detail.officeLocation ?? '',
      primaryDivisionId: detail.assignments.find((item) => item.isPrimary)?.division.id ?? 'pia',
      teamLeadEmployeeId:
        detail.assignments.find((item) => item.isPrimary)?.teamLead?.id ?? 'emp-2001',
      normalWorkMode: detail.workMode,
      standardDailyActiveMinutes: detail.standardDaily.minutes,
      standardWeeklyActiveMinutes: detail.standardWeekly.minutes,
      skills: detail.skills,
      status: detail.status,
    });
    setSkillText(detail.skills.join(', '));
  }

  if (state.status === 'loading') return <HrLoading label="employee record" />;
  if (state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject="Employee" />;
  }

  function update<K extends keyof EmployeeFormInput>(key: K, value: EmployeeFormInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setConflict(null);
    const payload: EmployeeFormInput = {
      ...form,
      skills: skillText
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    };
    const result = await mockHrService.saveEmployee(user?.userId ?? '', payload, employeeId);
    setSaving(false);

    if (result.status === 'success') {
      setErrors([]);
      toast.show({
        tone: 'success',
        title: employeeId ? 'Employee record updated' : 'Employee record created',
        description: `${result.data.employee.fullName} · ${result.data.employee.employeeCode}`,
      });
      router.push(`/employees/${result.data.employee.id}`);
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(result.fieldErrors.map((error) => ({ field: error.field, message: `${error.message} ${error.guidance}` })));
      return;
    }
    if (result.status === 'conflict') {
      setConflict(`${result.message} ${result.guidance ?? ''}`.trim());
      return;
    }
    setConflict(result.message);
  }

  const fieldError = (field: string) =>
    errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={employeeId ? 'Edit employee' : 'Add employee'}
        description="Identity, employment, contact, office, schedule, work mode, skills and status."
        crumbs={[{ label: 'Employees', href: '/employees' }, { label: employeeId ? 'Edit' : 'New' }]}
        backHref="/employees"
        backLabel="Employees"
        meta={<CompanyScope />}
      />

      {/*
        `noValidate` matches the Phase 2 auth forms: native validation shows a
        browser tooltip with no corrective guidance and no `aria-describedby`
        wiring, which `REQ-TIME-025` requires. The service is the validator.
      */}
      <form
        noValidate
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FormErrorSummary errors={errors} />
        {conflict && (
          <Alert tone="danger" title="Could not save" live>
            {conflict}
          </Alert>
        )}

        <Card>
          <CardHeader title="Identity" description="How the employee is named across the system." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={fieldError('fullName')}>
              <Input
                name="fullName"
                value={form.fullName}
                onChange={(event) => update('fullName', event.target.value)}
              />
            </Field>
            <Field label="Employee code" required error={fieldError('employeeCode')} helperText="Format EMP-0000.">
              <Input
                name="employeeCode"
                value={form.employeeCode}
                onChange={(event) => update('employeeCode', event.target.value)}
              />
            </Field>
            <Field label="Designation">
              <Input
                value={form.designation}
                onChange={(event) => update('designation', event.target.value)}
              />
            </Field>
            <Field label="Department">
              <Input
                value={form.department}
                onChange={(event) => update('department', event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Employment" description="Type, start date and record status." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Employment type">
              <Select
                value={form.employmentType}
                options={EMPLOYMENT_TYPE_OPTIONS}
                onChange={(event) =>
                  update('employmentType', event.target.value as Employee['employmentType'])
                }
              />
            </Field>
            <Field label="Joining date">
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(event) => update('joiningDate', event.target.value)}
              />
            </Field>
            <Field label="Primary division">
              <Select
                value={form.primaryDivisionId}
                options={DIVISION_OPTIONS}
                onChange={(event) => update('primaryDivisionId', event.target.value)}
              />
            </Field>
            <Field label="Team Lead">
              <Select
                value={form.teamLeadEmployeeId}
                options={TEAM_LEAD_OPTIONS}
                onChange={(event) => update('teamLeadEmployeeId', event.target.value)}
              />
            </Field>
            <Field label="Record status" helperText="An inactive employee keeps their history but cannot sign in.">
              <Select
                value={form.status}
                options={STATUS_OPTIONS}
                onChange={(event) => update('status', event.target.value as 'active' | 'inactive')}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact and office" description="Missing contact details mark the profile incomplete." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Work email" required error={fieldError('email')}>
              <Input
                type="email"
                name="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            </Field>
            <Field label="Phone number">
              <Input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            </Field>
            <Field label="Office location">
              <Input
                value={form.officeLocation}
                onChange={(event) => update('officeLocation', event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Schedule, work mode and skills"
            description="The standard day is 7 active hours plus a separate 1 hour break."
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Standard daily active minutes" helperText="420 minutes is the standard 7 active hours.">
              <NumberInput
                value={form.standardDailyActiveMinutes}
                onChange={(event) =>
                  update('standardDailyActiveMinutes', Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Standard weekly active minutes">
              <NumberInput
                value={form.standardWeeklyActiveMinutes}
                onChange={(event) =>
                  update('standardWeeklyActiveMinutes', Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Normal work mode">
              <Select
                value={form.normalWorkMode}
                options={WORK_MODE_OPTIONS}
                onChange={(event) =>
                  update('normalWorkMode', event.target.value as Employee['normalWorkMode'])
                }
              />
            </Field>
            <Field label="Skills" helperText="Comma separated.">
              <Textarea
                rows={2}
                value={skillText}
                onChange={(event) => setSkillText(event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <StickyActionBar>
          <LinkButton variant="secondary" href="/employees">
            Cancel
          </LinkButton>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            iconLeading={<Save aria-hidden className="size-4" />}
          >
            {employeeId ? 'Save changes' : 'Create employee'}
          </Button>
        </StickyActionBar>
      </form>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0505 / FE-0506 — assignment management                                  */
/* -------------------------------------------------------------------------- */

const EMPTY_ASSIGNMENT = {
  divisionId: 'pia',
  isPrimary: false,
  teamLeadEmployeeId: 'emp-2001',
  allocationPercent: 20,
  expectedWeeklyMinutes: 420,
  startDate: '2026-09-01',
  endDate: '',
  isTemporary: false,
  isActive: true,
  roleInDivision: '',
};

function AssignmentEditor({
  employeeId,
  assignment,
  open,
  onClose,
  onSaved,
}: {
  employeeId: string;
  assignment: HrAssignmentView | null;
  open: boolean;
  onClose: () => void;
  onSaved: (assignments: readonly HrAssignmentView[]) => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [form, setForm] = React.useState(EMPTY_ASSIGNMENT);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const seedKey = open ? (assignment?.id ?? 'new') : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setErrors([]);
    setForm(
      assignment
        ? {
            divisionId: assignment.division.id,
            isPrimary: assignment.isPrimary,
            teamLeadEmployeeId: assignment.teamLead?.id ?? 'emp-2001',
            allocationPercent: assignment.allocationPercent,
            expectedWeeklyMinutes: assignment.expectedWeekly.minutes,
            startDate: assignment.startDate,
            endDate: assignment.endDate ?? '',
            isTemporary: assignment.isTemporary,
            isActive: assignment.isActive,
            roleInDivision: assignment.roleInDivision ?? '',
          }
        : EMPTY_ASSIGNMENT,
    );
  }

  async function save() {
    const input: AssignmentFormInput = {
      employeeId,
      divisionId: form.divisionId,
      isPrimary: form.isPrimary,
      teamLeadEmployeeId: form.teamLeadEmployeeId,
      allocationPercent: form.allocationPercent,
      expectedWeeklyMinutes: form.expectedWeeklyMinutes,
      startDate: form.startDate,
      endDate: form.endDate || null,
      isTemporary: form.isTemporary,
      isActive: form.isActive,
      roleInDivision: form.roleInDivision,
    };
    const result = await mockHrService.saveAssignment(
      user?.userId ?? '',
      input,
      assignment?.id,
    );
    if (result.status === 'success') {
      onSaved(result.data);
      onClose();
      toast.show({
        tone: 'success',
        title: assignment ? 'Assignment updated' : 'Assignment added',
        description: form.isTemporary
          ? 'The temporary assignment ends automatically on its end date.'
          : 'Time can now be recorded against this division from the start date.',
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
    }
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={assignment ? 'Edit division assignment' : 'Add division assignment'}
      description="An assignment grants access to record time against a division only inside its effective dates."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {assignment ? 'Save assignment' : 'Add assignment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Division" required>
            <Select
              value={form.divisionId}
              options={DIVISION_OPTIONS}
              onChange={(event) => setForm({ ...form, divisionId: event.target.value })}
            />
          </Field>
          <Field label="Team Lead">
            <Select
              value={form.teamLeadEmployeeId}
              options={TEAM_LEAD_OPTIONS}
              onChange={(event) => setForm({ ...form, teamLeadEmployeeId: event.target.value })}
            />
          </Field>
          <Field
            label="Allocation percent"
            required
            error={fieldError('allocationPercent')}
            helperText="Share of the working week this division expects."
          >
            <NumberInput
              min={1}
              max={100}
              value={form.allocationPercent}
              onChange={(event) =>
                setForm({ ...form, allocationPercent: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Expected weekly minutes">
            <NumberInput
              value={form.expectedWeeklyMinutes}
              onChange={(event) =>
                setForm({ ...form, expectedWeeklyMinutes: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Field label="Start date" required>
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </Field>
          <Field
            label="End date"
            error={fieldError('endDate')}
            required={form.isTemporary}
            helperText="Required for a temporary assignment."
          >
            <Input
              type="date"
              name="endDate"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </Field>
          <Field label="Role in division">
            <Input
              value={form.roleInDivision}
              onChange={(event) => setForm({ ...form, roleInDivision: event.target.value })}
            />
          </Field>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <Checkbox
            label="Primary division"
            description="An employee has exactly one primary division; setting this clears the previous one."
            checked={form.isPrimary}
            onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
          />
          <Checkbox
            label="Temporary assignment"
            description="Ends automatically on the end date. Time cannot be recorded after it."
            checked={form.isTemporary}
            onChange={(event) => setForm({ ...form, isTemporary: event.target.checked })}
          />
          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
        </div>
      </div>
    </Dialog>
  );
}

function AssignmentsPanel({
  employeeId,
  assignments,
  totalAllocationPercent,
  allocationWarning,
  onChanged,
}: {
  employeeId: string;
  assignments: readonly HrAssignmentView[];
  totalAllocationPercent: number;
  allocationWarning: string | null;
  onChanged: (assignments: readonly HrAssignmentView[]) => void;
}) {
  const [editing, setEditing] = React.useState<HrAssignmentView | null>(null);
  const [open, setOpen] = React.useState(false);

  const current = assignments.filter((assignment) => assignment.isEffectiveToday);
  const historical = assignments.filter((assignment) => !assignment.isEffectiveToday);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Current assignments"
          description={`Concurrent allocation ${totalAllocationPercent}% across ${current.length} division(s).`}
          actions={
            <Button
              variant="primary"
              size="sm"
              iconLeading={<Plus aria-hidden className="size-4" />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add assignment
            </Button>
          }
        />

        {allocationWarning && (
          <Alert className="mt-4" tone="warning" title="Allocation exceeds 100%">
            {allocationWarning}
          </Alert>
        )}

        <ul className="mt-4 space-y-3">
          {current.map((assignment) => (
            <li key={assignment.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                    {assignment.division.name}
                    {assignment.isPrimary && <Badge tone="accent">Primary</Badge>}
                    {assignment.isTemporary && <Badge tone="info">Temporary</Badge>}
                    {assignment.division.isRestricted && <Badge tone="warning">Restricted</Badge>}
                  </p>
                  <p className="text-caption text-ink-muted">
                    Team Lead {assignment.teamLead?.fullName ?? 'not assigned'} ·{' '}
                    {assignment.roleInDivision ?? 'No division role'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeading={<Pencil aria-hidden className="size-4" />}
                  onClick={() => {
                    setEditing(assignment);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-caption text-ink-muted">Allocation</dt>
                  <dd className="font-semibold text-ink tabular">{assignment.allocationPercent}%</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Expected weekly</dt>
                  <dd className="font-semibold text-ink">
                    <Duration value={assignment.expectedWeekly} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Start</dt>
                  <dd className="text-ink">{assignment.startDateLabel}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">End</dt>
                  <dd className="text-ink">{assignment.endDateLabel ?? 'Open-ended'}</dd>
                </div>
              </dl>
            </li>
          ))}
          {current.length === 0 && (
            <li className="text-body-sm text-ink-muted">
              No effective assignment today. This employee cannot record time until one starts.
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Assignment history"
          description="Ended and inactive assignments stay visible so past time records remain explainable."
        />
        <ol className="mt-4 space-y-3">
          {historical.map((assignment) => (
            <li key={assignment.id} className="flex gap-3">
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full bg-border-strong"
              />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                  {assignment.division.name}
                  {assignment.isTemporary && (
                    <Badge tone="info" icon={<CalendarPlus aria-hidden className="size-3.5" />}>
                      Temporary
                    </Badge>
                  )}
                  <Badge tone="neutral">Ended</Badge>
                </p>
                <p className="text-caption text-ink-muted">
                  {assignment.startDateLabel} – {assignment.endDateLabel ?? 'no end date'} ·{' '}
                  {assignment.allocationPercent}% · Team Lead{' '}
                  {assignment.teamLead?.fullName ?? 'not assigned'}
                </p>
              </div>
            </li>
          ))}
          {historical.length === 0 && (
            <li className="text-body-sm text-ink-muted">No historical assignments.</li>
          )}
        </ol>
      </Card>

      <AssignmentEditor
        employeeId={employeeId}
        assignment={editing}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={onChanged}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0504 — employee detail                                                  */
/* -------------------------------------------------------------------------- */

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'projects', label: 'Projects' },
  { key: 'time', label: 'Time' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'wfh', label: 'WFH' },
  { key: 'leave', label: 'Leave' },
  { key: 'evaluations', label: 'Evaluations' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Record history' },
];

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const { user } = useSession();
  const [tab, setTab] = React.useState('overview');
  const [assignmentOverride, setAssignmentOverride] =
    React.useState<readonly HrAssignmentView[] | null>(null);

  const { state } = useAsync(
    () => mockHrService.getEmployee(user?.userId ?? '', employeeId),
    [user?.userId, employeeId],
  );

  if (state.status === 'loading') return <HrLoading label="employee profile" />;
  if (state.status !== 'success') return <HrResultFallback result={state.failure} subject="Employee" />;

  const detail = state.data;
  const assignments = assignmentOverride ?? detail.assignments;
  const totalAllocation = assignments
    .filter((assignment) => assignment.isEffectiveToday)
    .reduce((total, assignment) => total + assignment.allocationPercent, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title={detail.employee.fullName}
        description={`${detail.employee.designation ?? ''} · ${detail.employee.employeeCode}`}
        crumbs={[{ label: 'Employees', href: '/employees' }, { label: detail.employee.fullName }]}
        backHref="/employees"
        backLabel="Employees"
        meta={
          <>
            <Badge tone={detail.status === 'active' ? 'success' : 'neutral'}>
              {detail.statusLabel}
            </Badge>
            <Badge tone="neutral">{detail.employmentTypeLabel}</Badge>
            <Badge tone="neutral">{detail.workModeLabel}</Badge>
            {detail.missingFields.length > 0 && (
              <Badge tone="warning">Incomplete profile</Badge>
            )}
          </>
        }
        actions={
          <LinkButton
            variant="secondary"
            href={`/employees/${employeeId}/edit`}
            iconLeading={<Pencil aria-hidden className="size-4" />}
          >
            Edit profile
          </LinkButton>
        }
      />

      <Tabs
        className="mt-5"
        items={DETAIL_TABS}
        activeKey={tab}
        onChange={setTab}
        label="Employee profile sections"
      />

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Profile" />
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-ink-muted">Work email</dt>
                  <dd className="text-body-sm text-ink">{detail.email}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Phone</dt>
                  <dd className="text-body-sm text-ink">
                    {detail.phone ?? <span className="text-ink-muted">Not recorded</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Office location</dt>
                  <dd className="text-body-sm text-ink">
                    {detail.officeLocation ?? <span className="text-ink-muted">Not recorded</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Department</dt>
                  <dd className="text-body-sm text-ink">
                    {detail.department ?? <span className="text-ink-muted">Not recorded</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Joined</dt>
                  <dd className="text-body-sm text-ink">{detail.joiningDateLabel}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Work policy</dt>
                  <dd className="text-body-sm text-ink">{detail.workPolicyLabel}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-label text-ink-muted">Skills</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {detail.skills.length ? (
                    detail.skills.map((skill) => (
                      <Badge key={skill} tone="neutral">
                        {skill}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-body-sm text-ink-muted">No skills recorded.</span>
                  )}
                </p>
              </div>
              {detail.missingFields.length > 0 && (
                <Callout tone="warning" className="mt-4">
                  Missing profile fields: {detail.missingFields.join(', ')}.
                </Callout>
              )}
            </Card>

            <Card>
              <CardHeader title="Schedule and expectation" />
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-ink-muted">Standard daily active</dt>
                  <dd className="text-body font-semibold text-ink">
                    <Duration value={detail.standardDaily} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Standard weekly active</dt>
                  <dd className="text-body font-semibold text-ink">
                    <Duration value={detail.standardWeekly} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Concurrent allocation</dt>
                  <dd className="text-body font-semibold text-ink tabular">{totalAllocation}%</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Effective divisions today</dt>
                  <dd className="text-body-sm text-ink">
                    {assignments
                      .filter((assignment) => assignment.isEffectiveToday)
                      .map((assignment) => assignment.division.code)
                      .join(', ') || 'None'}
                  </dd>
                </div>
              </dl>
              <Callout tone="info" className="mt-4">
                A normal full day is 7 active hours plus one separate 1 hour break, 8 hours in
                total. The break is recognized once per day, never per entry.
              </Callout>
            </Card>
          </div>
        )}

        {tab === 'assignments' && (
          <AssignmentsPanel
            employeeId={employeeId}
            assignments={assignments}
            totalAllocationPercent={totalAllocation}
            allocationWarning={
              totalAllocation > 100
                ? `Concurrent allocation is ${totalAllocation}%. Reduce an allocation or end an assignment.`
                : null
            }
            onChanged={setAssignmentOverride}
          />
        )}

        {tab === 'projects' && (
          <Card>
            <CardHeader title="Projects" description="Projects this employee has recorded work against." />
            <ul className="mt-4 space-y-2">
              {detail.projects.map((project) => (
                <li
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-ink">
                      {project.name}
                    </span>
                    <span className="block text-caption text-ink-muted">
                      {project.code} · {project.division.name}
                    </span>
                  </span>
                  <Duration value={project.actual} emphasis />
                </li>
              ))}
              {detail.projects.length === 0 && (
                <li className="text-body-sm text-ink-muted">No project work recorded.</li>
              )}
            </ul>
          </Card>
        )}

        {tab === 'time' && (
          <Card>
            <CardHeader
              title={`Time — ${detail.monthly.label}`}
              description="Totals produced by the shared calculation engine."
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <dt className="text-caption text-ink-muted">Active</dt>
                <dd className="text-metric text-ink">
                  <Duration value={detail.monthly.active} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Break</dt>
                <dd className="text-metric text-ink">
                  <Duration value={detail.monthly.break} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Total</dt>
                <dd className="text-metric text-ink">
                  <Duration value={detail.monthly.total} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Overtime</dt>
                <dd className="text-metric text-ink">
                  <Duration value={detail.monthly.overtime} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Required active</dt>
                <dd className="text-metric text-ink">
                  <Duration value={detail.monthly.requiredActive} />
                </dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-5">
              {(
                [
                  ['complete', detail.monthly.completeDayCount],
                  ['under_time', detail.monthly.underTimeDayCount],
                  ['overtime', detail.monthly.overtimeDayCount],
                  ['critical', detail.monthly.criticalDayCount],
                  ['missing', detail.monthly.missingDayCount],
                ] as const
              ).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-2">
                  <StatusIndicator status={status} variant="inline" />
                  <span className="text-body font-semibold text-ink tabular">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === 'attendance' && (
          <Card padding="none">
            <div className="border-b border-border p-4">
              <h2 className="text-h3 text-ink">Attendance</h2>
              <p className="text-caption text-ink-muted">
                Approved leave and holidays are explained states, not missing timesheets.
              </p>
            </div>
            <ul className="divide-y divide-border">
              {detail.attendance.map((day) => (
                <li key={day.date} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-ink">{day.dateLabel}</span>
                    {day.exemptionNote && (
                      <span className="block text-caption text-ink-muted">{day.exemptionNote}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={day.isMissing ? 'missing' : 'neutral'}>{day.stateLabel}</Badge>
                    <Duration value={day.active} />
                    <span className="text-caption text-ink-muted">
                      of <Duration value={day.requiredActive} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(tab === 'wfh' || tab === 'leave') && (
          <Card>
            <CardHeader
              title={tab === 'wfh' ? 'Work from home' : 'Leave'}
              description={
                tab === 'wfh'
                  ? 'Requests, decisions and any audited HR override.'
                  : 'Requests, balances, half-day handling and any audited HR override.'
              }
            />
            {tab === 'leave' && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {detail.leaveBalances.map((balance) => (
                  <li key={balance.leaveType} className="rounded-md border border-border p-3">
                    <p className="text-caption text-ink-muted">{balance.typeLabel}</p>
                    <p className="mt-1 text-body font-semibold text-ink tabular">
                      {balance.remainingDays} of {balance.entitledDays} days
                    </p>
                    <p className="text-caption text-ink-muted">
                      {balance.consumedDays} consumed · {balance.reservedDays} reserved
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-4 space-y-3">
              {(tab === 'wfh' ? detail.wfh : detail.leave).map((request) => (
                <li key={request.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-ink">
                        {request.dateLabel} · {request.portionLabel}
                      </p>
                      <p className="text-caption text-ink-muted">{request.reason}</p>
                    </div>
                    <Badge
                      tone={
                        request.state === 'approved'
                          ? 'success'
                          : request.state === 'rejected'
                            ? 'danger'
                            : 'accent'
                      }
                    >
                      {request.stateLabel}
                    </Badge>
                  </div>
                  {request.decisionLabel && (
                    <p className="mt-2 text-caption text-ink-muted">{request.decisionLabel}</p>
                  )}
                  {request.overrideReason && (
                    <p className="mt-2 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">
                      Audited HR override: {request.overrideReason}
                    </p>
                  )}
                </li>
              ))}
              {(tab === 'wfh' ? detail.wfh : detail.leave).length === 0 && (
                <li className="text-body-sm text-ink-muted">No requests recorded.</li>
              )}
            </ul>
          </Card>
        )}

        {tab === 'evaluations' && (
          <Card>
            <CardHeader
              title="Evaluations"
              description="An evaluation is visible to the employee only once HR publishes it."
            />
            <ul className="mt-4 space-y-2">
              {detail.evaluations.map((evaluation) => (
                <li
                  key={evaluation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-ink">
                      {evaluation.periodLabel}
                    </span>
                    <span className="block text-caption text-ink-muted">
                      {evaluation.weightedScore === null
                        ? 'Not scored'
                        : `${evaluation.weightedScore.toFixed(2)} / 5 weighted`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={evaluation.state === 'published' ? 'success' : 'accent'}>
                      {evaluation.stateLabel}
                    </Badge>
                    <LinkButton variant="ghost" size="sm" href={evaluation.href}>
                      Open
                    </LinkButton>
                  </span>
                </li>
              ))}
              {detail.evaluations.length === 0 && (
                <li className="text-body-sm text-ink-muted">No evaluation recorded.</li>
              )}
            </ul>
          </Card>
        )}

        {tab === 'remarks' && (
          <Card>
            <CardHeader title="General remarks" description="One remark type; correction requests are flagged." />
            <ul className="mt-4 space-y-3">
              {detail.remarks.map((remark) => (
                <li key={remark.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-caption text-ink-muted">
                      {remark.author.fullName} · {remark.createdAtLabel}
                    </p>
                    <span className="flex items-center gap-2">
                      {remark.isCorrectionRequest && <Badge tone="warning">Correction request</Badge>}
                      <Badge tone="neutral">{remark.stateLabel}</Badge>
                    </span>
                  </div>
                  <p className="mt-2 text-body-sm text-ink">{remark.message}</p>
                </li>
              ))}
              {detail.remarks.length === 0 && (
                <li className="text-body-sm text-ink-muted">No remarks recorded.</li>
              )}
            </ul>
          </Card>
        )}

        {tab === 'documents' && (
          <Card>
            <CardHeader
              title="Documents"
              description="A restricted document keeps its title and is explicitly marked, never blanked."
            />
            <ul className="mt-4 space-y-2">
              {detail.documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium text-ink">
                      {document.title}
                    </span>
                    <span className="block text-caption text-ink-muted">
                      {document.categoryLabel} · {document.uploadedAtLabel}
                    </span>
                  </span>
                  {document.isRestricted ? (
                    <RestrictedValue reason="This document needs a separately granted permission." />
                  ) : (
                    <Badge tone="neutral">Available</Badge>
                  )}
                </li>
              ))}
              {detail.documents.length === 0 && (
                <li className="text-body-sm text-ink-muted">No documents on file.</li>
              )}
            </ul>
          </Card>
        )}

        {tab === 'audit' && (
          <Card>
            <CardHeader
              title="Record history"
              description="Actor, action, detail and the recorded reason for every change."
            />
            <ol className="mt-4 space-y-3">
              {detail.auditHistory.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">{entry.action}</p>
                    <p className="text-caption text-ink-muted">
                      {entry.actorLabel} · {entry.occurredAtLabel}
                    </p>
                    <p className="mt-1 text-body-sm text-ink">{entry.detail}</p>
                    {entry.reason && (
                      <p className="text-caption text-ink-muted">Reason: {entry.reason}</p>
                    )}
                  </div>
                </li>
              ))}
              {detail.auditHistory.length === 0 && (
                <li className="text-body-sm text-ink-muted">No recorded changes.</li>
              )}
            </ol>
          </Card>
        )}
      </div>

      {state.status === 'success' && detail.employee.id !== employeeId && (
        <EmptyState variant="no-results" title="Employee not found" />
      )}
    </PageContainer>
  );
}
