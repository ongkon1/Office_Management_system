'use client';

import * as React from 'react';
import { LogOut, MonitorSmartphone, RefreshCw } from 'lucide-react';
import type { AdminSessionView } from '@/contracts/admin';
import { groupSessionsByUser, type AdminUserPresenceView } from './session-users';
import { adminService } from '@/services/runtime/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Callout, Alert } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { DataTable } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

const STATUS_TONE: Readonly<Record<AdminSessionView['status'], BadgeTone>> = {
  online: 'success',
  idle: 'warning',
  expired: 'neutral',
};

export function SessionAdministration() {
  const { user } = useSession();
  const toast = useToast();
  const [selected, setSelected] = React.useState<AdminUserPresenceView | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const { state, reload } = useAsync(
    () => adminService.listSessions(user?.userId ?? ''),
    [user?.userId],
  );

  async function forceLogout() {
    if (!selected) return;
    setSaving(true);
    setFailure(null);
    const actionable = selected.sessions.filter((session) => session.canForceLogout);
    const results = await Promise.all(
      actionable.map((session) =>
        adminService.forceLogoutSession(user?.userId ?? '', session.sessionId),
      ),
    );
    setSaving(false);
    const result = results.find(
      (item) => item.status !== 'success' && item.status !== 'conflict' && item.status !== 'not_found',
    );
    if (!result) {
      setSelected(null);
      reload();
      toast.show({
        tone: 'success',
        title: actionable.length === 1 ? 'Session ended' : 'Sessions ended',
        description: `${selected.employee.fullName} will be asked to sign in again on the affected devices.`,
      });
      return;
    }
    setFailure('guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message);
  }

  if (state.status === 'loading') return <ReportsLoading label="active sessions" />;
  if (state.status !== 'success') return <ReportsFallback result={state.failure} subject="Sessions" />;

  const people = groupSessionsByUser(state.data);
  const online = people.filter((person) => person.status === 'online').length;
  const idle = people.filter((person) => person.status === 'idle').length;
  const expired = people.filter((person) => person.status === 'expired').length;

  const statusBadge = (person: AdminUserPresenceView) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={STATUS_TONE[person.status]}>{person.statusLabel}</Badge>
      {person.isCurrentSession && <Badge tone="info">Current user</Badge>}
    </span>
  );

  const action = (person: AdminUserPresenceView) => person.canForceLogout ? (
    <Button
      size="sm"
      variant="danger"
      iconLeading={<LogOut aria-hidden className="size-4" />}
      onClick={() => {
        setFailure(null);
        setSelected(person);
      }}
    >
      Force logout
    </Button>
  ) : <span className="text-caption text-ink-muted">No action</span>;

  return (
    <PageContainer width="full">
      <PageHeader
        title="User session status"
        description="See every active user once, their current login status, and the devices they have used."
        crumbs={[{ label: 'Administration' }, { label: 'User session status' }]}
        meta={
          <>
            <Badge tone="success">{online} online</Badge>
            <Badge tone="warning">{idle} idle</Badge>
            <Badge tone="neutral">{expired} expired</Badge>
          </>
        }
        actions={
          <Button
            variant="secondary"
            iconLeading={<RefreshCw aria-hidden className="size-4" />}
            onClick={reload}
          >
            Refresh
          </Button>
        }
      />

      <Callout tone="info" className="mt-5">
        Each user appears once, even when signed in on several devices. Online means at least one session was active within the last five minutes. Idle means the user still has a valid session but has not been active recently. Expired means no known session can access the application.
      </Callout>

      {failure && (
        <Alert className="mt-4" tone="danger" title="Could not end the session" live>
          {failure}
        </Alert>
      )}

      <DataTable<AdminUserPresenceView>
        className="mt-5"
        caption="User login sessions"
        rows={people}
        getRowId={(row) => row.userId}
        emptyState={{ title: 'No active users', description: 'Active user accounts will appear here.' }}
        columns={[
          {
            key: 'employee', header: 'Employee and role', alwaysVisible: true,
            render: (row) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} src={row.employee.avatarUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                  <span className="block truncate text-caption text-ink-muted">{row.roleLabel}</span>
                </span>
              </span>
            ),
          },
          {
            key: 'device', header: 'Device / browser', hideBelow: 'md',
            render: (row) => (
              <span className="flex items-start gap-2">
                <MonitorSmartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <span>
                  <span className="block text-ink">{row.deviceLabel}</span>
                  <span className="block text-caption text-ink-muted">{row.browserLabel}</span>
                </span>
              </span>
            ),
          },
          { key: 'status', header: 'User status', render: statusBadge },
          { key: 'actions', header: 'Actions', alwaysVisible: true, align: 'right', render: action },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} src={row.employee.avatarUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                  <span className="block text-caption text-ink-muted">{row.roleLabel}</span>
                </span>
              </span>
              {statusBadge(row)}
            </div>
            <p className="mt-3 text-body-sm text-ink">{row.deviceLabel}</p>
            <p className="text-caption text-ink-muted">{row.browserLabel}</p>
            <div className="mt-3">{action(row)}</div>
          </div>
        )}
      />

      <Dialog
        open={selected !== null}
        onClose={() => {
          if (!saving) setSelected(null);
        }}
        title="Force this user to log out?"
        description={selected?.employee.fullName}
        dismissOnBackdrop={!saving}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button>
            <Button variant="danger" loading={saving} onClick={forceLogout}>Force logout</Button>
          </>
        }
      >
        <p className="text-body-sm text-ink-muted">
          This ends all eligible sessions for this user across {selected?.deviceLabel}. Your own current administrator session is always protected. Unsaved work on affected devices may be lost, and the user must sign in again.
        </p>
      </Dialog>
    </PageContainer>
  );
}
