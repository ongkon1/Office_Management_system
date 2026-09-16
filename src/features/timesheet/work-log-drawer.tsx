'use client';

import * as React from 'react';
import type { WorkLocation } from '@/contracts/domain';
import type { Failure } from '@/contracts/results';
import type { EntryCalculationPreview } from '@/contracts/view-models';
import type { WorkLog, WorkLogInput } from '@/contracts/work-log';
import { Button } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Field, FormErrorSummary } from '@/components/forms/field';
import {
  DateInput,
  DurationInput,
  FileUpload,
  Input,
  Select,
  Textarea,
} from '@/components/forms/inputs';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog, Drawer } from '@/components/feedback/overlay';
import { useToast } from '@/components/feedback/toast';
import { formatDate, formatTimestamp } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { toDurationView, WORK_LOCATION_LABEL } from '@/lib/status';
import { mockTimesheetService } from '@/services/mock/timesheet';
import {
  ALL_DIVISIONS,
  effectiveDivisionIds,
  selectableProjects,
  selectableTasks,
} from '@/services/mock/organization';

interface AttachmentDraft {
  readonly id: string;
  readonly name: string;
  readonly size: string;
}

type WorkLogDraft = Omit<WorkLogInput, 'durationMinutes'> & {
  readonly durationMinutes: number | null;
};

export interface CopiedWorkLogDraft {
  readonly input: Omit<WorkLogInput, 'idempotencyKey'>;
  readonly sourceWorkDate: string;
}

type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly key: string }
  | { readonly status: 'success'; readonly key: string; readonly data: EntryCalculationPreview }
  | { readonly status: 'failure'; readonly key: string };

const LOCATION_OPTIONS = (
  Object.entries(WORK_LOCATION_LABEL) as [WorkLocation, string][]
).map(([value, label]) => ({ value, label }));

function tasksForEmployee(employeeId: string, projectId: string) {
  return selectableTasks(projectId).filter(
    (task) =>
      task.assigneeEmployeeId === employeeId ||
      task.supportingMemberIds.includes(employeeId),
  );
}

function initialDraft(
  employeeId: string,
  workDate: string,
  initialTaskId?: string,
  copiedDraft?: CopiedWorkLogDraft,
  editingWorkLog?: WorkLog,
): WorkLogDraft {
  if (editingWorkLog) {
    return { ...editingWorkLog };
  }
  if (copiedDraft) {
    return {
      ...copiedDraft.input,
      employeeId,
      idempotencyKey: `work-log:${employeeId}:${crypto.randomUUID()}`,
    };
  }

  const divisionIds = effectiveDivisionIds(employeeId, workDate);
  const initialTask = divisionIds
    .flatMap((divisionId) => selectableProjects(divisionId))
    .flatMap((project) => tasksForEmployee(employeeId, project.id))
    .find((task) => task.id === initialTaskId);

  return {
    employeeId,
    workDate,
    divisionId: initialTask?.divisionId ?? divisionIds[0] ?? '',
    projectId: initialTask?.projectId ?? '',
    taskId: initialTask?.id ?? '',
    durationMinutes: null,
    workLocation: 'office',
    workDescription: '',
    completedWork: '',
    supportingLink: null,
    attachmentIds: [],
    overtimeReason: null,
    criticalExplanation: null,
    source: 'manual',
    idempotencyKey: `work-log:${employeeId}:${crypto.randomUUID()}`,
  };
}

function toWorkLogInput(
  form: WorkLogDraft,
  attachmentIds: readonly string[] = form.attachmentIds,
): WorkLogInput {
  return {
    ...form,
    durationMinutes: form.durationMinutes ?? 0,
    attachmentIds,
  };
}

export interface WorkLogDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly employeeId: string;
  readonly defaultWorkDate: string;
  readonly initialTaskId?: string;
  readonly copiedDraft?: CopiedWorkLogDraft;
  readonly editingWorkLog?: WorkLog;
  readonly onSaved: () => void;
}

