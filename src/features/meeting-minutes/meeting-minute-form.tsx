'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import type {
  MeetingMinuteFields,
  MeetingMinuteProjectOption,
} from '@/contracts/meeting-minutes';
import { success } from '@/contracts/results';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { FormErrorSummary } from '@/components/forms/field';
import { MinuteFields } from './minute-fields';
import { Checkbox } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const CRUMBS = [
  { label: 'Meeting Minutes', href: '/meeting-minutes' },
  { label: 'Add Meeting Minute' },
];

const EMPTY_FIELDS: MeetingMinuteFields = {
  title: '',
  clientId: '',
  projectId: '',
  content: '',
};

interface FormError {
  readonly field: string;
  readonly message: string;
}


/** One key per attempt, so a double submit cannot create a second minute. */
function newIdempotencyKey(): string {
  return `mm-create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Moves focus to the control a summary entry names. Without this the summary's
 * entries are buttons that look actionable and do nothing; the browser scrolls
 * the focused control into view by itself, so no scrolling is animated here.
 */
function focusField(field: string) {
  document.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
}

function FormSkeleton() {
  return (
    <div className="mt-5 flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * `FE-1113` — the Add Meeting Minute form.
 *
 * Four decisions worth knowing before changing it:
 *
 * - **The client is chosen before the project, and the project list comes from
 *   the service.** `REQ-MTG-005` restricts the project to an active, authorized
 *   project of the chosen client, and that is a record-level rule, so the
 *   options are fetched per client rather than filtered from a bundle held on
 *   the page. A viewer who may not see a project never receives it.
 * - **The content editor is a long-form textarea, not a contenteditable
 *   surface.** `REQ-MTG-006` asks for accessible long-form *or* rich text; a
 *   textarea is the accessible one. A custom editor would have to rebuild
 *   labelling, error wiring, caret behaviour and mobile keyboards, and usually
 *   gets them wrong. Formatting pasted from another tool is stripped by
 *   `sanitizeMinuteContent` in the service — the form never decides what is
 *   safe to store.
 * - **Process with AI is a choice on the minute, not a second step.** Clearing
 *   it means the minute is saved and stays Not Processed (`REQ-MTG-008`).
 * - **Validation is the service's answer.** The form submits with `noValidate`
 *   so the browser's own bubble cannot pre-empt the field message *and* the
 *   corrective guidance that `REQ-TIME-025` requires.
 *
 * `FE-1114` adds the validation presentation: each of the six codes reaches its
 * own field with the service's message *and* its corrective guidance, editing a
 * field drops that field's error, changing the client clears the project, the
 * two length limits are reachable rather than capped by the control, and one
 * failure focuses its field while several focus the summary.
 *
 * The save messaging and the Pending hand-off are `FE-1115`.
 */
export function MeetingMinuteForm() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const userId = user?.userId ?? '';

  const [fields, setFields] = React.useState<MeetingMinuteFields>(EMPTY_FIELDS);
  const [processWithAi, setProcessWithAi] = React.useState(false);
  const [errors, setErrors] = React.useState<readonly FormError[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  /*
   * One key for one attempt at saving *this* content, kept across retries.
   *
   * A fresh key per click is the natural-looking version and it is wrong: when
   * a save actually stored the minute but the response was lost, pressing Save
   * again with a new key writes a second minute. Reusing the key lets the
   * service recognise the repeat and hand back the first outcome
   * (`REQ-MTG-023`). It is cleared when the content changes, because that is a
   * different minute.
   */
  const idempotencyKey = React.useRef<string | null>(null);

  const context = useAsync(
    () => mockMeetingMinutesService.createContext(userId),
    [userId],
  );

  /*
   * Options for the chosen client. Deliberately *not* `keepPrevious`: holding
   * the last answer would leave one client's projects on screen labelled as
   * another's, which is the one way this picker could offer a pair that does
   * not belong together. The select empties and says it is loading instead.
   */
  const projects = useAsync<readonly MeetingMinuteProjectOption[]>(
    () =>
      fields.clientId
        ? mockMeetingMinutesService.listProjectOptions(userId, fields.clientId)
        : Promise.resolve(success<readonly MeetingMinuteProjectOption[]>([])),
    [userId, fields.clientId],
  );

  /*
   * Editing a field drops its own error. Leaving it would keep telling someone
   * their title is missing while they are typing one, and the service's answer
   * describes the values it was sent, not the ones on screen now.
   */
  function clearErrors(...changed: readonly string[]) {
    setErrors((current) => current.filter((error) => !changed.includes(error.field)));
  }

  function set<K extends keyof MeetingMinuteFields>(key: K, value: MeetingMinuteFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    clearErrors(key);
    // Different content is a different minute, so it may not reuse the key.
    idempotencyKey.current = null;
  }

  /* A project belongs to one client, so changing the client invalidates it. */
  function chooseClient(clientId: string) {
    setFields((current) => ({ ...current, clientId, projectId: '' }));
    clearErrors('clientId', 'projectId');
  }

  if (context.state.status === 'loading') {
    return (
      <PageContainer>
        <PageHeader title="Add Meeting Minute" crumbs={CRUMBS} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
        <p role="status" className="sr-only">
          Loading the meeting minute form.
        </p>
        <FormSkeleton />
      </PageContainer>
    );
  }

  if (context.state.status === 'failure') {
    const failure = context.state.failure;
    return (
      <PageContainer>
        <PageHeader title="Add Meeting Minute" crumbs={CRUMBS} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
        <EmptyState
          className="mt-5"
          variant={failure.status === 'permission_denied' ? 'denied' : 'error'}
          title={
            failure.status === 'permission_denied'
              ? 'You cannot add meeting minutes'
              : failure.status === 'unauthenticated'
                ? 'Your session has ended'
                : 'The form could not be loaded'
          }
          description={
            failure.status === 'permission_denied'
              ? 'A Team Lead, HR Manager or Super Administrator records a meeting minute. You can still read the minutes in your scope.'
              : failure.status === 'unauthenticated'
                ? 'Sign in again to record a meeting minute.'
                : 'Try again in a moment.'
          }
          action={
            failure.status === 'error' ? { label: 'Try again', onClick: context.reload } : undefined
          }
          secondaryAction={
            failure.status === 'unauthenticated' ? (
              <LinkButton
                href="/login?returnTo=%2Fmeeting-minutes%2Fnew"
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

  const { clients, limits } = context.state.data;
  const projectOptions = projects.state.status === 'success' ? projects.state.data : [];
  const projectsLoaded = projects.state.status === 'success';
  const projectsLoading = projects.state.status === 'loading' && fields.clientId !== '';
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  /*
   * A second guard behind `chooseClient`, derived rather than stored: if the
   * answer for this client no longer offers the selected project — it was
   * deactivated, or the viewer's scope changed under them — the selection is
   * dropped here too, so what the form submits is always something the option
   * list currently contains. Doing it in an effect would set state during
   * render and is what the React Compiler rules forbid.
   */
  const projectId =
    projectsLoaded && fields.projectId !== '' &&
    !projectOptions.some((project) => project.id === fields.projectId)
      ? ''
      : fields.projectId;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setErrors([]);
    setBlocked(null);
    setSaving(true);

    idempotencyKey.current ??= newIdempotencyKey();

    /*
     * Saving waits for the minute to be stored and for nothing else. The
     * service returns as soon as the record exists and a job has been queued
     * or refused; it never waits for AI to finish (`REQ-MTG-009`), so this
     * `await` is the length of a write, not of a provider call.
     */
    const result = await mockMeetingMinutesService.create(userId, {
      ...fields,
      projectId,
      processWithAi,
      idempotencyKey: idempotencyKey.current,
    });
    setSaving(false);

    if (result.status === 'success') {
      const { minute, processingStarted } = result.data;
      // The content is committed, so the key has done its job.
      idempotencyKey.current = null;
      toast.show({
        tone: 'success',
        title: 'Meeting minute saved',
        description: minute.aiRequested
          ? processingStarted
            ? 'Task generation is queued. The minute is saved either way.'
            : 'Task generation could not be started. The minute is saved.'
          : undefined,
      });
      /*
       * The minute's own page, as the information architecture specifies: it
       * opens showing the saved record and its processing status, including
       * Pending when a run was queued (`REQ-MTG-009`). `FE-1115` could not do
       * this while `/meeting-minutes/[id]` was still a placeholder and used a
       * saved state on this route instead; `FE-1120` made the page real.
       *
       * `replace`, so Back returns to the list rather than reopening a form
       * that has already been submitted.
       */
      router.replace(`/meeting-minutes/${minute.id}`);
      return;
    }

    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          // Both halves, always: `REQ-TIME-025` wants what is wrong *and* how
          // to fix it, and the service is the only thing that knows either.
          message: `${error.message} ${error.guidance}`,
        })),
      );
      /*
       * One failure goes straight to its control; several go to the summary,
       * which lists them in field order and links to each. Sending a single
       * error to a one-item summary would add a step to reach the only field
       * that needs attention.
       */
      if (result.fieldErrors.length === 1 && result.focusField) {
        focusField(result.focusField);
      }
      return;
    }

    setBlocked(
      'guidance' in result && result.guidance ? `${result.message} ${result.guidance}` : result.message,
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Add Meeting Minute"
        description="Record what a client meeting covered, against the project it belongs to."
        crumbs={CRUMBS}
        backHref="/meeting-minutes"
        backLabel="Meeting Minutes"
      />

      {clients.length === 0 && (
        <Callout tone="warning" className="mt-5">
          No client with an active project is available to you, so a minute cannot be recorded yet.
        </Callout>
      )}

      <form className="mt-4" onSubmit={submit} noValidate>
        <MinuteFields
          values={{ ...fields, projectId }}
          clients={clients}
          projectOptions={projectOptions}
          projectsLoading={projectsLoading}
          limits={limits}
          errorFor={errorFor}
          onChange={set}
          onClientChange={chooseClient}
          minuteCardDescription="The human record of the meeting. It is saved before anything else happens to it."
          notices={
            <>
              {errors.length > 0 && (
                <FormErrorSummary
                  className="mt-4"
                  title="This meeting minute could not be saved"
                  errors={errors}
                  onFocusField={focusField}
                  autoFocus={errors.length > 1}
                />
              )}
              {blocked && (
                <Callout tone="warning" className="mt-4">
                  {blocked}
                </Callout>
              )}
            </>
          }
        />

        <Card className="mt-4">
          <CardHeader
            title="Task generation"
            description="Optional. Saving stores the minute first; AI runs afterwards, in the background."
          />

          <div className="mt-4">
            <Checkbox
              name="processWithAi"
              label="Process with AI"
              description="Reads the minute in the background and proposes tasks for review. Saving does not wait for it."
              checked={processWithAi}
              onChange={(event) => setProcessWithAi(event.target.checked)}
            />
          </div>
        </Card>

        <StickyActionBar>
          <LinkButton href="/meeting-minutes" variant="secondary">
            Cancel
          </LinkButton>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={clients.length === 0}
            iconLeading={<Save aria-hidden className="size-4" />}
          >
            {saving ? 'Saving the minute' : 'Save meeting minute'}
          </Button>
        </StickyActionBar>
      </form>
    </PageContainer>
  );
}
