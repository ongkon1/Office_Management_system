'use client';

import * as React from 'react';
import { CalendarClock, Pencil, Trash2, UserCog } from 'lucide-react';
import type { DepartmentCatalogueRowView } from '@/contracts/organization-hierarchy';
import { departmentAdminService as mockDepartmentAdminService } from '@/services/runtime/department-admin';
import { useAsync } from '@/lib/use-async';
import { formatDate } from '@/lib/format';
import { Drawer } from '@/components/feedback/overlay';
import { Alert, Callout } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DepartmentStatusBadge, toFormFailure } from './department-shared';

/**
 * One department in full: who is placed in it now, and who has led it
 * (`OH-FE-0202`, `OH-FE-0206`).
 *
 * The leadership list is read-only by construction. There is no edit control on
 * a historical period and no service operation that would change one — a new
 * appointment closes the open period and adds a row, which is what keeps past
 * authority reproducible. The panel says so in words, because an administrator
 * looking for an edit button deserves to know why there is none.
 */
export function DepartmentDetailDrawer({
  open,
  userId,
  department,
  onClose,
  onEdit,
  onAppointLead,
  onChangeStatus,
  onDelete,
}: {
  open: boolean;
  userId: string;
  department: DepartmentCatalogueRowView | null;
  onClose: () => void;
  onEdit: () => void;
  onAppointLead: () => void;
  onChangeStatus: () => void;
  onDelete: () => void;
}) {
  if (!open || !department) return null;
  return (
    <DepartmentDetailDrawerBody
      userId={userId}
      department={department}
      onClose={onClose}
      onEdit={onEdit}
      onAppointLead={onAppointLead}
      onChangeStatus={onChangeStatus}
      onDelete={onDelete}
    />
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-body-sm text-ink break-words">{children}</dd>
    </div>
  );
}

function DepartmentDetailDrawerBody({
  userId,
  department,
  onClose,
  onEdit,
  onAppointLead,
  onChangeStatus,
  onDelete,
}: {
  userId: string;
  department: DepartmentCatalogueRowView;
  onClose: () => void;
  onEdit: () => void;
  onAppointLead: () => void;
  onChangeStatus: () => void;
  onDelete: () => void;
}) {
  const request = useAsync(
    () => mockDepartmentAdminService.get(userId, department.department.id),
    [userId, department.department.id],
  );

  const detail = request.state.status === 'success' ? request.state.data : null;
  const failure = request.state.status === 'failure' ? toFormFailure(request.state.failure) : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={department.department.name}
      description={`${department.division.name} · ${department.department.code}`}
      size="lg"
      footer={
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            iconLeading={<Pencil aria-hidden className="size-4" />}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            iconLeading={<UserCog aria-hidden className="size-4" />}
            onClick={onAppointLead}
            disabled={!department.department.isActive}
          >
            Appoint lead
          </Button>
          <Button variant="secondary" size="sm" onClick={onChangeStatus}>
            {department.department.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
          {department.canDelete && (
            <Button
              variant="ghost"
              size="sm"
              iconLeading={<Trash2 aria-hidden className="size-4" />}
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact label="Division">{department.division.name}</Fact>
          <Fact label="Code">{department.department.code}</Fact>
          <Fact label="Status">
            <DepartmentStatusBadge isActive={department.department.isActive} />
          </Fact>
          <Fact label="Employees placed today">{department.activeEmployeeCount}</Fact>
          <Fact label="Current lead">
            {department.currentAppointment
              ? `${department.currentAppointment.lead.fullName}, effective from ${department.currentAppointment.effectiveFromLabel}`
              : 'Not appointed'}
          </Fact>
          <Fact label="Scheduled change">
            {department.scheduledAppointment
              ? `${department.scheduledAppointment.lead.fullName} from ${department.scheduledAppointment.effectiveFromLabel}`
              : '—'}
          </Fact>
          <Fact label="Description">{department.department.description ?? '—'}</Fact>
        </dl>

        {!department.department.isActive && (
          <Callout tone="info">
            This department is inactive. Existing placements are unchanged, and no new placement can
            select it.
          </Callout>
        )}

        {department.referenceGuidance && (
          <Callout tone="info">
            {department.department.name} is referenced by employee placements or leadership history,
            so it cannot be deleted or moved to another division. {department.referenceGuidance}
          </Callout>
        )}

        {failure?.blocking && (
          <Alert tone="danger" title={failure.blocking.title} live>
            {failure.blocking.detail}
          </Alert>
        )}

        {request.state.status === 'loading' && (
          <div>
            <p role="status" className="sr-only">
              Loading department placements and leadership history.
            </p>
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {detail && (
          <>
            <section aria-labelledby="department-members">
              <h3 id="department-members" className="text-h3 text-ink">
                Employees placed here
              </h3>
              <p className="mt-1 text-body-sm text-ink-muted">
                Resolved on {formatDate(detail.asOf)}. Placement belongs to a division assignment, so
                an employee may be in a different department in each division.
              </p>
              {detail.members.length === 0 ? (
                <p className="mt-3 text-body-sm text-ink-muted">
                  No employee has ever been placed in this department.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col divide-y divide-border border-y border-border">
                  {detail.members.map((member) => (
                    <li
                      key={member.assignmentId}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0 text-body-sm text-ink break-words">
                        {member.employee.fullName}
                        <span className="text-ink-muted"> · {member.employee.employeeCode}</span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-caption text-ink-muted">
                          {formatDate(member.effectiveFrom)} –{' '}
                          {member.effectiveTo ? formatDate(member.effectiveTo) : 'open'}
                        </span>
                        <Badge tone={member.isEffective ? 'success' : 'neutral'}>
                          {member.isEffective ? 'Placed now' : 'Ended'}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="department-leadership">
              <h3 id="department-leadership" className="text-h3 text-ink">
                Leadership history
              </h3>
              <p className="mt-1 text-body-sm text-ink-muted">
                Newest first. A new appointment closes the current period the day before it starts;
                periods already recorded are kept as they were and cannot be edited.
              </p>
              {detail.leadHistory.length === 0 ? (
                <p className="mt-3 text-body-sm text-ink-muted">
                  This department has never had a lead.
                </p>
              ) : (
                <ol className="mt-3 flex flex-col divide-y divide-border border-y border-border">
                  {detail.leadHistory.map((row) => {
                    const scheduled = row.assignment.effectiveFrom > detail.asOf;
                    return (
                      <li key={row.assignment.id} className="flex min-w-0 flex-col gap-1 py-2">
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 text-body-sm text-ink break-words">
                            {row.lead.fullName}
                          </span>
                          <Badge
                            tone={row.isEffective ? 'success' : scheduled ? 'accent' : 'neutral'}
                            icon={
                              scheduled ? (
                                <CalendarClock aria-hidden className="size-3.5 shrink-0" />
                              ) : undefined
                            }
                          >
                            {row.isEffective ? 'Current' : scheduled ? 'Scheduled' : 'Ended'}
                          </Badge>
                        </div>
                        <p className="text-caption text-ink-muted">
                          {formatDate(row.assignment.effectiveFrom)} –{' '}
                          {row.assignment.effectiveTo
                            ? formatDate(row.assignment.effectiveTo)
                            : 'open'}
                          {row.assignment.reason ? ` · ${row.assignment.reason}` : ''}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