/** Duration-only Log Work form (`MFE-0301`). */
export function WorkLogDrawer({
  open,
  onClose,
  employeeId,
  defaultWorkDate,
  initialTaskId,
  copiedDraft,
  editingWorkLog,
  onSaved,
}: WorkLogDrawerProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<WorkLogDraft>(() =>
    initialDraft(employeeId, defaultWorkDate, initialTaskId, copiedDraft, editingWorkLog),
  );
  const [attachments, setAttachments] = React.useState<readonly AttachmentDraft[]>(() =>
    editingWorkLog?.attachmentIds.map((id, index) => ({
      id,
      name: `Saved attachment ${index + 1}`,
      size: 'Saved',
    })) ?? [],
  );
  const [changeReason, setChangeReason] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [summaryErrors, setSummaryErrors] = React.useState<
    readonly { field: string; message: string }[]
  >([]);
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [preview, setPreview] = React.useState<PreviewState>({ status: 'idle' });
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(Boolean(copiedDraft));
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const openKey = `${open}|${employeeId}|${defaultWorkDate}|${initialTaskId ?? ''}|${copiedDraft?.sourceWorkDate ?? ''}|${editingWorkLog?.id ?? ''}|${editingWorkLog?.version ?? ''}`;
  const [lastOpenKey, setLastOpenKey] = React.useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (open) {
      setForm(initialDraft(employeeId, defaultWorkDate, initialTaskId, copiedDraft, editingWorkLog));
      setAttachments(
        editingWorkLog?.attachmentIds.map((id, index) => ({
          id,
          name: `Saved attachment ${index + 1}`,
          size: 'Saved',
        })) ?? [],
      );
      setChangeReason('');
      setFieldErrors({});
      setSummaryErrors([]);
      setFailure(null);
      setPreview({ status: 'idle' });
      setSaving(false);
      setDirty(Boolean(copiedDraft));
    }
  }

  const divisionIds = React.useMemo(
    () => effectiveDivisionIds(employeeId, form.workDate),
    [employeeId, form.workDate],
  );
  const projects = React.useMemo(
    () => (form.divisionId ? selectableProjects(form.divisionId) : []),
    [form.divisionId],
  );
  const tasks = React.useMemo(
    () => (form.projectId ? tasksForEmployee(employeeId, form.projectId) : []),
    [employeeId, form.projectId],
  );

  const previewReady = Boolean(
    open &&
      form.workDate &&
      form.divisionId &&
      form.projectId &&
      form.taskId &&
      form.durationMinutes !== null &&
      Number.isInteger(form.durationMinutes) &&
      form.durationMinutes > 0,
  );
  const previewKey = [
    form.employeeId,
    form.workDate,
    form.divisionId,
    form.projectId,
    form.taskId,
    form.durationMinutes ?? '',
  ].join('|');

  // The preview is deliberately produced by the service's shared calculation
  // engine. The component displays its result and never derives policy totals.
  React.useEffect(() => {
    if (!previewReady) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setPreview({ status: 'loading', key: previewKey });
      const result = await mockTimesheetService.previewWorkLog(toWorkLogInput(form), {
        excludeWorkLogId: editingWorkLog?.id,
      });
      if (cancelled) return;
      setPreview(
        result.status === 'success'
          ? { status: 'success', key: previewKey, data: result.data }
          : { status: 'failure', key: previewKey },
      );
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [editingWorkLog?.id, form, previewKey, previewReady]);

  function update(patch: Partial<WorkLogDraft>) {
    setDirty(true);
    setFailure(null);
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.workDate && patch.workDate !== current.workDate) {
        const allowedDivisions = effectiveDivisionIds(employeeId, patch.workDate);
        next.divisionId = allowedDivisions[0] ?? '';
        next.projectId = '';
        next.taskId = '';
      } else if (patch.divisionId && patch.divisionId !== current.divisionId) {
        next.projectId = '';
        next.taskId = '';
      } else if (
        patch.projectId !== undefined &&
        patch.projectId !== current.projectId
      ) {
        next.taskId = '';
      }
      return next;
    });
  }

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setFailure(null);
    setFieldErrors({});
    setSummaryErrors([]);

    const input = toWorkLogInput(
      form,
      attachments.map((attachment) => attachment.id),
    );
    const result = editingWorkLog
      ? await mockTimesheetService.updateWorkLog(editingWorkLog.id, {
          ...input,
          expectedVersion: editingWorkLog.version ?? 0,
          changeReason,
        })
      : await mockTimesheetService.createWorkLog(input);
    setSaving(false);

    if (result.status === 'success') {
      setDirty(false);
      toast.show({
        tone: 'success',
        title: editingWorkLog ? 'Work log updated' : 'Work logged',
        description: editingWorkLog
          ? 'The correction and its before/after history were saved.'
          : `${result.data.durationMinutes} active minute${result.data.durationMinutes === 1 ? '' : 's'} saved for ${result.data.workDate}.`,
      });
      onSaved();
      onClose();
      return;
    }

    if (result.status === 'validation_failure') {
      const nextErrors: Record<string, string> = {};
      const nextSummary = result.fieldErrors.map((error) => {
        const message = `${error.message} ${error.guidance}`.trim();
        nextErrors[error.field] = message;
        return { field: error.field, message };
      });
      setFieldErrors(nextErrors);
      setSummaryErrors(nextSummary);
      return;
    }

    setFailure(result);
  }

  const currentPreview =
    previewReady && preview.status === 'success' && preview.key === previewKey
      ? preview.data
      : null;
  const showOvertimeReason = Boolean(
    currentPreview?.requiresOvertimeReason || fieldErrors.overtimeReason,
  );
  const showCriticalExplanation = Boolean(
    currentPreview?.requiresCriticalExplanation || fieldErrors.criticalExplanation,
  );

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title={editingWorkLog ? 'Edit work log' : copiedDraft ? 'Review copied work log' : 'Log work'}
        description={
          editingWorkLog
            ? `Correct the saved work for ${formatDate(editingWorkLog.workDate)}.`
            : copiedDraft
            ? `Unsaved draft copied from ${formatDate(copiedDraft.sourceWorkDate)}.`
            : 'Record active time against one In Progress task.'
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="work-log-form"
              variant="primary"
              loading={saving}
            >
              {editingWorkLog ? 'Save correction' : 'Save work log'}
            </Button>
          </>
        }
      >
        <form
          id="work-log-form"
          aria-label={editingWorkLog ? 'Edit work log form' : 'Log work form'}
          onSubmit={submit}
          className="space-y-5"
        >
          <FormErrorSummary
            errors={summaryErrors}
            onFocusField={(field) => document.getElementsByName(field)[0]?.focus()}
          />

          {copiedDraft && (
            <Alert tone="info" title="This is a copied draft">
              Nothing has been recorded yet. Review the target date, assignment and duration,
              then add the completed work before saving. Attachments, links, day reasons and
              verification state were not copied.
            </Alert>
          )}

          {editingWorkLog && (
            <Alert tone="info" title="Every correction is audited">
              Saving creates an immutable before-and-after revision. The original record is not
              erased, and verified periods remain locked.
            </Alert>
          )}

          {failure && (
            <Alert
              tone={failure.status === 'conflict' ? 'warning' : 'danger'}
              title={failure.status === 'conflict' ? 'This date cannot be changed' : 'Work could not be logged'}
              live
            >
              {failure.message}
              {'guidance' in failure && failure.guidance ? ` ${failure.guidance}` : ''}
            </Alert>
          )}

          <Callout tone="info">
            Saving this form records active minutes immediately. It does not create a draft and does not require daily approval.
          </Callout>

          <WorkLogCalculationPreview
            ready={previewReady}
            previewKey={previewKey}
            state={preview}
          />

          <section aria-labelledby="work-log-assignment-heading" className="space-y-4">
            <h3 id="work-log-assignment-heading" className="text-h3 text-ink">
              Work assignment
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Work date" required error={fieldErrors.workDate}>
                <DateInput
                  name="workDate"
                  value={form.workDate}
                  onChange={(event) => update({ workDate: event.target.value })}
                />
              </Field>

              <Field
                label="Duration"
                required
                error={fieldErrors.durationMinutes}
                helperText="Enter active work as H:MM, for example 3:30."
              >
                <DurationInput
                  name="durationMinutes"
                  value={form.durationMinutes}
                  onValueChange={(durationMinutes) => update({ durationMinutes })}
                />
              </Field>

              <Field
                label="Division"
                required
                error={fieldErrors.divisionId}
                helperText={divisionIds.length === 0 ? 'No effective division assignment exists for this date.' : undefined}
              >
                <Select
                  name="divisionId"
                  value={form.divisionId}
                  placeholder="Select a division"
                  onChange={(event) => update({ divisionId: event.target.value })}
                  options={ALL_DIVISIONS.filter((division) =>
                    divisionIds.includes(division.id),
                  ).map((division) => ({
                    value: division.id,
                    label: `${division.code} · ${division.name}`,
                  }))}
                />
              </Field>

              <Field
                label="Project"
                required
                error={fieldErrors.projectId}
                helperText={form.divisionId && projects.length === 0 ? 'No active project accepts work in this division.' : undefined}
              >
                <Select
                  name="projectId"
                  value={form.projectId}
                  placeholder="Select a project"
                  disabled={!form.divisionId}
                  onChange={(event) => update({ projectId: event.target.value })}
                  options={projects.map((project) => ({
                    value: project.id,
                    label: `${project.code} · ${project.name}`,
                  }))}
                />
              </Field>

              <Field
                label="Task"
                required
                error={fieldErrors.taskId}
                helperText={form.projectId && tasks.length === 0 ? 'No assigned In Progress task is available in this project.' : 'Only assigned In Progress tasks can receive work.'}
                className="sm:col-span-2"
              >
                <Select
                  name="taskId"
                  value={form.taskId}
                  placeholder="Select an In Progress task"
                  disabled={!form.projectId}
                  onChange={(event) => update({ taskId: event.target.value })}
                  options={tasks.map((task) => ({ value: task.id, label: task.title }))}
                />
              </Field>

              <Field label="Work location" required error={fieldErrors.workLocation}>
                <Select
                  name="workLocation"
                  value={form.workLocation}
                  onChange={(event) => update({ workLocation: event.target.value as WorkLocation })}
                  options={LOCATION_OPTIONS}
                />
              </Field>
            </div>
          </section>

          <section aria-labelledby="work-log-details-heading" className="space-y-4 border-t border-border pt-5">
            <h3 id="work-log-details-heading" className="text-h3 text-ink">
              Work details
            </h3>

            <Field label="Work description" required error={fieldErrors.workDescription}>
              <Textarea
                name="workDescription"
                rows={3}
                value={form.workDescription}
                onChange={(event) => update({ workDescription: event.target.value })}
                placeholder="What did you work on?"
              />
            </Field>

            <Field
              label="Completed work"
              required
              error={fieldErrors.completedWork}
              helperText="Describe the result or progress produced, not only the activity."
            >
              <Textarea
                name="completedWork"
                rows={4}
                value={form.completedWork}
                onChange={(event) => update({ completedWork: event.target.value })}
                placeholder="What changed or was completed?"
              />
            </Field>

            <Field label="Supporting link" helperText="Optional. Link to a ticket, document, or deliverable.">
              <Input
                name="supportingLink"
                type="url"
                value={form.supportingLink ?? ''}
                onChange={(event) => update({ supportingLink: event.target.value || null })}
                placeholder="https://"
              />
            </Field>

            <FileUpload
              label="Attach supporting files (optional)"
              multiple
              files={attachments}
              disabled={saving}
              helperText="Selected files are attached to this work log in the demo service."
              onFilesSelected={(files) => {
                setDirty(true);
                setAttachments((current) => [
                  ...current,
                  ...Array.from(files).map((file) => ({
                    id: `work-log-file:${crypto.randomUUID()}`,
                    name: file.name,
                    size: `${Math.max(1, Math.ceil(file.size / 1024))} KB`,
                  })),
                ]);
              }}
              onRemove={(id) => {
                setDirty(true);
                setAttachments((current) => current.filter((file) => file.id !== id));
              }}
            />
          </section>

          {showOvertimeReason && (
            <Field
              label="Overtime reason"
              required
              error={fieldErrors.overtimeReason}
              helperText="Required because the projected daily total is above 8:00."
            >
              <Textarea
                name="overtimeReason"
                rows={3}
                value={form.overtimeReason ?? ''}
                onChange={(event) => update({ overtimeReason: event.target.value || null })}
              />
            </Field>
          )}

          {showCriticalExplanation && (
            <Field
              label="Critical-time explanation"
              required
              error={fieldErrors.criticalExplanation}
              helperText="Days above twelve hours notify your Team Lead and HR."
            >
              <Textarea
                name="criticalExplanation"
                rows={3}
                value={form.criticalExplanation ?? ''}
                onChange={(event) => update({ criticalExplanation: event.target.value || null })}
              />
            </Field>
          )}

          {editingWorkLog && (
            <section aria-labelledby="work-log-correction-heading" className="space-y-4 border-t border-border pt-5">
              <h3 id="work-log-correction-heading" className="text-h3 text-ink">
                Correction record
              </h3>
              <Field
                label="Reason for change"
                required
                error={fieldErrors.changeReason}
                helperText="Explain what is being corrected. This reason remains in the audit history."
              >
                <Textarea
                  name="changeReason"
                  rows={3}
                  value={changeReason}
                  onChange={(event) => {
                    setDirty(true);
                    setChangeReason(event.target.value);
                  }}
                />
              </Field>
              <WorkLogHistory workLogId={editingWorkLog.id} />
            </section>
          )}
        </form>
      </Drawer>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this work log?"
        description="The information in this form has not been saved."
        dismissOnBackdrop={false}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(false);
                setDirty(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </>
        }
      />
    </>
  );
}

