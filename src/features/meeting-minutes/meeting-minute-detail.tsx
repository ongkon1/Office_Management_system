'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProcessingStatusIndicator } from '@/components/ui/status-indicator';
import { ProcessingStatusAnnouncer } from '@/components/ui/processing-status-announcer';
import { describeMinuteProcessingStatus } from '@/lib/status';
import { AiInterpretation } from './ai-interpretation';
import { GeneratedTasks } from './generated-tasks';
import { ProcessingFailure } from './processing-failure';
import { RequestProcessing } from './request-processing';
import { useProcessingWatch } from './use-processing-watch';
import { useToast } from '@/components/feedback/toast';

const CRUMB_ROOT = { label: 'Meeting Minutes', href: '/meeting-minutes' };

/** A labelled fact. `—` is the one way this product writes "no value". */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-body-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * The human minute, as stored.
 *
 * `content` is `SanitizedMinuteContent`: a value only the service produces,
 * and only by passing raw input through `sanitizeMinuteContent`, which drops
 * `script`, `style`, `iframe`, `object` and `embed` with their text, strips
 * every attribute from the seven tags it keeps, and escapes whatever is left
 * (`REQ-MTG-006`). Rendering it as markup is therefore safe **because of that
 * guarantee, not because of anything done here** — this component must never
 * be handed a string from anywhere else, and must never sanitize one itself.
 */
