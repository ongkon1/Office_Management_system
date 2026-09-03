'use client';

import * as React from 'react';
import Link from 'next/link';
import type { FinanceHoursRowView, FinanceOvertimeRowView } from '@/contracts/finance';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout } from '@/components/feedback/alert';
import { DataTable } from '@/components/data/data-table';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  CostPermissionBadge,
  DIVISION_FILTER_OPTIONS,
  EMPLOYEE_FILTER_OPTIONS,
  FinanceFallback,
  FinanceLoading,
  MoneyValue,
  PeriodPicker,
  PROJECT_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

/** Shared filter state for both tables. */
function useFinanceFilters() {
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);
  const [employeeIds, setEmployeeIds] = React.useState<readonly string[]>([]);
  const [divisionIds, setDivisionIds] = React.useState<readonly string[]>([]);
  const [projectIds, setProjectIds] = React.useState<readonly string[]>([]);
  const [statuses, setStatuses] = React.useState<readonly string[]>([]);

  const applied = [
    ...employeeIds.map((value) => ({
      key: `emp-${value}`,
      label: 'Employee',
      value: EMPLOYEE_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setEmployeeIds(employeeIds.filter((item) => item !== value)),
    })),
    ...divisionIds.map((value) => ({
      key: `div-${value}`,
      label: 'Division',
      value: DIVISION_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setDivisionIds(divisionIds.filter((item) => item !== value)),
    })),
    ...projectIds.map((value) => ({
      key: `prj-${value}`,
      label: 'Project',
      value: PROJECT_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setProjectIds(projectIds.filter((item) => item !== value)),
    })),
    ...statuses.map((value) => ({
      key: `st-${value}`,
      label: 'Status',
      value: STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setStatuses(statuses.filter((item) => item !== value)),
    })),
  ];

  return {
    periodId,
    setPeriodId,
    employeeIds,
    setEmployeeIds,
    divisionIds,
    setDivisionIds,
    projectIds,
    setProjectIds,
    statuses,
    setStatuses,
    applied,
    clearAll: () => {
      setEmployeeIds([]);
      setDivisionIds([]);
      setProjectIds([]);
      setStatuses([]);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* FE-0603 — employee hours                                                   */
/* -------------------------------------------------------------------------- */

export function EmployeeHours() {
  const { user } = useSession();
  const filters = useFinanceFilters();

  const { state } = useAsync(
    () =>
      mockFinanceService.getHours(user?.userId ?? '', {
        periodId: filters.periodId,
        employeeIds: filters.employeeIds,
        divisionIds: filters.divisionIds,
        projectIds: filters.projectIds,
        statuses: filters.statuses,
      }),
    [
      user?.userId,
      filters.periodId,
      filters.employeeIds,
      filters.divisionIds,
      filters.projectIds,
      filters.statuses,
    ],
  );

  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="employee hours" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Employee hours" />;
  }
  const data = state.data;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Employee hours"
        description="Verified active, break and overtime time by payroll period, employee, division and project."
        crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Employee hours' }]}
        backHref="/finance"
        backLabel="Finance"
        meta={
          <>
            <VerificationBadge period={data.period} />
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
          </>
        }
        actions={
          periodState.status === 'success' ? (
            <PeriodPicker
              periods={periodState.data}
              value={data.period.id}
              onChange={filters.setPeriodId}
            />
          ) : null
        }
      />

      <UnverifiedWarning warning={data.unverifiedWarning} />

      <FilterBar
        className="mt-5"
        applied={filters.applied}
        onClearAll={filters.clearAll}
        resultSummary={`${data.rows.length} row${data.rows.length === 1 ? '' : 's'}`}
      >
        <MultiSelectFilter
          label="Employee"
          options={EMPLOYEE_FILTER_OPTIONS}
          selected={filters.employeeIds}
          onChange={filters.setEmployeeIds}
        />
        <MultiSelectFilter
          label="Division"
          options={DIVISION_FILTER_OPTIONS}
          selected={filters.divisionIds}
          onChange={filters.setDivisionIds}
        />
        <MultiSelectFilter
          label="Project"
          options={PROJECT_FILTER_OPTIONS}
          selected={filters.projectIds}
          onChange={filters.setProjectIds}
        />
        <MultiSelectFilter
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          selected={filters.statuses}
          onChange={filters.setStatuses}
        />
      </FilterBar>

      <Callout tone="info" className="mt-4">
        The break is one recognized value per employee-day. Where a day spans several divisions it
        is attributed proportionally across these rows, never added once per row.
      </Callout>

      <DataTable<FinanceHoursRowView>
        className="mt-4"
        caption={`Employee hours for ${data.period.label}`}
        rows={data.rows}
        getRowId={(row) => row.key}
        emptyState={{
          variant: filters.applied.length ? 'no-results' : 'empty',
          title: filters.applied.length ? 'No hours match these filters' : 'No verified hours in this period',
          description: filters.applied.length
            ? 'Clear a filter to widen the result set.'
            : 'Choose a period that has recorded time.',
        }}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            alwaysVisible: true,
            render: (row) => (
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                <span className="block truncate text-caption text-ink-muted">
                  {row.employee.employeeCode}
                </span>
              </span>
            ),
          },
          {
            key: 'division',
            header: 'Division',
            hideBelow: 'md',
            render: (row) => (
              <span className="flex items-center gap-1.5">
                {row.division.code}
                {row.division.isRestricted && <Badge tone="warning">Restricted</Badge>}
              </span>
            ),
          },
          {
            key: 'project',
            header: 'Project',
            hideBelow: 'lg',
            render: (row) => (
              <span className="flex items-center gap-1.5">
                <span className="truncate">{row.projectLabel}</span>
                <Badge tone={row.isBillable ? 'accent' : 'neutral'}>
                  {row.isBillable ? 'Billable' : 'Non-billable'}
                </Badge>
              </span>
            ),
          },
          {
            key: 'active',
            header: 'Active',
            align: 'right',
            render: (row) => <Duration value={row.active} />,
          },
          {
            key: 'break',
            header: 'Break',
            align: 'right',
            hideBelow: 'md',
            render: (row) => <Duration value={row.break} />,
          },
          {
            key: 'total',
            header: 'Total',
            align: 'right',
            hideBelow: 'md',
            render: (row) => <Duration value={row.total} />,
          },
          {
            key: 'overtime',
            header: 'Overtime',
            align: 'right',
            hideBelow: 'lg',
            render: (row) => <Duration value={row.overtime} />,
          },
          {
            key: 'cost',
            header: 'Labour cost',
            align: 'right',
            render: (row) => <MoneyValue value={row.cost} />,
          },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                <span className="block truncate text-caption text-ink-muted">
                  {row.division.code} · {row.projectLabel}
                </span>
              </span>
              <Badge tone={row.isBillable ? 'accent' : 'neutral'}>
                {row.isBillable ? 'Billable' : 'Non-billable'}
              </Badge>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-caption">
              <div>
                <dt className="text-ink-muted">Active</dt>
                <dd className="font-semibold text-ink">
                  <Duration value={row.active} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Overtime</dt>
                <dd className="font-semibold text-ink">
                  <Duration value={row.overtime} />
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Cost</dt>
                <dd className="font-semibold text-ink">
                  <MoneyValue value={row.cost} />
                </dd>
              </div>
            </dl>
          </div>
        )}
      />

      <Card className="mt-5">
        <CardHeader title="Period totals" description="The filtered rows, reconciled." />
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <div>
            <dt className="text-caption text-ink-muted">Active</dt>
            <dd className="text-metric text-ink">
              <Duration value={data.totals.active} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Break</dt>
            <dd className="text-metric text-ink">
              <Duration value={data.totals.break} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Total</dt>
            <dd className="text-metric text-ink">
              <Duration value={data.totals.total} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Overtime</dt>
            <dd className="text-metric text-ink">
              <Duration value={data.totals.overtime} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Labour cost</dt>
            <dd className="text-metric text-ink">
              <MoneyValue value={data.totals.cost} emphasis compact />
            </dd>
          </div>
        </dl>
      </Card>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0603 — overtime                                                         */
