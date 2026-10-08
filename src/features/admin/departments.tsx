'use client';

import * as React from 'react';
import { Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import type {
  DepartmentCatalogueRowView,
  DepartmentCatalogueView,
} from '@/contracts/organization-hierarchy';
import { departmentAdminService as mockDepartmentAdminService } from '@/services/runtime/department-admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { Field } from '@/components/forms/field';
import { SearchInput, Select } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { MenuItem } from '@/components/feedback/overlay';
import { DepartmentFormDialog } from './department-form';
import { AppointLeadDialog } from './department-lead-dialog';
import { DepartmentDetailDrawer } from './department-detail-drawer';
import {
  DepartmentDeleteDialog,
  DepartmentStatusDialog,
} from './department-status-dialogs';
import { DepartmentStatusBadge, LeadSummary } from './department-shared';

type Overlay = 'create' | 'edit' | 'appoint' | 'status' | 'delete' | 'detail' | null;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Active and inactive' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

/**
 * The Super Administrator department catalogue (`OH-FE-0201`–`OH-FE-0209`).
 *
 * It replaces the preliminary primary-department screen rather than extending
 * it. Departments are grouped under the division that owns them, because that
 * ownership is the rule the rest of the hierarchy rests on: a name is unique
 * only inside a division, a lead must be assigned to that division, and a
 * placement must choose a department from its own division.
 *
 * Nothing on this screen decides what may be changed. Every row arrives with
 * the service's answer (`canChangeDivision`, `canDeactivate`, `canDelete`), the
 * dialogs send the change back to the service, and a refusal is shown with its
 * corrective guidance. Hiding a control is never the control.
 */
export function DepartmentAdministration() {
  const { user } = useSession();
  const userId = user?.userId ?? '';
  const toast = useToast();

  const [divisionId, setDivisionId] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const [selected, setSelected] = React.useState<DepartmentCatalogueRowView | null>(null);

  const request = useAsync(
    () =>
      mockDepartmentAdminService.catalogue(userId, {
        divisionId: divisionId || null,
        status: status === 'active' ? 'active' : status === 'inactive' ? 'inactive' : 'all',
        search,
      }),
    [userId, divisionId, status, search],
  );

  const filtered = divisionId !== '' || status !== 'all' || search.trim() !== '';

  /*
   * Every mutation reloads the catalogue *and* re-reads the selected row from
   * the fresh data, so a drawer left open after a change shows the change
   * rather than the row as it was when it opened.
   */
  const view: DepartmentCatalogueView | null =
    request.state.status === 'success' ? request.state.data : null;

  const selectedId = selected?.department.id ?? null;
  const currentSelected = React.useMemo(() => {
    if (!selectedId) return null;
    const fresh = view?.groups
      .flatMap((group) => group.departments)
      .find((row) => row.department.id === selectedId);
    return fresh ?? selected;
  }, [selectedId, selected, view]);

  function succeeded(title: string, description: string, keepOpen: Overlay = null) {
    setOverlay(keepOpen);
    request.reload();
    toast.show({ tone: 'success', title, description });
  }

  function open(next: Exclude<Overlay, null>, row: DepartmentCatalogueRowView | null) {
    setSelected(row);
    setOverlay(next);
  }

  function rowActions(row: DepartmentCatalogueRowView): readonly MenuItem[] {
    return [
      {
        key: 'detail',
        label: 'View placements and leadership',
        onSelect: () => open('detail', row),
      },
      {
        key: 'edit',
        label: 'Edit department',
        icon: <Pencil aria-hidden className="size-4" />,
        onSelect: () => open('edit', row),
      },
      {
        key: 'appoint',
        label: 'Appoint lead',
        icon: <UserCog aria-hidden className="size-4" />,
        disabled: !row.department.isActive,
        onSelect: () => open('appoint', row),
      },
      {
        key: 'status',
        label: row.department.isActive ? 'Deactivate department' : 'Reactivate department',
        onSelect: () => open('status', row),
      },
      {
        key: 'delete',
        label: 'Delete department',
        icon: <Trash2 aria-hidden className="size-4" />,
        destructive: true,
        /* Referenced departments are deactivated instead; the drawer and the
           row both state why the action is unavailable (`OH-FE-0208`). */
        disabled: !row.canDelete,
        onSelect: () => open('delete', row),
      },
    ];
  }

  const columns: readonly DataTableColumn<DepartmentCatalogueRowView>[] = [
    {
      key: 'name',
      header: 'Department',
      alwaysVisible: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-2 text-body-sm font-medium text-ink break-words">
            {row.department.name}
            <Badge tone="neutral">{row.department.code}</Badge>
          </p>
          {row.department.description && (
            <p className="mt-0.5 text-caption text-ink-muted break-words">
              {row.department.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <DepartmentStatusBadge isActive={row.department.isActive} />,
    },
    {
      key: 'lead',
      header: 'Current lead',
      render: (row) => (
        <LeadSummary current={row.currentAppointment} scheduled={row.scheduledAppointment} />
      ),
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
      render: (row) => (
        <span className="text-body-sm text-ink">
          {row.activeEmployeeCount}
          <span className="sr-only"> employees placed today</span>
        </span>
      ),
    },
  ];

  return (
    <PageContainer width="full">
      <PageHeader
        title="Departments"
        description="Departments are owned by a division. Their leads are appointed with an effective date, and history is kept."
        meta={
          view ? (
            <Badge tone="neutral">
              {view.departmentCount === view.totalCount
                ? `${view.totalCount} departments`
                : `${view.departmentCount} of ${view.totalCount} departments`}
            </Badge>
          ) : undefined
        }
        actions={
          <Button
            variant="primary"
            iconLeading={<Plus aria-hidden className="size-4" />}
            onClick={() => open('create', null)}
          >
            New department
          </Button>
        }
      />

      <Callout tone="info" className="mt-5">
        Only Super Administrators can change this catalogue. A name and a code are unique inside a
        division, so two divisions may each have a Sales department. A department referenced by
        placements or leadership is deactivated rather than deleted or moved.
        {view ? ` Leads shown are the ones effective on ${view.asOfLabel}.` : ''}
      </Callout>

      {/* The filters stay mounted through a reload: a screen that swaps itself
          for a skeleton unmounts the field being typed into. */}
      <Card className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Division">
            <Select
              name="division-filter"
              value={divisionId}
              options={[
                { value: '', label: 'All divisions' },
                ...(view?.divisionOptions ?? []).map((option) => ({ ...option })),
              ]}
              onChange={(event) => setDivisionId(event.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              name="status-filter"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(event) => setStatus(event.target.value)}
            />
          </Field>
          <Field label="Search" helperText="Matches a department name or code.">
            <SearchInput
              name="department-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      {request.state.status === 'loading' && (
        <div className="mt-5">
          <p role="status" className="sr-only">
            Loading the department catalogue.
          </p>
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {request.state.status === 'failure' && (
        <CatalogueFailure failure={request.state.failure} onRetry={request.reload} />
      )}

      {view && view.departmentCount === 0 && (
        <EmptyState
          className="mt-5"
          variant={filtered ? 'no-results' : 'empty'}
          title={filtered ? 'No department matches these filters' : 'No departments yet'}
          description={
            filtered
              ? 'Widen the division, status or search filter to see more.'
              : 'Create the first department to make it available on division assignment forms.'
          }
          action={
            filtered
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setDivisionId('');
                    setStatus('all');
                    setSearch('');
                  },
                }
              : { label: 'New department', onClick: () => open('create', null) }
          }
        />
      )}

      {view?.groups.map((group) => (
        <section key={group.division.id} className="mt-6" aria-labelledby={`division-${group.division.id}`}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h2 id={`division-${group.division.id}`} className="text-h3 text-ink break-words">
              {group.division.name}
            </h2>
            <p className="min-w-0 text-caption text-ink-muted">
              {group.activeCount} active · {group.inactiveCount} inactive
            </p>
          </div>
          <DataTable
            className="mt-3"
            caption={`Departments in ${group.division.name}`}
            rows={group.departments}
            columns={columns}
            getRowId={(row) => row.department.id}
            rowActions={rowActions}
            onRowClick={(row) => open('detail', row)}
            renderMobileCard={(row) => (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-body-sm font-medium text-ink break-words">
                    {row.department.name}
                  </span>
                  <Badge tone="neutral">{row.department.code}</Badge>
                  <DepartmentStatusBadge isActive={row.department.isActive} />
                </div>
                <LeadSummary current={row.currentAppointment} scheduled={row.scheduledAppointment} />
                <p className="text-caption text-ink-muted">
                  {row.activeEmployeeCount} employee{row.activeEmployeeCount === 1 ? '' : 's'} placed
                  today
                </p>
                {row.referenceGuidance && (
                  <p className="text-caption text-ink-subtle break-words">
                    Referenced by placements or leadership history. {row.referenceGuidance}
                  </p>
                )}
              </div>
            )}
          />
        </section>
      ))}

      <DepartmentFormDialog
        open={overlay === 'create' || overlay === 'edit'}
        userId={userId}
        editing={overlay === 'edit' ? currentSelected : null}
        divisionOptions={view?.divisionOptions ?? []}
        onClose={() => setOverlay(null)}
        onSaved={(title, description) => succeeded(title, description)}
      />

      <AppointLeadDialog
        open={overlay === 'appoint'}
        userId={userId}
        today={view?.asOf ?? ''}
        department={currentSelected}
        onClose={() => setOverlay(null)}
        onSaved={(title, description) => succeeded(title, description)}
      />

      <DepartmentStatusDialog
        open={overlay === 'status'}
        userId={userId}
        department={currentSelected}
        onClose={() => setOverlay(null)}
        onSaved={(title, description) => succeeded(title, description)}
      />

      <DepartmentDeleteDialog
        open={overlay === 'delete'}
        userId={userId}
        department={currentSelected}
        onClose={() => setOverlay(null)}
        onDeleted={(title, description) => {
          setSelected(null);
          succeeded(title, description);
        }}
      />

      <DepartmentDetailDrawer
        open={overlay === 'detail'}
        userId={userId}
        department={currentSelected}
        onClose={() => setOverlay(null)}
        onEdit={() => setOverlay('edit')}
        onAppointLead={() => setOverlay('appoint')}
        onChangeStatus={() => setOverlay('status')}
        onDelete={() => setOverlay('delete')}
      />
    </PageContainer>
  );
}

/**
 * The catalogue's own failure states (`OH-FE-0209`).
 *
 * A denial says what the viewer would need and offers a way back, rather than
 * an empty table that reads as "there are no departments".
 */
function CatalogueFailure({
  failure,
  onRetry,
}: {
  failure: Exclude<
    Awaited<ReturnType<typeof mockDepartmentAdminService.catalogue>>,
    { status: 'success' }
  >;
  onRetry: () => void;
}) {
  if (failure.status === 'permission_denied') {
    return (
      <EmptyState
        className="mt-5"
        variant="denied"
        title="Not available to your role"
        description={`${failure.message} ${failure.guidance ?? ''}`.trim()}
        secondaryAction={
          <LinkButton href="/dashboard" variant="secondary" size="sm">
            Back to dashboard
          </LinkButton>
        }
      />
    );
  }
  if (failure.status === 'unauthenticated') {
    return (
      <EmptyState
        className="mt-5"
        variant="denied"
        title="Your session has ended"
        description="Sign in again to manage departments."
        secondaryAction={
          <LinkButton
            href={`/login?returnTo=${encodeURIComponent('/admin/departments')}`}
            variant="secondary"
            size="sm"
          >
            Sign in
          </LinkButton>
        }
      />
    );
  }
  return (
    <EmptyState
      className="mt-5"
      variant="error"
      title="The department catalogue could not be loaded"
      description="Nothing has been changed. Try again in a moment."
      action={{ label: 'Try again', onClick: onRetry }}
    />
  );
}