function MinuteContent({ content }: { content: string }) {
  return (
    <div
      className={[
        // `break-words`: a pasted link or reference with no spaces must wrap
        // inside the card, not widen the page on a phone (`FE-1133`).
        'mt-4 max-w-2xl text-body text-ink break-words',
        '[&>*:first-child]:mt-0',
        '[&_p]:mt-3',
        '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mt-1',
        '[&_strong]:font-semibold',
      ].join(' ')}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="mt-5 flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * `FE-1120` — the minute's detail page (`REQ-MTG-016`).
 *
 * Three things this screen is careful about:
 *
 * - **A minute it cannot show is simply not found.** The service never
 *   returns `permission_denied` for a read, so an out-of-scope id and a
 *   nonexistent one produce the same page, with no title, client, project or
 *   status on it (`AC-MTG-009`). The page title stays generic until the
 *   service has authorized the record, so nothing leaks through the heading or
 *   the breadcrumb either.
 * - **The AI choice and the processing status are different facts.** A minute
 *   can have asked for AI and still be showing a failure; reporting only one
 *   of the two would hide which. Both are shown, with the status carrying
 *   shape, text and colour rather than colour alone.
 * - **Archived is a state of the record, not a reason to hide it.** An
 *   archived minute stays readable so links from generated tasks keep working,
 *   and says what archiving kept (`REQ-MTG-018`).
 *
 * Around the minute: the AI summary and decisions (`FE-1122`), the tasks
 * created from the meeting (`FE-1123`), a failed run and its retry
 * (`FE-1125`), and a watch that refreshes the page when a run moves on
 * (`FE-1126`).
 */
export function MeetingMinuteDetail({ minuteId }: { minuteId: string }) {
  const { user } = useSession();
  const userId = user?.userId ?? '';

  const toast = useToast();

  /*
   * `keepPrevious`: a refresh of *this* minute keeps it on screen instead of
   * dropping to a skeleton, so a background update or a retry never resets the
   * reader's scroll position (`FE-1126`). It is safe only because the page
   * mounts this component with `key={id}` — another minute is a fresh
   * instance, so one minute's data can never stand in for another's.
   */
  const request = useAsync(
    () => mockMeetingMinutesService.get(userId, minuteId),
    [userId, minuteId],
    { keepPrevious: true },
  );

  /*
   * `FE-1121`. The announcer sits outside the loading, failure and success
   * branches so it is never unmounted by them: a refresh passes through
   * `loading` on its way to a new status, and an announcer inside the success
   * branch would remount there and mistake the change for first sight.
   */
  const status = request.state.status === 'success' ? request.state.data.processing.status : null;
  const title = request.state.status === 'success' ? request.state.data.title : '';

  /*
   * `FE-1126`. While a run is queued or running, watch it; when it moves on,
   * reload. A finished or failed run also raises a visible notice. That
   * notice is visual only — the announcer above already speaks the change,
   * and two live regions would read it out twice.
   */
  useProcessingWatch(
    userId,
    status === null ? [] : [{ id: minuteId, status }],
    (changes) => {
      const to = changes[0]?.to;
      if (to === 'processed') {
        toast.show({
          tone: 'success',
          title: 'Task generation finished',
          description: `${title}: the summary and any tasks are below.`,
          announce: false,
        });
      } else if (to === 'failed') {
        toast.show({
          tone: 'warning',
          title: 'Task generation failed',
          description: `${title}: your meeting minute is saved, and you can retry.`,
          announce: false,
        });
      }
      request.reload();
    },
  );

  return (
    <>
      <ProcessingStatusAnnouncer recordId={minuteId} status={status} />
      <DetailBody minuteId={minuteId} userId={userId} request={request} />
    </>
  );
}

function DetailBody({
  minuteId,
  userId,
  request,
}: {
  minuteId: string;
  userId: string;
  request: ReturnType<typeof useAsync<MeetingMinuteDetailView>>;
}) {
  if (request.state.status === 'loading') {
    return (
      <PageContainer>
        <PageHeader title="Meeting minute" crumbs={[CRUMB_ROOT, { label: 'Meeting minute' }]} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
        <p role="status" className="sr-only">
          Loading the meeting minute.
        </p>
        <DetailSkeleton />
      </PageContainer>
    );
  }

  if (request.state.status === 'failure') {
    const failure = request.state.failure;
    const gone = failure.status === 'not_found';
    const signedOut = failure.status === 'unauthenticated';

    return (
      <PageContainer>
        <PageHeader title="Meeting minute" crumbs={[CRUMB_ROOT, { label: 'Meeting minute' }]} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
        <EmptyState
          className="mt-5"
          variant={gone ? 'no-results' : signedOut ? 'denied' : 'error'}
          title={
            gone
              ? 'That meeting minute could not be found'
              : signedOut
                ? 'Your session has ended'
                : 'The meeting minute could not be loaded'
          }
          description={
            gone
              ? 'The link may be wrong, or the minute may not be one you can see.'
              : signedOut
                ? 'Sign in again to read this meeting minute.'
                : 'Try again in a moment.'
          }
          action={failure.status === 'error' ? { label: 'Try again', onClick: request.reload } : undefined}
          secondaryAction={
            signedOut ? (
              <LinkButton
                href={`/login?returnTo=${encodeURIComponent(`/meeting-minutes/${minuteId}`)}`}
                variant="secondary"
                size="sm"
              >
                Sign in
              </LinkButton>
            ) : (
              <LinkButton href="/meeting-minutes" variant="secondary" size="sm">
                Back to Meeting Minutes
              </LinkButton>
            )
          }
        />
      </PageContainer>
    );
  }

  const minute: MeetingMinuteDetailView = request.state.data;

  return (
    <PageContainer>
      <PageHeader
        title={minute.title}
        crumbs={[CRUMB_ROOT, { label: minute.title }]}
        backHref="/meeting-minutes"
        backLabel="Meeting Minutes"
        meta={
          <>
            <ProcessingStatusIndicator status={minute.processing.status} />
            {minute.archived && <Badge tone="neutral">Archived</Badge>}
          </>
        }
        actions={
          minute.actions.canEdit ? (
            <LinkButton
              href={minute.editHref}
              variant="secondary"
              iconLeading={<Pencil aria-hidden className="size-4" />}
            >
              Edit
            </LinkButton>
          ) : undefined
        }
      />

      {minute.archived && (
        <Callout tone="info" className="mt-5">
          Archived on {minute.archived.archivedAtLabel} by {minute.archived.archivedByName}. The
          minute is kept exactly as it was, with anything generated from it, and no longer accepts
          changes.
        </Callout>
      )}

      {/* First, when it applies: a failure is the one thing here that may
          need the reader to act (`FE-1125`). */}
      <ProcessingFailure minute={minute} userId={userId} onChanged={request.reload} />

      <Card className="mt-5">
        <CardHeader
          title="Minute"
          description="The human record of the meeting, as it was saved."
        />
        <MinuteContent content={minute.content} />
      </Card>

      {/* Directly after the minute, so the reading sits next to what it reads,
          and in its own section so it is never mistaken for part of it. */}
      <AiInterpretation minute={minute} />

      {/* Work created from the meeting — a third thing, neither the minute nor
          a description of it (`FE-1123`). */}
      <GeneratedTasks minute={minute} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Client">{minute.client.name}</Fact>
            <Fact label="Project">{minute.project.name}</Fact>
            <Fact label="Recorded by">{minute.creatorName}</Fact>
            <Fact label="Created">{minute.createdAtLabel}</Fact>
            <Fact label="Last updated">{minute.updatedAtLabel}</Fact>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Task generation"
            description="What was asked of AI, and where that request stands."
          />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* The choice and the outcome are separate facts: a minute can
                have asked for AI and still be showing a failure. */}
            <Fact label="AI requested">{minute.aiRequestedLabel}</Fact>
            <Fact label="Status">
              <ProcessingStatusIndicator status={minute.processing.status} />
            </Fact>
            <Fact label="Processed">{minute.processing.processedAtLabel ?? '—'}</Fact>
            <Fact label="Runs">{minute.processing.attemptCount}</Fact>
          </dl>

          {/* The label names the state; this says what it means (`FE-1121`). */}
          <p className="mt-4 text-body-sm text-ink-muted">
            {describeMinuteProcessingStatus(minute.processing.status).meaning}
          </p>

          {/* Only when the service allows it: Not Processed, and the viewer may
              change the minute (`FE-1131`). */}
          <RequestProcessing minute={minute} userId={userId} onChanged={request.reload} />

        </Card>
      </div>
    </PageContainer>
  );
}
