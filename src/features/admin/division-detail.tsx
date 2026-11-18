'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import type { DivisionDetailView } from '@/contracts/admin';
import { adminService } from '@/services/runtime/admin';
import { useAsync } from '@/lib/use-async';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { DataTable } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

type Member = DivisionDetailView['members'][number];
type DivisionProject = DivisionDetailView['projects'][number];
type OpenTask = DivisionDetailView['openTasks'][number];

const PROJECT_STATUS_LABEL: Readonly<Record<string, string>> = {
  planned: 'Planned', active: 'Active', on_hold: 'On hold', completed: 'Completed', closed: 'Closed',
};

/**
 * One division in full, for a Super Administrator: who is placed in it, the
 * projects it runs and its open work. Read-only here — placements change on
 * the employee record, projects on the project screen.
 */
export function DivisionDetail({ divisionId }: { divisionId: string }) {
  const { user } = useSession();
  const { state } = useAsync(() => adminService.getDivision(user?.userId ?? '', divisionId), [user?.userId, divisionId]);

  if (state.status === 'loading') return <ReportsLoading label="division" />;
  if (state.status !== 'success') return <ReportsFallback result={state.failure} subject="Division" />;
  const { division, members, projects, openTasks } = state.data;

  return (
    <PageContainer>
      <PageHeader
        title={division.name}
        description={division.description ?? 'Placements, projects and open work in this division.'}
        crumbs={[{ label: 'Divisions', href: '/admin/divisions' }, { label: division.name }]}
        backHref="/admin/divisions"
        backLabel="Divisions"
        meta={
          <>
            <Badge tone="neutral" icon={<Building2 aria-hidden className="size-3.5" />}>{division.code}</Badge>
            <Badge tone={division.isActive ? 'success' : 'neutral'}>{division.isActive ? 'Active' : 'Inactive'}</Badge>
            {division.isRestricted && <Badge tone="warning">Restricted</Badge>}
          </>
        }
      />

      <Card className="mt-5">
        <CardHeader title="Overview" description={`Team Lead ${division.teamLead?.fullName ?? 'not assigned'}`} />
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-caption text-ink-muted">People placed</dt>
            <dd className="text-metric text-ink">{members.length}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Active projects</dt>
            <dd className="text-metric text-ink">{projects.length}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Open tasks</dt>
            <dd className="text-metric text-ink">{division.openTaskCount}</dd>
          </div>
        </dl>
      </Card>

      <section className="mt-6" aria-labelledby="division-people">
        <h2 id="division-people" className="text-h3 text-ink">People</h2>
        <DataTable<Member>
          className="mt-3"
          caption={`People placed in ${division.name}`}
          rows={members}
          getRowId={(row) => `${row.employee.id}-${row.startDateLabel}`}
          emptyState={{ title: 'Nobody is placed in this division', description: 'Add a division assignment from an employee record.' }}
          columns={[
            {
              key: 'employee', header: 'Employee', alwaysVisible: true,
              render: (row) => (
                <span className="min-w-0">
                  <Link href={`/employees/${row.employee.id}`} className="block min-h-6 truncate font-medium text-ink hover:underline">{row.employee.fullName}</Link>
                  <span className="block truncate text-caption text-ink-muted">{row.employee.employeeCode}{row.employee.designation ? ` · ${row.employee.designation}` : ''}</span>
                </span>
              ),
            },
            { key: 'department', header: 'Department', render: (row) => row.departmentName ?? 'Not placed' },
            { key: 'role', header: 'Role in division', hideBelow: 'md', render: (row) => row.roleInDivision ?? 'Not recorded' },
            { key: 'allocation', header: 'Allocation', align: 'right', render: (row) => `${row.allocationPercent}%${row.isPrimary ? ' · Primary' : ''}` },
            { key: 'dates', header: 'Effective', hideBelow: 'lg', render: (row) => `${row.startDateLabel} – ${row.endDateLabel ?? 'Open-ended'}` },
          ]}
        />
      </section>

      <section className="mt-6" aria-labelledby="division-projects">
        <h2 id="division-projects" className="text-h3 text-ink">Projects</h2>
        <DataTable<DivisionProject>
          className="mt-3"
          caption={`Projects in ${division.name}`}
          rows={projects}
          getRowId={(row) => row.id}
          emptyState={{ title: 'No active projects in this division' }}
          columns={[
            {
              key: 'project', header: 'Project', alwaysVisible: true,
              render: (row) => (
                <span className="min-w-0">
                  <Link href={`/projects/${row.id}`} className="block min-h-6 truncate font-medium text-ink hover:underline">{row.name}</Link>
                  <span className="block truncate text-caption text-ink-muted">{row.code}</span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', render: (row) => PROJECT_STATUS_LABEL[row.status] ?? row.status },
            { key: 'manager', header: 'Manager', hideBelow: 'md', render: (row) => row.managerName ?? 'Not assigned' },
            { key: 'open', header: 'Open tasks', align: 'right', render: (row) => row.openTaskCount },
          ]}
        />
      </section>

      <section className="mt-6" aria-labelledby="division-tasks">
        <h2 id="division-tasks" className="text-h3 text-ink">Open tasks</h2>
        <DataTable<OpenTask>
          className="mt-3"
          caption={`Open tasks in ${division.name}`}
          rows={openTasks}
          getRowId={(row) => row.id}
          emptyState={{ title: 'No open tasks in this division' }}
          columns={[
            {
              key: 'task', header: 'Task', alwaysVisible: true,
              render: (row) => (
                <span className="min-w-0">
                  <Link href={`/tasks/${row.id}`} className="block min-h-6 truncate font-medium text-ink hover:underline">{row.title}</Link>
                  <span className="block truncate text-caption text-ink-muted">{row.projectCode}</span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', render: (row) => TASK_STATUS_LABEL[row.status] },
            { key: 'assignee', header: 'Assignee', hideBelow: 'md', render: (row) => row.assigneeName ?? 'Unassigned' },
            { key: 'due', header: 'Due', align: 'right', render: (row) => row.dueDateLabel ?? 'No due date' },
          ]}
        />
      </section>
    </PageContainer>
  );
}
