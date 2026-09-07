'use client';

import * as React from 'react';
import Link from 'next/link';
import { BellRing, CalendarPlus, Send, Undo2 } from 'lucide-react';
import type { EvaluationAreaKey, EvaluationPeriodType } from '@/contracts/domain';
import type { EvaluationPeriodFormInput, HrEvaluationRowView } from '@/contracts/hr';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, Input, Select, Textarea } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { RestrictedValue } from '@/components/ui/misc';
import { CompanyScope, HrLoading, HrResultFallback, TEAM_LEAD_OPTIONS } from './shared';

const AREA_LABEL: Readonly<Record<EvaluationAreaKey, string>> = {
  task_completion: 'Task completion',
  work_quality: 'Work quality',
  timeliness: 'Timeliness',
  teamwork_communication: 'Teamwork and communication',
  responsibility: 'Responsibility',
  learning_initiative: 'Learning and initiative',
};

const PERIOD_TYPE_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'annual', label: 'Annual' },
  { value: 'project_based', label: 'Project-based' },
  { value: 'probation', label: 'Probation' },
];

const ASSIGNABLE_EMPLOYEES = [
  { id: 'emp-1001', label: 'Nadia Rahman' },
  { id: 'emp-1002', label: 'Tanvir Ahmed' },
  { id: 'emp-1003', label: 'Sadia Karim' },
  { id: 'emp-1004', label: 'Sumaiya Noor' },
];

function stateTone(state: HrEvaluationRowView['state']): BadgeTone {
  if (state === 'published') return 'success';
  if (state === 'hr_review') return 'info';
  if (state === 'reviewer_scoring') return 'accent';
  if (state === 'self_evaluation') return 'warning';
  return 'neutral';
}

/* -------------------------------------------------------------------------- */
/* FE-0523 — evaluation period creation                                       */
/* -------------------------------------------------------------------------- */

function CreatePeriodDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<EvaluationPeriodType>('monthly');
  const [startDate, setStartDate] = React.useState('2026-09-01');
  const [endDate, setEndDate] = React.useState('2026-09-30');
  const [dueDate, setDueDate] = React.useState('2026-10-07');
  const [employeeIds, setEmployeeIds] = React.useState<readonly string[]>(['emp-1001']);
  const [reviewers, setReviewers] = React.useState<Record<string, string>>({
    'emp-1001': 'emp-2001',
  });
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);

  async function submit() {
    const input: EvaluationPeriodFormInput = {
      name,
      type,
      startDate,
      endDate,
      dueDate,
      employeeIds,
      reviewerByEmployeeId: reviewers,
    };
    const result = await mockHrService.createEvaluationPeriod(user?.userId ?? '', input);
    if (result.status === 'success') {
      onCreated();
      onClose();
      setName('');
      setErrors([]);
      toast.show({
        tone: 'success',
        title: 'Evaluation period created',
        description: `${result.data.name} · ${result.data.total} employee(s) assigned to reviewers.`,
      });
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
    }
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create evaluation period"
      description="Monthly, quarterly, half-yearly, annual, project-based or probation."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Create period
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        <Field label="Period name" required error={fieldError('name')}>
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Period type" required>
          <Select
            value={type}
            options={PERIOD_TYPE_OPTIONS}
            onChange={(event) => setType(event.target.value as EvaluationPeriodType)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start date" required>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="End date" required error={fieldError('endDate')}>
            <Input
              type="date"
              name="endDate"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
          <Field label="Due date" required error={fieldError('dueDate')}>
            <Input
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2 border-t border-border pt-3">
          <legend className="text-label text-ink-muted">Employees and reviewers</legend>
          {fieldError('employeeIds') && (
            <p className="text-caption text-danger">{fieldError('employeeIds')}</p>
          )}
          {ASSIGNABLE_EMPLOYEES.map((employee) => (
            <div
              key={employee.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-2"
            >
              <Checkbox
                label={employee.label}
                checked={employeeIds.includes(employee.id)}
                onChange={(event) =>
                  setEmployeeIds(
                    event.target.checked
                      ? [...employeeIds, employee.id]
                      : employeeIds.filter((id) => id !== employee.id),
                  )
                }
              />
              <Field label={`Reviewer for ${employee.label}`} hideLabel className="w-48">
                <Select
                  value={reviewers[employee.id] ?? 'emp-2001'}
                  options={TEAM_LEAD_OPTIONS}
                  disabled={!employeeIds.includes(employee.id)}
                  onChange={(event) =>
                    setReviewers({ ...reviewers, [employee.id]: event.target.value })
                  }
                />
              </Field>
            </div>
          ))}
        </fieldset>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0524 — period list, progress and reminders                              */
/* -------------------------------------------------------------------------- */

export function EvaluationAdministration({ periodId }: { periodId?: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string>(periodId ?? 'all');

  const { state: periodState, reload: reloadPeriods } = useAsync(
    () => mockHrService.listEvaluationPeriods(user?.userId ?? ''),
    [user?.userId],
  );
  const { state, reload } = useAsync(
    () =>
      mockHrService.listEvaluations(
        user?.userId ?? '',
        selected === 'all' ? undefined : selected,
      ),
    [user?.userId, selected],
    { keepPrevious: true },
  );

  if (state.status === 'loading' || periodState.status === 'loading') {
    return <HrLoading label="evaluations" />;
  }
  if (periodState.status !== 'success') {
    return <HrResultFallback result={periodState.failure} subject="Evaluations" />;
  }
  if (state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject="Evaluations" />;
  }

  const periods = periodState.data;
  const rows = state.data;

  async function remind(evaluationId: string, name: string) {
    const result = await mockHrService.sendReminder(user?.userId ?? '', evaluationId);
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'success',
        title: 'Reminder sent',
        description: `The reviewer for ${name} was reminded that scoring is outstanding.`,
      });
    }
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Evaluations"
        description="Evaluation periods, reviewer assignment, progress, reminders and publication."
        meta={<CompanyScope />}
        actions={
          <Button
            variant="primary"
            onClick={() => setCreateOpen(true)}
            iconLeading={<CalendarPlus aria-hidden className="size-4" />}
          >
            Create evaluation period
          </Button>
        }
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {periods.map((period) => (
          <Card key={period.id}>
            <CardHeader
              title={period.name}
              description={`${period.typeLabel} · ${period.rangeLabel} · due ${period.dueDateLabel}`}
              actions={
                <Badge tone={period.isOpen ? 'accent' : 'neutral'}>
                  {period.isOpen ? 'Open' : 'Closed'}
                </Badge>
              }
            />
            <ProgressBar
              className="mt-4"
              value={period.progressPercent}
              label="Published"
              valueText={`${period.published} of ${period.total}`}
              tone="complete"
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-caption text-ink-muted">Not started</dt>
                <dd className="font-semibold text-ink tabular">{period.notStarted}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Reviewer scoring</dt>
                <dd className="font-semibold text-ink tabular">{period.reviewerScoring}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">With HR</dt>
                <dd className="font-semibold text-ink tabular">{period.hrReview}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Weighting</dt>
                <dd className="font-semibold text-ink tabular">v{period.weightingVersion}</dd>
              </div>
            </dl>
            {period.overdueReviewerCount > 0 && (
              <Callout tone="warning" className="mt-3">
                {period.overdueReviewerCount} evaluation(s) are past the due date.
              </Callout>
            )}
          </Card>
        ))}
      </div>

      <Tabs
        className="mt-5"
        items={[
          { key: 'all', label: 'All evaluations' },
          ...periods.map((period) => ({ key: period.id, label: period.name })),
        ]}
        activeKey={selected}
        onChange={setSelected}
        label="Evaluation periods"
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.id} className="h-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={row.href}
                  className="inline-flex min-h-6 items-center text-h3 text-ink hover:underline"
                >
                  {row.employee.fullName}
                </Link>
                <p className="text-caption text-ink-muted">
                  {row.periodLabel} · due {row.dueDateLabel}
                </p>
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={stateTone(row.state)}>{row.stateLabel}</Badge>
                {row.isOverdue && <Badge tone="danger">Overdue</Badge>}
              </span>
            </div>
            <p className="mt-3 text-caption text-ink-muted">
              Reviewer: {row.reviewer?.fullName ?? 'Not assigned'}
            </p>
            <p className="mt-3 text-label text-ink-muted">Weighted result</p>
            <p className="text-metric text-ink">
              {row.weightedScore === null ? 'Not scored' : `${row.weightedScore.toFixed(2)} / 5`}
            </p>
            {row.reminderSentAtLabel && (
              <p className="mt-2 text-caption text-ink-muted">
                Reminder sent {row.reminderSentAtLabel}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton variant="secondary" size="sm" href={row.href}>
                Open review
              </LinkButton>
              {row.state !== 'published' && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeading={<BellRing aria-hidden className="size-4" />}
                  onClick={() => remind(row.id, row.employee.fullName)}
                >
                  Send reminder
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {rows.length === 0 && (
        <EmptyState
          className="mt-5"
          title="No evaluations in this period"
          description="Create an evaluation period and assign employees to reviewers."
        />
      )}

      <CreatePeriodDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          reloadPeriods();
          reload();
        }}
      />
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0525 — evaluation detail                                                */
/* -------------------------------------------------------------------------- */

export function HrEvaluationDetail({ evaluationId }: { evaluationId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [failure, setFailure] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockHrService.getEvaluation(user?.userId ?? '', evaluationId),
    [user?.userId, evaluationId],
  );

  if (state.status === 'loading') return <HrLoading label="evaluation" />;
  if (state.status !== 'success') return <HrResultFallback result={state.failure} subject="Evaluation" />;

  const evaluation = state.data;
  const areas = Object.keys(AREA_LABEL) as EvaluationAreaKey[];

  async function publish() {
    setFailure(null);
    const result = await mockHrService.publishEvaluation(user?.userId ?? '', evaluationId);
    if (result.status === 'success') {
      setPublishOpen(false);
      reload();
      toast.show({
        tone: 'success',
        title: 'Evaluation published',
        description: 'The employee can now see the result, comments and weighted score.',
      });
      return;
    }
    setFailure('guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message);
  }

  async function returnToReviewer() {
    setFailure(null);
    const result = await mockHrService.returnEvaluation(
      user?.userId ?? '',
      evaluationId,
      returnReason,
    );
    if (result.status === 'success') {
      setReturnOpen(false);
      setReturnReason('');
      reload();
      toast.show({
        tone: 'info',
        title: 'Returned to the reviewer',
        description: 'Scoring reopened. The employee still cannot see it.',
      });
      return;
    }
    setFailure('guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message);
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title={`${evaluation.employee.fullName} evaluation`}
        description={`${evaluation.periodLabel} · due ${evaluation.dueDateLabel} · reviewer ${evaluation.reviewer?.fullName ?? 'not assigned'}`}
        crumbs={[{ label: 'Evaluations', href: '/evaluations' }, { label: evaluation.employee.fullName }]}
        backHref="/evaluations"
        backLabel="Evaluations"
        meta={
          <>
            <CompanyScope />
            <Badge tone={stateTone(evaluation.state)}>{evaluation.stateLabel}</Badge>
            {evaluation.isReadOnly && <Badge tone="neutral">Read-only</Badge>}
          </>
        }
        actions={
          <>
            {evaluation.canReturn && (
              <Button
                variant="secondary"
                onClick={() => setReturnOpen(true)}
                iconLeading={<Undo2 aria-hidden className="size-4" />}
              >
                Return to reviewer
              </Button>
            )}
            {evaluation.canPublish && (
              <Button
                variant="primary"
                onClick={() => setPublishOpen(true)}
                iconLeading={<Send aria-hidden className="size-4" />}
              >
                Publish to employee
              </Button>
            )}
          </>
        }
      />

      {failure && (
        <Alert className="mt-4" tone="danger" title="Action could not be completed" live>
          {failure}
        </Alert>
      )}

      {evaluation.state !== 'published' && (
        <Callout tone="info" className="mt-5">
          This evaluation is unpublished. The employee cannot see any part of it until HR
          publishes it.
        </Callout>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Automatic facts"
              description="Derived from the authoritative time, task, WFH, leave and remark records. Never hand-entered."
            />
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {evaluation.facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-caption text-ink-muted">{fact.label}</dt>
                  <dd className="mt-1 text-body font-semibold text-ink tabular">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Self-evaluation"
              description="The employee's own account of the period."
            />
            {evaluation.selfEvaluationState === 'restricted' && (
              <div className="mt-4">
                <RestrictedValue reason={evaluation.restrictedNote ?? undefined} />
                <p className="mt-2 text-body-sm text-ink-muted">{evaluation.restrictedNote}</p>
              </div>
            )}
            {evaluation.selfEvaluationState === 'not_submitted' && (
              <EmptyState
                className="mt-4"
                title="Not submitted yet"
                description="The employee has not submitted a self-evaluation for this period."
              />
            )}
            {evaluation.selfEvaluationState === 'submitted' && evaluation.selfEvaluation && (
              <dl className="mt-4 space-y-3">
                {evaluation.selfEvaluation.map((entry) => (
                  <div key={entry.label}>
                    <dt className="text-label text-ink-muted">{entry.label}</dt>
                    <dd className="mt-0.5 text-body-sm text-ink">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Team Lead scoring"
              description={`Default weighting version ${evaluation.weightingVersion}: 30/25/15/10/10/10.`}
            />
            <ul className="mt-4 space-y-3">
              {areas.map((area) => (
                <li key={area} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-body-sm font-medium text-ink">{AREA_LABEL[area]}</p>
                      <p className="text-caption text-ink-muted">
                        Weight {evaluation.weights[area]}%
                      </p>
                    </div>
                    <Badge tone={evaluation.scores[area] ? 'accent' : 'neutral'}>
                      {evaluation.scores[area] ? `${evaluation.scores[area]} / 5` : 'Not scored'}
                    </Badge>
                  </div>
                  {evaluation.comments[area] && (
                    <p className="mt-2 text-body-sm text-ink-muted">{evaluation.comments[area]}</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-label text-ink-muted">Reviewer summary</p>
              <p className="mt-1 text-body-sm text-ink">
                {evaluation.reviewerSummary || 'No summary submitted yet.'}
              </p>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader
              title="Final result"
              description="Calculated by the evaluation service from the scores and the weighting version."
            />
            <p className="mt-4 text-metric text-ink">
              {evaluation.weightedScore === null
                ? 'Not calculated'
                : `${evaluation.weightedScore.toFixed(2)} / 5`}
            </p>
            <p className="mt-1 text-caption text-ink-muted">
              Weighting version {evaluation.weightingVersion}
            </p>
            {evaluation.publishedAtLabel && (
              <p className="mt-3 text-body-sm text-ink">
                Published {evaluation.publishedAtLabel} by {evaluation.publishedByLabel}
              </p>
            )}
            {evaluation.isReadOnly && (
              <div className="mt-4 rounded-md border border-border bg-surface-sunken p-3 text-body-sm text-ink-muted">
                A published evaluation is read-only. Changing it would alter a result the employee
                has already seen.
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Publication history" description="Who moved this evaluation, and when." />
            <ol className="mt-4 space-y-3">
              {evaluation.publicationHistory.map((entry) => (
                <li key={entry.label} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">{entry.label}</p>
                    <p className="text-caption text-ink-muted">
                      {entry.actorLabel} · {entry.atLabel}
                    </p>
                  </div>
                </li>
              ))}
              {evaluation.publicationHistory.length === 0 && (
                <li className="text-body-sm text-ink-muted">Nothing recorded yet.</li>
              )}
            </ol>
          </Card>
        </aside>
      </div>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish this evaluation to the employee?"
        description="Publication makes the result, comments and weighted score visible to the employee."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={publish}>
              Publish evaluation
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-ink-muted">
          After publication the evaluation becomes read-only. Correcting it would change a result
          the employee has already seen, so return it to the reviewer first if anything is wrong.
        </p>
      </Dialog>

      <Dialog
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Return to the reviewer"
        description="Scoring reopens for the Team Lead. The employee still cannot see the evaluation."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={returnToReviewer}>
              Return evaluation
            </Button>
          </>
        }
      >
        <Field label="What should the reviewer change?" required>
          <Textarea
            rows={4}
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
          />
        </Field>
      </Dialog>
    </PageContainer>
  );
}
