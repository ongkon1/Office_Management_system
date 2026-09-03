'use client';

import * as React from 'react';
import { Copy } from 'lucide-react';
import type { WorkLocation } from '@/contracts/domain';
import type { TimeEntryInput } from '@/contracts/services';
import type { EntryCalculationPreview } from '@/contracts/view-models';
import { Button } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Field, FormErrorSummary } from '@/components/forms/field';
import {
  DurationInput,
  Input,
  RadioGroup,
  Select,
  Textarea,
  TimeInput,
} from '@/components/forms/inputs';
import { Drawer, Dialog } from '@/components/feedback/overlay';
import { Alert, Callout } from '@/components/feedback/alert';
import { useToast } from '@/components/feedback/toast';
import { mockTimesheetService } from '@/services/mock/timesheet';
import {
  selectableProjects,
  selectableTasks,
  effectiveDivisionIds,
} from '@/services/mock/organization';
import { ALL_DIVISIONS } from '@/services/mock/organization';
import { WORK_LOCATION_LABEL } from '@/lib/status';

const LOCATION_OPTIONS = (
  Object.entries(WORK_LOCATION_LABEL) as [WorkLocation, string][]
).map(([value, label]) => ({ value, label }));

export interface EntryDrawerProps {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  workDate: string;
  /** Present when editing; absent when creating. */
  entryId?: string;
  /** Pre-filled values, used by copy-previous-entry and stop-to-draft. */
  initial?: Partial<TimeEntryInput>;
  /** Explains where a pre-filled draft came from. */
  draftOrigin?: 'copy' | 'timer' | null;
  onSaved: () => void;
}

const EMPTY: TimeEntryInput = {
  employeeId: '',
  workDate: '',
  divisionId: '',
  projectId: null,
  taskId: null,
  entryMethod: 'manual_clock',
  workLocation: 'office',
  startTime: '09:00',
  endTime: '12:00',
  activeMinutes: null,
  workDescription: '',
  completedWork: '',
  supportingLink: null,
  attachmentIds: [],
  overtimeReason: null,
  criticalExplanation: null,
};

/**
 * The time-entry form (`FE-0320`–`FE-0327`).
 *
 * Three behaviours here are requirements rather than polish:
 *  - the calculation preview comes from the same engine as the save, so the
 *    number shown before saving is the number recorded after it
 *  - the overtime reason and critical explanation are revealed progressively
 *    as the day crosses each threshold, and are required once shown
 *  - projects and tasks are constrained by the selected division and the
 *    assignment effective on the work date
 */