/* -------------------------------------------------------------------------- */

export function OvertimeAnalysis() {
  const { user } = useSession();
  const filters = useFinanceFilters();

  const { state } = useAsync(
    () =>
      mockFinanceService.getOvertime(user?.userId ?? '', {
        periodId: filters.periodId,
        employeeIds: filters.employeeIds,
        divisionIds: filters.divisionIds,
      }),
    [user?.userId, filters.periodId, filters.employeeIds, filters.divisionIds],
  );
  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="overtime" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Overtime" />;
  }
  const data = state.data;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Overtime"
        description="Days above eight hours in the selected payroll period, with the recorded reason."
        crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Overtime' }]}
        backHref="/finance"
        backLabel="Finance"
        meta={
          <>
            <VerificationBadge period={data.period} />
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
          </>
        }
        actions={
          periodState.status === 'success' ? (
            <PeriodPicker
              periods={periodState.data}
              value={data.period.id}
              onChange={filters.setPeriodId}
            />
          ) : null
        }
      />

      <UnverifiedWarning warning={data.unverifiedWarning} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-label text-ink-muted">Total overtime</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.totalOvertime} />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Overtime days</p>
          <p className="mt-1 text-metric text-ink tabular">{data.overtimeDayCount}</p>
          <p className="mt-1 text-caption text-ink-muted">Above 8:00 through exactly 12:00.</p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Critical days</p>
          <p className="mt-1 text-metric text-ink tabular">{data.criticalDayCount}</p>
          <p className="mt-1 text-caption text-ink-muted">Above 12:00, explanation required.</p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Overtime cost</p>
          <p className="mt-1 text-metric text-ink">
            <MoneyValue value={data.totalCost} emphasis compact />
          </p>
        </Card>
      </div>

      <FilterBar
        className="mt-5"
        applied={filters.applied.filter((chip) => !chip.key.startsWith('prj-') && !chip.key.startsWith('st-'))}
        onClearAll={filters.clearAll}
        resultSummary={`${data.rows.length} overtime day${data.rows.length === 1 ? '' : 's'}`}
      >
        <MultiSelectFilter
          label="Employee"
          options={EMPLOYEE_FILTER_OPTIONS}
          selected={filters.employeeIds}
          onChange={filters.setEmployeeIds}
        />
        <MultiSelectFilter
          label="Division"
          options={DIVISION_FILTER_OPTIONS}
          selected={filters.divisionIds}
          onChange={filters.setDivisionIds}
        />
      </FilterBar>

      <DataTable<FinanceOvertimeRowView>
        className="mt-4"
        caption={`Overtime days for ${data.period.label}`}
        rows={data.rows}
        getRowId={(row) => row.key}
        emptyState={{
          title: 'No overtime in this period',
          description: 'Every recorded day was at or below eight hours in total.',
        }}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            alwaysVisible: true,
            render: (row) => (
              <Link href={row.href} className="inline-flex min-h-6 items-center font-medium text-ink hover:underline">
                {row.employee.fullName}
              </Link>
            ),
          },
          { key: 'date', header: 'Date', render: (row) => row.dateLabel },
          { key: 'division', header: 'Division', hideBelow: 'md', render: (row) => row.division.code },
          {
            key: 'status',
            header: 'Classification',
            render: (row) => <StatusIndicator status={row.status} variant="inline" />,
          },
          {
            key: 'total',
            header: 'Day total',
            align: 'right',
            hideBelow: 'md',
            render: (row) => <Duration value={row.total} />,
          },
          {
            key: 'overtime',
            header: 'Overtime',
            align: 'right',
            render: (row) => <Duration value={row.overtime} />,
          },
          {
            key: 'reason',
            header: 'Recorded reason',
            hideBelow: 'lg',
            render: (row) =>
              row.reason ?? <span className="text-ink-muted">No reason recorded</span>,
          },
          {
            key: 'cost',
            header: 'Overtime cost',
            align: 'right',
            render: (row) => <MoneyValue value={row.cost} />,
          },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <Link href={row.href} className="block min-h-6 truncate font-medium text-ink hover:underline">
                  {row.employee.fullName}
                </Link>
                <span className="block text-caption text-ink-muted">
                  {row.dateLabel} · {row.division.code}
                </span>
              </span>
              <StatusIndicator status={row.status} variant="badge" />
            </div>
            <p className="mt-2 text-caption text-ink-muted">
              Total <Duration value={row.total} /> · overtime <Duration value={row.overtime} />
            </p>
            {row.reason && <p className="mt-1 text-caption text-ink">{row.reason}</p>}
          </div>
        )}
      />
    </PageContainer>
  );
}
