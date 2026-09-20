'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Save } from 'lucide-react';
import type { MeetingMinuteFields, MeetingMinuteProjectOption } from '@/contracts/meeting-minutes';
import { success } from '@/contracts/results';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { FormErrorSummary } from '@/components/forms/field';
import { Button, LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MinuteFields } from './minute-fields';

interface FormError {
  readonly field: string;
  readonly message: string;
}

function focusField(field: string) {
  document.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
}

function newIdempotencyKey(): string {
  return `mm-archive-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * `FE-1116` — Edit and Archive.
 *
 * The shape of this screen is decided by three rules that are easy to state
 * and easy to get wrong:
 *
 * - **Not found hides existence.** A minute the viewer cannot read answers
 *   exactly as a nonexistent id does. `permission_denied` is reached only for
 *   a minute they can already read, so "you may not change this one" reveals
 *   nothing new (`AC-MTG-009`). Both come from the service; this screen only
 *   renders what it is told.
 * - **A stale version is a conflict, not a save.** The form carries the
 *   version it loaded. If the stored minute moved on, the save is refused and
 *   the user is offered the current version — their typing is never silently
 *   written over someone else's, and their own text stays on screen until
 *   they choose.
 * - **Archiving is not deleting.** `REQ-MTG-018` keeps the minute, its
 *   processing history and its generated-task links; the confirmation says so
 *   in those words, because "Archive" on its own reads as "remove".
 */
export function MeetingMinuteEdit({ minuteId }: { minuteId: string }) {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const userId = user?.userId ?? '';

  const [fields, setFields] = React.useState<MeetingMinuteFields | null>(null);
  const [errors, setErrors] = React.useState<readonly FormError[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const archiveKey = React.useRef<string | null>(null);

  const context = useAsync(
    () => mockMeetingMinutesService.editContext(userId, minuteId),
    [userId, minuteId],
  );

  /*
   * The loaded values become the form's state on first render of a successful
   * load, keyed by the record and its version. Derived during render rather
   * than copied in an effect, which would paint the empty form for a frame and
   * trips the React Compiler's set-state-in-effect rule.
   */
  const loaded = context.state.status === 'success' ? context.state.data : null;
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const currentKey = loaded ? `${loaded.minuteId}@${loaded.version}` : null;
  if (loaded && currentKey && currentKey !== loadedKey) {
    setLoadedKey(currentKey);
    setFields(loaded.values);
    setErrors([]);
    setConflict(null);
  }

  /*
   * The loaded context already carries the options for the minute's own
   * client, so they are used as they are. Only a *changed* client needs the
   * service. Routing the unchanged case through a promise as well briefly
   * rendered an empty select for a minute whose project was never in doubt.
   */
  const clientChanged = Boolean(fields && loaded && fields.clientId !== loaded.values.clientId);
  const fetchedProjects = useAsync<readonly MeetingMinuteProjectOption[]>(
    () =>
      clientChanged && fields
        ? mockMeetingMinutesService.listProjectOptions(userId, fields.clientId)
        : Promise.resolve(success<readonly MeetingMinuteProjectOption[]>([])),
    [userId, clientChanged, fields?.clientId, loaded?.minuteId, loaded?.version],
  );

  function clearErrors(...changed: readonly string[]) {
    setErrors((current) => current.filter((error) => !changed.includes(error.field)));
  }

  function set<K extends keyof MeetingMinuteFields>(key: K, value: MeetingMinuteFields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current));
    clearErrors(key);
  }

  function chooseClient(clientId: string) {
    setFields((current) => (current ? { ...current, clientId, projectId: '' } : current));
    clearErrors('clientId', 'projectId');
  }

  if (context.state.status === 'loading' || !fields || !loaded) {
    if (context.state.status === 'failure') {
      const failure = context.state.failure;
      const denied = failure.status === 'permission_denied';
      const gone = failure.status === 'not_found';
      const archived = failure.status === 'conflict';

      return (
        <PageContainer>
          <PageHeader title="Edit Meeting Minute" crumbs={CRUMBS} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
          <EmptyState
            className="mt-5"
            variant={denied || archived ? 'denied' : gone ? 'no-results' : 'error'}
            title={
              gone
                ? 'That meeting minute could not be found'
                : denied
                  ? 'You cannot change this meeting minute'
                  : archived
                    ? 'This meeting minute is archived'
                    : 'The minute could not be loaded'
            }
            description={
              gone
                ? 'It may have been archived, or the link may be wrong.'
                : denied
                  ? 'Its creator, or a Super Administrator, can edit or archive it. You can still read it.'
                  : archived
                    ? 'An archived minute is kept exactly as it was, including anything generated from it, and no longer accepts changes.'
                    : 'Try again in a moment.'
            }
            action={
              failure.status === 'error' ? { label: 'Try again', onClick: context.reload } : undefined
            }
            secondaryAction={
              <LinkButton href="/meeting-minutes" variant="secondary" size="sm">
                Back to Meeting Minutes
              </LinkButton>
            }
          />
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        <PageHeader title="Edit Meeting Minute" crumbs={CRUMBS} backHref="/meeting-minutes" backLabel="Meeting Minutes" />
        <p role="status" className="sr-only">
          Loading the meeting minute.
        </p>
        <div className="mt-5 flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  const projectOptions = clientChanged
    ? fetchedProjects.state.status === 'success'
      ? fetchedProjects.state.data
      : []
    : loaded.projects;
  const projectsLoading = clientChanged && fetchedProjects.state.status === 'loading';
  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !fields || !loaded) return;
    setErrors([]);
    setBlocked(null);
    setConflict(null);
    setSaving(true);

    const result = await mockMeetingMinutesService.update(userId, {
      ...fields,
      minuteId: loaded.minuteId,
      expectedVersion: loaded.version,
    });
    setSaving(false);

    if (result.status === 'success') {
      toast.show({ tone: 'success', title: 'Meeting minute updated' });
      router.push(`/meeting-minutes/${result.data.id}`);
      return;
    }

    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
      if (result.fieldErrors.length === 1 && result.focusField) focusField(result.focusField);
      return;
    }

    if (result.status === 'conflict') {
      // The user's text stays on screen; reloading is their decision.
      setConflict(`${result.message} ${result.guidance}`);
      return;
    }

    setBlocked(
      'guidance' in result && result.guidance ? `${result.message} ${result.guidance}` : result.message,
    );
  }

  async function archive() {
    if (archiving || !loaded) return;
    setArchiving(true);
    archiveKey.current ??= newIdempotencyKey();

    const result = await mockMeetingMinutesService.archive(userId, {
      minuteId: loaded.minuteId,
      expectedVersion: loaded.version,
      idempotencyKey: archiveKey.current,
    });
    setArchiving(false);
    setConfirmArchive(false);

    if (result.status === 'success') {
      archiveKey.current = null;
      toast.show({
        tone: 'success',
        title: 'Meeting minute archived',
        description: 'It is kept, with anything generated from it, and no longer accepts changes.',
      });
      router.push('/meeting-minutes');
      return;
    }

    if (result.status === 'conflict') {
      setConflict(`${result.message} ${result.guidance}`);
      return;
    }

    setBlocked(
      'guidance' in result && result.guidance ? `${result.message} ${result.guidance}` : result.message,
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Edit Meeting Minute"
        description="Correct the record of the meeting. Editing never starts, repeats or cancels AI processing."
        crumbs={CRUMBS}
        backHref={`/meeting-minutes/${loaded.minuteId}`}
        backLabel="Back to the minute"
      />

      <form className="mt-4" onSubmit={save} noValidate>
        <MinuteFields
          values={fields}
          clients={loaded.clients}
          projectOptions={projectOptions}
          projectsLoading={projectsLoading}
          limits={loaded.limits}
          errorFor={errorFor}
          onChange={set}
          onClientChange={chooseClient}
          minuteCardDescription="The human record of the meeting. Its AI processing is not affected by an edit."
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
              {conflict && (
                <Callout tone="warning" className="mt-4">
                  {conflict}{' '}
                  <button
                    type="button"
                    onClick={context.reload}
                    className="min-h-6 rounded-xs font-medium underline underline-offset-2"
                  >
                    Reload the minute
                  </button>
                </Callout>
              )}
              {blocked && (
                <Callout tone="warning" className="mt-4">
                  {blocked}
                </Callout>
              )}
            </>
          }
        />

        {loaded.canArchive && (
          <Card className="mt-4">
            <h2 className="text-h3 text-ink">Archive</h2>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
              Archiving keeps this minute and everything linked to it, including any tasks generated
              from the meeting. It stops further changes and takes the minute out of the default
              list, where it stays findable with <span className="font-medium">Include archived</span>.
              Nothing is deleted.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                iconLeading={<Archive aria-hidden className="size-4" />}
                onClick={() => setConfirmArchive(true)}
              >
                Archive this minute
              </Button>
            </div>
          </Card>
        )}

        <StickyActionBar>
          <LinkButton href={`/meeting-minutes/${loaded.minuteId}`} variant="secondary">
            Cancel
          </LinkButton>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            iconLeading={<Save aria-hidden className="size-4" />}
          >
            {saving ? 'Saving changes' : 'Save changes'}
          </Button>
        </StickyActionBar>
      </form>

      {/* `Dialog` traps focus and returns it to the trigger when it closes. */}
      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive this meeting minute?"
        description="The minute is kept, with its processing history and any generated tasks. It stops accepting changes and leaves the default list."
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              Keep it active
            </Button>
            <Button variant="primary" loading={archiving} onClick={archive}>
              {archiving ? 'Archiving' : 'Archive minute'}
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}

const CRUMBS = [
  { label: 'Meeting Minutes', href: '/meeting-minutes' },
  { label: 'Edit Meeting Minute' },
];
