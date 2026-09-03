'use client';

import * as React from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import type { WorkLocation } from '@/contracts/domain';
import type { TimeEntryInput } from '@/contracts/services';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/forms/field';
import { Select } from '@/components/forms/inputs';
import { Card } from '@/components/feedback/card';
import { Alert } from '@/components/feedback/alert';
import { useToast } from '@/components/feedback/toast';
import { WORK_LOCATION_LABEL } from '@/lib/status';
import {
  ALL_DIVISIONS,
  effectiveDivisionIds,
  selectableProjects,
  selectableTasks,
} from '@/services/mock/organization';
import { formatElapsed, useTimer } from './use-timer';

const LOCATION_OPTIONS = (
  Object.entries(WORK_LOCATION_LABEL) as [WorkLocation, string][]
).map(([value, label]) => ({ value, label }));

/**
 * Timer start, running state and stop-to-draft (`FE-0328`–`FE-0330`).
 *
 * Stopping never records time on its own: it produces a draft the employee
 * completes and saves (`REQ-TIME-009`). A timer restored after a refresh says
 * so, rather than resuming silently as though nothing happened.
 */
export function TimerPanel({
  employeeId,
  workDate,
  onDraft,
}: {
  employeeId: string;
  workDate: string;
  onDraft: (draft: TimeEntryInput) => void;
}) {
  const toast = useToast();
  const timer = useTimer();

  const divisionIds = React.useMemo(
    () => effectiveDivisionIds(employeeId, workDate),
    [employeeId, workDate],
  );

  const [divisionId, setDivisionId] = React.useState(divisionIds[0] ?? '');
  const [projectId, setProjectId] = React.useState<string>('');
  const [taskId, setTaskId] = React.useState<string>('');
  const [workLocation, setWorkLocation] = React.useState<WorkLocation>('office');
  const [busy, setBusy] = React.useState(false);

  const projects = React.useMemo(
    () => (divisionId ? selectableProjects(divisionId) : []),
    [divisionId],
  );
  const tasks = React.useMemo(
    () => (projectId ? selectableTasks(projectId) : []),
    [projectId],
  );

  async function handleStart() {
    setBusy(true);
    const result = await timer.start({
      divisionId,
      projectId: projectId || null,
      taskId: taskId || null,
      workLocation,
    });
    setBusy(false);

    if (result.status === 'conflict') {
      // The one-running-timer rule is enforced by the service, not by hiding
      // the button (`REQ-TIME-008`).
      toast.show({ tone: 'error', title: result.message, description: result.guidance });
    }
  }

  async function handleStop() {
    setBusy(true);
    const result = await timer.stop();
    setBusy(false);
    if (result?.status === 'success') onDraft(result.data);
  }

  if (timer.session?.isRunning) {
    const division = ALL_DIVISIONS.find((item) => item.id === timer.session?.divisionId);

    return (
      <Card className="border-accent-border bg-accent-subtle">
        {timer.wasRecovered && (
          <Alert tone="info" title="Your timer was still running" className="mb-3">
            It was recovered after the page reloaded. The elapsed time below has kept
            counting; stop it when you are done and review the draft.
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-label text-ink-muted">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
              Timer running
            </p>
            <p className="mt-1 text-display tabular text-ink" aria-live="off">
              {formatElapsed(timer.elapsedSeconds)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
              {division && <Badge tone="neutral">{division.code}</Badge>}
              <span>{WORK_LOCATION_LABEL[timer.session.workLocation]}</span>
            </p>
            <span className="sr-only" aria-live="polite">
              Timer running for {timer.elapsedMinutes} minutes.
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                timer.cancel();
                toast.show({ tone: 'info', title: 'Timer discarded', description: 'No time was recorded.' });
              }}
              iconLeading={<RotateCcw aria-hidden className="size-4" />}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              onClick={handleStop}
              loading={busy}
              iconLeading={<Square aria-hidden className="size-4" />}
            >
              Stop and review
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-h3 text-ink">Start a timer</h2>
            <p className="mt-0.5 text-body-sm text-ink-muted">
              Stopping creates a draft you review before it counts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Division" required>
            <Select
              value={divisionId}
              placeholder="Select"
              onChange={(event) => {
                setDivisionId(event.target.value);
                setProjectId('');
                setTaskId('');
              }}
              options={ALL_DIVISIONS.filter((division) =>
                divisionIds.includes(division.id),
              ).map((division) => ({ value: division.id, label: division.name }))}
            />
          </Field>
          <Field label="Project">
            <Select
              value={projectId}
              placeholder="Select"
              disabled={!divisionId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setTaskId('');
              }}
              options={projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
            />
          </Field>
          <Field label="Task">
            <Select
              value={taskId}
              placeholder="Select"
              disabled={!projectId}
              onChange={(event) => setTaskId(event.target.value)}
              options={tasks.map((task) => ({ value: task.id, label: task.title }))}
            />
          </Field>
          <Field label="Location" required>
            <Select
              value={workLocation}
              onChange={(event) => setWorkLocation(event.target.value as WorkLocation)}
              options={LOCATION_OPTIONS}
            />
          </Field>
        </div>

        <div>
          <Button
            variant="accent"
            onClick={handleStart}
            loading={busy}
            disabled={!divisionId}
            iconLeading={<Play aria-hidden className="size-4" />}
          >
            Start timer
          </Button>
        </div>
      </div>
    </Card>
  );
}