export function EntryDrawer({
  open,
  onClose,
  employeeId,
  workDate,
  entryId,
  initial,
  draftOrigin = null,
  onSaved,
}: EntryDrawerProps) {
  const toast = useToast();
  const [form, setForm] = React.useState<TimeEntryInput>(EMPTY);
  const [preview, setPreview] = React.useState<EntryCalculationPreview | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [summaryErrors, setSummaryErrors] = React.useState<
    { field: string; message: string }[]
  >([]);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const divisionIds = React.useMemo(
    () => effectiveDivisionIds(employeeId, workDate),
    [employeeId, workDate],
  );

  // Reset when the drawer opens, so a previous edit never leaks into a new one.
  // Adjusted during render rather than in an effect: setting state
  // synchronously in an effect cascades, and the old values would paint first.
  const openKey = `${open}|${entryId ?? 'new'}|${workDate}|${draftOrigin ?? ''}`;
  const [lastOpenKey, setLastOpenKey] = React.useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (open) {
      setForm({
        ...EMPTY,
        ...initial,
        employeeId,
        workDate,
        divisionId: initial?.divisionId ?? divisionIds[0] ?? '',
      });
      setFieldErrors({});
      setSummaryErrors([]);
      setDirty(false);
    }
  }

  // Live preview. Debounced so typing a duration does not thrash the engine.
  React.useEffect(() => {
    if (!open || !form.divisionId) return;
    const id = window.setTimeout(() => {
      mockTimesheetService.previewCalculation(form).then((result) => {
        if (result.status === 'success') setPreview(result.data);
      });
    }, 180);
    return () => window.clearTimeout(id);
  }, [open, form]);

  const projects = React.useMemo(
    () => (form.divisionId ? selectableProjects(form.divisionId) : []),
    [form.divisionId],
  );
  const tasks = React.useMemo(
    () => (form.projectId ? selectableTasks(form.projectId) : []),
    [form.projectId],
  );

  function update(patch: Partial<TimeEntryInput>) {
    setDirty(true);
    setForm((current) => {
      const next = { ...current, ...patch };
      // Changing division invalidates the project and task beneath it.
      if (patch.divisionId && patch.divisionId !== current.divisionId) {
        next.projectId = null;
        next.taskId = null;
      }
      if (patch.projectId !== undefined && patch.projectId !== current.projectId) {
        next.taskId = null;
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setFieldErrors({});
    setSummaryErrors([]);

    const result = entryId
      ? await mockTimesheetService.updateEntry(entryId, form)
      : await mockTimesheetService.createEntry({
          ...form,
          idempotencyKey: `entry-${employeeId}-${workDate}-${Date.now()}`,
        });

    setSaving(false);

    if (result.status === 'success') {
      toast.show({
        tone: 'success',
        title: entryId ? 'Entry updated' : 'Entry saved',
        description: `${workDate} · no approval is needed for a daily entry.`,
      });
      setDirty(false);
      onSaved();
      onClose();
      return;
    }

    if (result.status === 'validation_failure') {
      const next: Record<string, string> = {};
      for (const error of result.fieldErrors) {
        next[error.field] = `${error.message} ${error.guidance}`.trim();
      }
      setFieldErrors(next);
      setSummaryErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`.trim(),
        })),
      );
      return;
    }

    if (result.status === 'conflict') {
      setSummaryErrors([{ field: 'workDate', message: `${result.message} ${result.guidance}` }]);
      return;
    }

    toast.show({ tone: 'error', title: 'Could not save', description: 'Try again.' });
  }

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  const showOvertime = preview?.requiresOvertimeReason ?? false;
  const showCritical = preview?.requiresCriticalExplanation ?? false;

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title={entryId ? 'Edit time entry' : 'Add time entry'}
        description={workDate}
        footer={
          <>
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {entryId ? 'Save changes' : 'Save entry'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {draftOrigin === 'copy' && (
            <Alert tone="info" title="This is a copied draft">
              It has been moved to {workDate} and carries no verification state. Review the
              details and add the completed work before saving.
            </Alert>
          )}
          {draftOrigin === 'timer' && (
            <Alert tone="info" title="Draft from your timer">
              Stopping a timer creates a draft. Nothing is recorded until you save it.
            </Alert>
          )}

          <FormErrorSummary
            errors={summaryErrors}
            onFocusField={(field) => {
              document.getElementsByName(field)[0]?.focus();
            }}
          />

          {preview && <CalculationPreview preview={preview} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Division" required error={fieldErrors.divisionId}>
              <Select
                name="divisionId"
                value={form.divisionId}
                placeholder="Select a division"
                onChange={(event) => update({ divisionId: event.target.value })}
                options={ALL_DIVISIONS.filter((division) =>
                  divisionIds.includes(division.id),
                ).map((division) => ({ value: division.id, label: division.name }))}
              />
            </Field>

            <Field
              label="Project"
              error={fieldErrors.projectId}
              helperText={
                form.divisionId && projects.length === 0
                  ? 'No active projects in this division.'
                  : undefined
              }
            >
              <Select
                name="projectId"
                value={form.projectId ?? ''}
                placeholder="Select a project"
                disabled={!form.divisionId}
                onChange={(event) => update({ projectId: event.target.value || null })}
                options={projects.map((project) => ({
                  value: project.id,
                  label: `${project.name} · ${project.code}`,
                }))}
              />
            </Field>

            <Field label="Task" error={fieldErrors.taskId}>
              <Select
                name="taskId"
                value={form.taskId ?? ''}
                placeholder="Select a task"
                disabled={!form.projectId}
                onChange={(event) => update({ taskId: event.target.value || null })}
                options={tasks.map((task) => ({ value: task.id, label: task.title }))}
              />
            </Field>

            <Field label="Work location" required>
              <Select
                name="workLocation"
                value={form.workLocation}
                onChange={(event) =>
                  update({ workLocation: event.target.value as WorkLocation })
                }
                options={LOCATION_OPTIONS}
              />
            </Field>
          </div>

          <RadioGroup
            name="entryMethod"
            legend="How do you want to record this?"
            value={form.entryMethod}
            onValueChange={(value) =>
              update({ entryMethod: value as 'manual_clock' | 'manual_duration' })
            }
            options={[
              { value: 'manual_clock', label: 'Start and end time' },
              { value: 'manual_duration', label: 'Duration only' },
            ]}
          />

          {form.entryMethod === 'manual_clock' ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start time" required error={fieldErrors.startTime}>
                <TimeInput
                  name="startTime"
                  value={form.startTime ?? ''}
                  onChange={(event) => update({ startTime: event.target.value })}
                />
              </Field>
              <Field label="End time" required error={fieldErrors.endTime}>
                <TimeInput
                  name="endTime"
                  value={form.endTime ?? ''}
                  onChange={(event) => update({ endTime: event.target.value })}
                />
              </Field>
            </div>
          ) : (
            <Field
              label="Duration"
              required
              error={fieldErrors.activeMinutes}
              helperText="Accepts 3:00, 3.5h, 210m, or 210."
            >
              <DurationInput
                name="activeMinutes"
                value={form.activeMinutes}
                onValueChange={(minutes) => update({ activeMinutes: minutes })}
              />
            </Field>
          )}

          <Field label="Work description" required error={fieldErrors.workDescription}>
            <Input
              name="workDescription"
              value={form.workDescription}
              onChange={(event) => update({ workDescription: event.target.value })}
              placeholder="What did you work on?"
            />
          </Field>

          <Field
            label="Completed work"
            required
            error={fieldErrors.completedWork}
            helperText="Describe the outcome, not only the activity."
          >
            <Textarea
              name="completedWork"
              rows={3}
              value={form.completedWork}
              onChange={(event) => update({ completedWork: event.target.value })}
            />
          </Field>

          <Field label="Supporting link" helperText="Optional.">
            <Input
              name="supportingLink"
              type="url"
              value={form.supportingLink ?? ''}
              onChange={(event) => update({ supportingLink: event.target.value || null })}
              placeholder="https://"
            />
          </Field>

          {/* Progressive disclosure: revealed only once the day crosses the
              threshold, and required from that point (`FE-0325`). */}
          {showOvertime && (
            <Field
              label="Overtime reason"
              required
              error={fieldErrors.overtimeReason}
              helperText="This day is above eight hours."
            >
              <Textarea
                name="overtimeReason"
                rows={2}
                value={form.overtimeReason ?? ''}
                onChange={(event) => update({ overtimeReason: event.target.value || null })}
              />
            </Field>
          )}

          {showCritical && (
            <>
              <Callout tone="warning">
                Days above twelve hours notify your Team Lead and HR.
              </Callout>
              <Field
                label="Critical explanation"
                required
                error={fieldErrors.criticalExplanation}
              >
                <Textarea
                  name="criticalExplanation"
                  rows={3}
                  value={form.criticalExplanation ?? ''}
                  onChange={(event) =>
                    update({ criticalExplanation: event.target.value || null })
                  }
                />
              </Field>
            </>
          )}

          <Callout tone="info">
            Saving a daily entry never requires Team Lead approval.
          </Callout>
        </div>
      </Drawer>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this entry?"
        description="Your changes have not been saved."
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

/**
 * The live preview (`FE-0323`).
 *
 * It shows what the day becomes, not just this entry, because the daily total
 * is what the policy classifies.
 */
function CalculationPreview({ preview }: { preview: EntryCalculationPreview }) {
  return (
    <div
      className="rounded-lg border border-border bg-surface-sunken p-3"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-ink-muted">If you save this</p>
        <StatusIndicator status={preview.resultingStatus.status} />
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {[
          { term: 'This entry', value: preview.entryDuration },
          { term: 'Day active', value: preview.dayActive },
          { term: 'Break', value: preview.dayBreak },
          { term: 'Day total', value: preview.dayTotal },
          { term: 'Remaining', value: preview.remainingActive },
        ].map((item) => (
          <div key={item.term}>
            <dt className="text-caption text-ink-subtle">{item.term}</dt>
            <dd className="text-body font-semibold text-ink">
              <Duration value={item.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Copy-previous-entry picker (`FE-0327`). */
export function CopyEntryButton({
  onCopy,
  disabled,
}: {
  onCopy: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="secondary"
      onClick={onCopy}
      disabled={disabled}
      iconLeading={<Copy aria-hidden className="size-4" />}
    >
      Copy a previous entry
    </Button>
  );
}
