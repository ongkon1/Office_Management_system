'use client';

import * as React from 'react';
import { KeyRound, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { PermissionGrantView, RoleAdminView, UserAdminView } from '@/contracts/admin';
import type { RoleKey } from '@/contracts/domain';
import { mockAdminService } from '@/services/mock/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { DataTable } from '@/components/data/data-table';
import { Switch } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

/**
 * FE-0731 — users, roles and permissions.
 *
 * Every sensitive grant states its *consequence*, not just its name, and
 * granting one asks for confirmation with that consequence spelled out. A
 * permission list that reads "finance.cost.view — view financial detail" tells
 * an administrator nothing about what they are about to expose.
 */
export function UserAdministration() {
  const { user } = useSession();
  const { state } = useAsync(
    () => mockAdminService.listUsers(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="users" />;
  if (state.status !== 'success') return <ReportsFallback result={state.failure} subject="Users" />;
  const users = state.data;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Users"
        description="Accounts, their roles, the scope each one carries and any sensitive permissions."
        meta={<Badge tone="neutral">{users.length} accounts</Badge>}
      />

      <Callout tone="info" className="mt-5">
        Scope is what a role can reach; a sensitive permission is what it may additionally read.
        Both are listed here, because an account’s real reach is the combination.
      </Callout>

      <DataTable<UserAdminView>
        className="mt-5"
        caption="User accounts"
        rows={users}
        getRowId={(row) => row.userId}
        emptyState={{ title: 'No accounts' }}
        columns={[
          {
            key: 'user',
            header: 'Account',
            alwaysVisible: true,
            render: (row) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={row.employee.fullName} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {row.employee.fullName}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">{row.email}</span>
                </span>
              </span>
            ),
          },
          {
            key: 'roles',
            header: 'Roles',
            hideBelow: 'md',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                {row.roleLabels.map((label) => (
                  <Badge key={label} tone={label === 'Employee' ? 'neutral' : 'accent'}>
                    {label}
                  </Badge>
                ))}
              </span>
            ),
          },
          {
            key: 'scope',
            header: 'Scope',
            hideBelow: 'lg',
            render: (row) => (
              <span className="text-caption text-ink-muted">{row.scopeSummary}</span>
            ),
          },
          {
            key: 'permissions',
            header: 'Sensitive permissions',
            hideBelow: 'lg',
            render: (row) =>
              row.sensitivePermissions.length ? (
                <span className="flex flex-wrap gap-1">
                  {row.sensitivePermissions.map((label) => (
                    <Badge key={label} tone="warning">
                      {label}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-ink-muted">None</span>
              ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge
                  tone={
                    row.status === 'active'
                      ? 'success'
                      : row.status === 'locked'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {row.statusLabel}
                </Badge>
                {row.twoFactorEnabled && <Badge tone="info">2FA</Badge>}
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
                  <span className="block truncate text-caption text-ink-muted">{row.email}</span>
                </span>
              </span>
              <Badge tone={row.status === 'active' ? 'success' : 'neutral'}>
                {row.statusLabel}
              </Badge>
            </div>
            <p className="mt-2 text-caption text-ink-muted">
              {row.roleLabels.join(', ')} · {row.scopeSummary}
            </p>
            {row.sensitivePermissions.length > 0 && (
              <p className="mt-1 text-caption text-undertime">
                {row.sensitivePermissions.join(', ')}
              </p>
            )}
          </div>
        )}
      />
    </PageContainer>
  );
}

export function RoleAdministration() {
  const { user } = useSession();
  const toast = useToast();
  const [pending, setPending] = React.useState<{
    role: RoleAdminView;
    permission: PermissionGrantView;
  } | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockAdminService.listRoles(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="roles" />;
  if (state.status !== 'success') return <ReportsFallback result={state.failure} subject="Roles" />;
  const roles = state.data;

  async function apply(role: RoleKey, permission: string, granted: boolean) {
    setFailure(null);
    const result = await mockAdminService.setRolePermission(
      user?.userId ?? '',
      role,
      permission,
      granted,
    );
    if (result.status === 'success') {
      setPending(null);
      reload();
      toast.show({
        tone: granted ? 'warning' : 'info',
        title: granted ? 'Sensitive permission granted' : 'Permission removed',
        description: granted
          ? 'Everyone holding this role can now read the data it covers.'
          : 'Everyone holding this role loses that access immediately.',
      });
      return;
    }
    setFailure(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Roles and permissions"
        description="What each role can reach, and the sensitive permissions granted on top of it."
        meta={<Badge tone="neutral">{roles.length} roles</Badge>}
      />

      {failure && (
        <Alert className="mt-4" tone="danger" title="Could not change the permission" live>
          {failure}
        </Alert>
      )}

      <Callout tone="warning" className="mt-5">
        A sensitive permission widens what protected data a role can read. Changing one here
        affects every account holding that role, immediately.
      </Callout>

      <div className="mt-5 space-y-5">
        {roles.map((role) => (
          <Card key={role.key}>
            <CardHeader
              title={role.label}
              description={role.description}
              as="h2"
              actions={<Badge tone="neutral">{role.userCount} account(s)</Badge>}
            />
            <p className="mt-2 text-caption text-ink-muted">
              <span className="font-medium text-ink">Scope:</span> {role.scopeSummary}
            </p>

            <ul className="mt-4 space-y-2">
              {role.permissions.map((permission) => (
                <li
                  key={permission.key}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                        <ShieldAlert aria-hidden className="size-3.5 shrink-0 text-warning" />
                        {permission.label}
                        <code className="rounded-xs bg-surface-sunken px-1 py-0.5 text-caption text-ink-muted">
                          {permission.key}
                        </code>
                      </p>
                      <p className="mt-1 text-caption text-ink-muted">{permission.description}</p>
                      <p className="mt-1 text-caption text-undertime">
                        {permission.consequence}
                      </p>
                    </div>
                    <Switch
                      checked={permission.granted}
                      onCheckedChange={(checked) => {
                        if (checked) setPending({ role, permission });
                        else apply(role.key, permission.key, false);
                      }}
                      label={permission.granted ? 'Granted' : 'Not granted'}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Grant this sensitive permission?"
        description={
          pending ? `${pending.permission.label} · ${pending.role.label}` : undefined
        }
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                pending && apply(pending.role.key, pending.permission.key, true)
              }
            >
              Grant permission
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            <Alert tone="warning" title="What this grants">
              {pending.permission.consequence}
            </Alert>
            <p className="flex items-start gap-2 text-body-sm text-ink-muted">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              This applies to all {pending.role.userCount} account(s) holding the{' '}
              {pending.role.label} role, and takes effect immediately. The change is recorded in
              the audit log.
            </p>
            <p className="flex items-start gap-2 text-caption text-ink-muted">
              <KeyRound aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Permission key <code>{pending.permission.key}</code>
            </p>
          </div>
        )}
      </Dialog>
    </PageContainer>
  );
}