function WorkLogHistory({ workLogId }: { readonly workLogId: string }) {
  const { state } = useAsync(
    () => mockTimesheetService.getWorkLogHistory(workLogId),
    [workLogId],
  );

  if (state.status === 'loading') {
    return <p role="status" className="text-body-sm text-ink-muted">Loading correction history…</p>;
  }
  if (state.status !== 'success') {
    return <p role="alert" className="text-body-sm text-danger">Correction history could not be loaded.</p>;
  }
  if (state.data.length === 0) {
    return <p className="text-body-sm text-ink-muted">No earlier corrections. This is the original saved version.</p>;
  }

  return (
    <div>
      <p className="text-label text-ink">Previous corrections</p>
      <ol className="mt-2 space-y-3">
        {state.data.map((revision) => (
          <li key={revision.id} className="rounded-md border border-border bg-surface-sunken p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="text-body-sm font-semibold text-ink">Version {revision.version}</p>
              <p className="text-caption text-ink-muted">
                {revision.changedBy.displayName} · {formatTimestamp(revision.changedAt)}
              </p>
            </div>
            <p className="mt-2 text-body-sm text-ink-muted">{revision.reason}</p>
            <p className="mt-2 text-caption text-ink-subtle">
              Active time: <Duration value={toDurationView(revision.before.durationMinutes)} /> →{' '}
              <Duration value={toDurationView(revision.after.durationMinutes)} />
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Live, authoritative day projection for `MFE-0302`. */
function WorkLogCalculationPreview({
  ready,
  previewKey,
  state,
}: {
  readonly ready: boolean;
  readonly previewKey: string;
  readonly state: PreviewState;
}) {
  const isCurrent = 'key' in state && state.key === previewKey;

  return (
    <section
      aria-labelledby="work-log-preview-heading"
      aria-live="polite"
      aria-busy={ready && (!isCurrent || state.status === 'loading')}
      className="rounded-lg border border-border bg-surface-sunken p-4"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id="work-log-preview-heading" className="text-label text-ink">
            Daily calculation preview
          </h3>
          <p className="mt-0.5 text-caption text-ink-muted">
            Projected result after this work log is saved.
          </p>
        </div>
        {ready && isCurrent && state.status === 'success' && (
          <StatusIndicator status={state.data.resultingStatus.status} />
        )}
      </div>

      {!ready && (
        <p className="mt-3 text-body-sm text-ink-muted">
          Enter a duration and select an eligible task to see the day result.
        </p>
      )}

      {ready && (!isCurrent || state.status === 'loading') && (
        <p role="status" className="mt-3 text-body-sm text-ink-muted">
          Calculating the day result…
        </p>
      )}

      {ready && isCurrent && state.status === 'failure' && (
        <p role="alert" className="mt-3 text-body-sm text-danger">
          The preview is temporarily unavailable. You can retry by changing the duration.
        </p>
      )}

      {ready && isCurrent && state.status === 'success' && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          {[
            { term: 'Task on this date', value: state.data.taskDayActive },
            { term: 'Active', value: state.data.dayActive },
            { term: 'Break', value: state.data.dayBreak },
            { term: 'Total', value: state.data.dayTotal },
            { term: 'Remaining', value: state.data.remainingActive },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-caption text-ink-subtle">{item.term}</dt>
              <dd className="mt-0.5 text-body font-semibold text-ink">
                <Duration value={item.value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
