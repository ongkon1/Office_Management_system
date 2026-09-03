'use client';

import * as React from 'react';
import Link from 'next/link';
import { BellOff, CheckCheck, Circle } from 'lucide-react';
import type { NotificationItemView } from '@/contracts/workspace';
import { mockWorkspaceService } from '@/services/mock/workspace';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

function NotificationRow({
  item,
  onToggleRead,
}: {
  item: NotificationItemView;
  onToggleRead: (item: NotificationItemView) => void;
}) {
  return (
    <li
      className={cn(
        'rounded-md border p-3',
        item.isRead ? 'border-border bg-surface' : 'border-accent-border bg-accent-subtle',
      )}
    >
      <div className="flex items-start gap-3">
        {!item.isRead && (
          <Circle
            aria-hidden
            className="mt-1.5 size-2 shrink-0 fill-accent text-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-body-sm font-medium text-ink">{item.title}</p>
            <span className="flex flex-wrap items-center gap-1.5">
              {item.requiresAction && <Badge tone="warning">Needs action</Badge>}
              {!item.isRead && <Badge tone="accent">Unread</Badge>}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-ink-muted">{item.body}</p>
          <p className="mt-1 text-caption text-ink-subtle">
            {item.createdAtLabel}
            {item.relatedLabel ? ` · ${item.relatedLabel}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {item.href && (
              <Link
                href={item.href}
                className="inline-flex min-h-6 items-center text-caption text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Open the record
              </Link>
            )}
            <button
              type="button"
              onClick={() => onToggleRead(item)}
              className="inline-flex min-h-6 items-center text-caption text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              {item.isRead ? 'Mark as unread' : 'Mark as read'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * FE-0710 — the notification centre.
 *
 * Grouped by what the recipient is meant to do, not by module: everything that
 * needs an action is lifted into one group at the top, because a list ordered
 * by time buries the two items that matter under twenty that do not.
 *
 * No body carries restricted content. A notification names the record and links
 * to it; the check happens there (`REQ-NOT-004`).
 */
export function NotificationCentre() {
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState('all');

  const { state, reload } = useAsync(
    () => mockWorkspaceService.getNotifications(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="notifications" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Notifications" />;
  }
  const data = state.data;
  const allItems = data.groups.flatMap((group) => group.items);

  async function toggleRead(item: NotificationItemView) {
    const result = await mockWorkspaceService.markNotificationRead(
      user?.userId ?? '',
      item.id,
      !item.isRead,
    );
    if (result.status === 'success') reload();
  }

  async function markAll() {
    const result = await mockWorkspaceService.markAllNotificationsRead(user?.userId ?? '');
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'success',
        title: 'All notifications marked as read',
        description: 'Nothing was dismissed; every notification is still listed.',
      });
    }
  }

  const groups =
    tab === 'unread'
      ? data.groups
          .map((group) => ({ ...group, items: group.items.filter((item) => !item.isRead) }))
          .filter((group) => group.items.length > 0)
      : tab === 'action'
        ? data.groups
            .map((group) => ({ ...group, items: group.items.filter((item) => item.requiresAction) }))
            .filter((group) => group.items.length > 0)
        : data.groups;

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Grouped by what they need from you, newest first within each group."
        meta={
          <Badge tone={data.unreadCount > 0 ? 'accent' : 'neutral'}>
            {data.unreadCount} unread
          </Badge>
        }
        actions={
          <Button
            variant="secondary"
            onClick={markAll}
            disabled={data.unreadCount === 0}
            iconLeading={<CheckCheck aria-hidden className="size-4" />}
          >
            Mark all as read
          </Button>
        }
      />

      <Tabs
        className="mt-5"
        items={[
          { key: 'all', label: 'All', badgeCount: allItems.length },
          { key: 'unread', label: 'Unread', badgeCount: data.unreadCount },
          {
            key: 'action',
            label: 'Needs action',
            badgeCount: allItems.filter((item) => item.requiresAction).length,
          },
        ]}
        activeKey={tab}
        onChange={setTab}
        label="Notification views"
      />

      <Callout tone="info" className="mt-4">
        A notification never contains protected detail. It names the record and links to it, and
        your access is checked when you open it.
      </Callout>

      {groups.length === 0 ? (
        <EmptyState
          className="mt-5"
          variant={tab === 'all' ? 'empty' : 'no-results'}
          title={
            tab === 'unread'
              ? 'Nothing unread'
              : tab === 'action'
                ? 'Nothing needs your action'
                : 'No notifications yet'
          }
          description={
            tab === 'all'
              ? 'Notifications about your time, work and requests appear here.'
              : 'Switch to All to see everything.'
          }
        />
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader title={group.label} as="h2" />
              <ul className="mt-4 space-y-2">
                {group.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onToggleRead={toggleRead} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {allItems.length > 0 && data.unreadCount === 0 && tab === 'all' && (
        <p className="mt-4 flex items-center gap-2 text-caption text-ink-muted">
          <BellOff aria-hidden className="size-3.5" />
          Everything here has been read.
        </p>
      )}
    </PageContainer>
  );
}
