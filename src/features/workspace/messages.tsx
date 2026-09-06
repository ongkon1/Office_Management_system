'use client';

import * as React from 'react';
import { FlaskConical, Send } from 'lucide-react';
import { mockWorkspaceService } from '@/services/mock/workspace';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Textarea } from '@/components/forms/inputs';
import { Field } from '@/components/forms/field';
import { cn } from '@/lib/cn';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

/**
 * FE-0724 — the messaging prototype.
 *
 * This is deliberately marked as a prototype everywhere it could be mistaken
 * for a working module: a banner at the top, a disabled composer that says why,
 * and no send action that appears to succeed. A convincing fake here would get
 * demonstrated to stakeholders as a delivered feature, and messaging is
 * explicitly deferred to product Phase 3.
 */
export function MessagePrototype() {
  const { user } = useSession();
  const [activeThread, setActiveThread] = React.useState<string | null>(null);

  const { state } = useAsync(
    () => mockWorkspaceService.getMessages(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="messages" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Messages" />;
  }
  const data = state.data;
  const selected =
    data.threads.find((thread) => thread.id === activeThread) ?? data.threads[0] ?? null;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Messages"
        description="Division, project and direct message threads, plus task comments."
        meta={
          <Badge tone="warning" icon={<FlaskConical aria-hidden className="size-3.5" />}>
            Prototype
          </Badge>
        }
      />

      <Alert className="mt-5" tone="warning" title="This is a prototype, not a delivered module">
        {data.prototypeNote} {data.deliveryPhaseLabel}.
      </Alert>

      {data.threads.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No threads"
          description="Threads appear here for the divisions and projects you belong to."
        />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="min-w-0" padding="none">
            <div className="border-b border-border p-4">
              <h2 className="text-h3 text-ink">Threads</h2>
            </div>
            <ul className="divide-y divide-border">
              {data.threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setActiveThread(thread.id)}
                    aria-current={selected?.id === thread.id ? 'true' : undefined}
                    className={cn(
                      'flex min-h-11 w-full flex-col items-start gap-0.5 p-3 text-left',
                      selected?.id === thread.id
                        ? 'bg-accent-subtle'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-medium text-ink">
                        {thread.title}
                      </span>
                      {thread.unreadCount > 0 && (
                        <Badge tone="accent">{thread.unreadCount}</Badge>
                      )}
                    </span>
                    <span className="truncate text-caption text-ink-muted">
                      {thread.kindLabel}
                    </span>
                    <span className="truncate text-caption text-ink-subtle">
                      {thread.lastMessageAtLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected && (
            <Card className="min-w-0">
              <CardHeader title={selected.title} description={selected.subtitle} as="h2" />
              <ul className="mt-4 space-y-3">
                {selected.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      'flex gap-3',
                      message.isOwn && 'flex-row-reverse text-right',
                    )}
                  >
                    <Avatar name={message.authorName} size="sm" />
                    <div
                      className={cn(
                        'min-w-0 max-w-lg rounded-md border p-3',
                        message.isOwn
                          ? 'border-accent-border bg-accent-subtle'
                          : 'border-border bg-surface-sunken',
                      )}
                    >
                      <p className="text-caption text-ink-muted">
                        {message.authorName} · {message.atLabel}
                      </p>
                      <p className="mt-1 text-body-sm text-ink">{message.body}</p>
                    </div>
                  </li>
                ))}
                {selected.messages.length === 0 && (
                  <li className="text-body-sm text-ink-muted">No messages in this thread.</li>
                )}
              </ul>

              <div className="mt-5 border-t border-border pt-4">
                <Field
                  label="Message"
                  disabled
                  helperText="Sending is disabled. Nothing here reaches another person during the frontend milestone."
                >
                  <Textarea rows={3} disabled placeholder="Sending is not available in the prototype" />
                </Field>
                <div className="mt-3">
                  <Button
                    variant="primary"
                    disabled
                    iconLeading={<Send aria-hidden className="size-4" />}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}
