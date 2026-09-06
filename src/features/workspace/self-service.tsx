'use client';

import * as React from 'react';
import { CalendarPlus, Info, Plus, Save, Send, X } from 'lucide-react';
import type { DayPortion, LeaveTypeKey } from '@/contracts/domain';
import type {
  SelfEvaluationFormValues,
  SelfRequestView,
} from '@/contracts/workspace';
import { mockWorkspaceService } from '@/services/mock/workspace';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, RadioGroup, Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

function stateTone(state: SelfRequestView['state']): BadgeTone {
  if (state === 'approved') return 'success';
  if (state === 'rejected') return 'danger';
  if (state === 'information_requested') return 'warning';
  if (state === 'cancelled') return 'neutral';
  return 'accent';
}

/**
 * A request card.
 *
 * `nextStep` is the point: an employee looking at a pending request wants to
 * know what happens now and whether they can still change it, not merely which
 * state word applies.
 */
function RequestCard({
  request,
  onCancel,
}: {
  request: SelfRequestView;
  onCancel: (request: SelfRequestView) => void;
}) {
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-ink">
            {request.dateLabel} · {request.portionLabel}
            {request.leaveTypeLabel ? ` · ${request.leaveTypeLabel}` : ''}
          </p>
          <p className="mt-0.5 text-caption text-ink-muted">{request.reason}</p>
        </div>
        <Badge tone={stateTone(request.state)}>{request.stateLabel}</Badge>
      </div>

      {request.detail && (
        <p className="mt-2 text-caption text-ink-subtle">{request.detail}</p>
      )}

      {request.conflictNote && (
        <p className="mt-2 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">
          {request.conflictNote}
        </p>
      )}

      {request.decisionLabel && (
        <p className="mt-2 text-caption text-ink-muted">
          {request.decisionLabel}
          {request.decisionComment ? ` — ${request.decisionComment}` : ''}
        </p>
      )}

      {request.overrideNote && (
        <p className="mt-2 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">
          {request.overrideNote}
        </p>
      )}

      {request.nextStep && (
        <p className="mt-2 flex items-start gap-1.5 text-caption text-ink">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
          {request.nextStep}
        </p>
      )}

      {request.canCancel && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            iconLeading={<X aria-hidden className="size-4" />}
            onClick={() => onCancel(request)}
          >
            Cancel request
          </Button>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0720 — employee WFH                                                     */
/* -------------------------------------------------------------------------- */

export function WfhSelfService() {
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState('all');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    wfhDate: '2026-09-08',
    portion: 'full_day' as DayPortion,
    divisionId: '',
    reason: '',
    plannedTasks: '',
    contactAvailability: '',
  });
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [conflict, setConflict] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockWorkspaceService.getWfhSelfService(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="work from home" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Work from home" />;
  }
  const data = state.data;
  const divisionId = form.divisionId || data.divisionOptions[0]?.value || '';

  async function submit() {
    setErrors([]);
    setConflict(null);
    const result = await mockWorkspaceService.submitWfhRequest(user?.userId ?? '', {
      ...form,
      divisionId,
    });
    if (result.status === 'success') {
      setOpen(false);
      reload();
      toast.show({
        tone: 'success',
        title: 'WFH request submitted',
        description: 'Your Team Lead will decide. You can cancel it while it is pending.',
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
      return;
    }
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  async function cancel(request: SelfRequestView) {
    const result = await mockWorkspaceService.cancelRequest(user?.userId ?? '', 'wfh', request.id);
    if (result.status === 'success') {
      reload();
      toast.show({ tone: 'info', title: 'Request cancelled' });
    }
  }

  const filtered =
    tab === 'all' ? data.requests : data.requests.filter((request) => request.state === tab);
  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer>
      <PageHeader
        title="Work from home"
        description="Your requests, their decisions and what to do next."
        actions={
          <Button
            variant="primary"
            onClick={() => setOpen(true)}
            disabled={!data.canRequest}
            iconLeading={<Plus aria-hidden className="size-4" />}
          >
            Request WFH
          </Button>
        }
      />

      {data.approvedUpcoming.length > 0 && (
        <Callout tone="info" className="mt-5">
          You have {data.approvedUpcoming.length} approved upcoming WFH day(s). Record your
          completed work on those days as usual — an approved request does not record time for you.
        </Callout>
      )}

      <Tabs
        className="mt-5"
        items={[
          { key: 'all', label: 'All', badgeCount: data.requests.length },
          {
            key: 'pending',
            label: 'Pending',
            badgeCount: data.requests.filter((request) => request.state === 'pending').length,
          },
          {
            key: 'information_requested',
            label: 'Information requested',
            badgeCount: data.requests.filter(
              (request) => request.state === 'information_requested',
            ).length,
          },
          {
            key: 'approved',
            label: 'Approved',
            badgeCount: data.requests.filter((request) => request.state === 'approved').length,
          },
          {
            key: 'rejected',
            label: 'Rejected',
            badgeCount: data.requests.filter((request) => request.state === 'rejected').length,
          },
          {
            key: 'cancelled',
            label: 'Cancelled',
            badgeCount: data.requests.filter((request) => request.state === 'cancelled').length,
          },
        ]}
        activeKey={tab}
        onChange={setTab}
        label="WFH request states"
      />

      {filtered.length === 0 ? (
        <EmptyState
          className="mt-5"
          variant={tab === 'all' ? 'empty' : 'no-results'}
          title={tab === 'all' ? 'No WFH requests yet' : 'Nothing in this state'}
          description={
            tab === 'all'
              ? 'Request a work-from-home day and it will appear here with its decision.'
              : 'Switch to All to see every request.'
          }
        />
      ) : (
        <Card className="mt-5">
          <CardHeader title="Requests" description="Newest first." />
          <ul className="mt-4 space-y-3">
            {filtered.map((request) => (
              <RequestCard key={request.id} request={request} onCancel={cancel} />
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Request a work-from-home day"
        description="Your Team Lead decides. Requests are made in advance."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorSummary errors={errors} autoFocus={false} />
          {conflict && (
            <Alert tone="warning" title="Cannot submit this request" live>
              {conflict}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" required error={fieldError('wfhDate')}>
              <Input
                type="date"
                name="wfhDate"
                value={form.wfhDate}
                onChange={(event) => setForm({ ...form, wfhDate: event.target.value })}
              />
            </Field>
            <Field label="Portion" required>
              <Select
                value={form.portion}
                options={[
                  { value: 'full_day', label: 'Full day' },
                  { value: 'half_day', label: 'Half day' },
                ]}
                onChange={(event) =>
                  setForm({ ...form, portion: event.target.value as DayPortion })
                }
              />
            </Field>
          </div>
          <Field label="Division" required>
            <Select
              value={divisionId}
              options={data.divisionOptions}
              onChange={(event) => setForm({ ...form, divisionId: event.target.value })}
            />
          </Field>
          <Field label="Reason" required error={fieldError('reason')}>
            <Textarea
              rows={2}
              name="reason"
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </Field>
          <Field
            label="Work you plan to do"
            required
            error={fieldError('plannedTasks')}
            helperText="Name the tasks or deliverables so your Team Lead can judge the request."
          >
            <Textarea
              rows={2}
              name="plannedTasks"
              value={form.plannedTasks}
              onChange={(event) => setForm({ ...form, plannedTasks: event.target.value })}
            />
          </Field>
          <Field label="How to reach you" helperText="Hours and channel.">
            <Input
              value={form.contactAvailability}
              onChange={(event) => setForm({ ...form, contactAvailability: event.target.value })}
            />
          </Field>
        </div>
      </Dialog>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0721 — employee leave                                                   */
/* -------------------------------------------------------------------------- */

export function LeaveSelfService() {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    leaveType: 'annual' as LeaveTypeKey,
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    portion: 'full_day' as DayPortion,
    reason: '',
  });
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [conflict, setConflict] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockWorkspaceService.getLeaveSelfService(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="leave" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Leave" />;
  }
  const data = state.data;
  const selectedType = data.leaveTypeOptions.find((option) => option.value === form.leaveType);

  async function submit() {
    setErrors([]);
    setConflict(null);
    const result = await mockWorkspaceService.submitLeaveRequest(user?.userId ?? '', form);
    if (result.status === 'success') {
      setOpen(false);
      reload();
      toast.show({
        tone: 'success',
        title: 'Leave request submitted',
        description: 'Your Team Lead will decide. Approved leave removes the timesheet requirement for those days.',
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
      return;
    }
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  async function cancel(request: SelfRequestView) {
    const result = await mockWorkspaceService.cancelRequest(user?.userId ?? '', 'leave', request.id);
    if (result.status === 'success') {
      reload();
      toast.show({ tone: 'info', title: 'Request cancelled' });
    }
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer>
      <PageHeader
        title="Leave"
        description="Your balances, requests and their decisions."
        actions={
          <Button
            variant="primary"
            onClick={() => setOpen(true)}
            disabled={!data.canRequest}
            iconLeading={<CalendarPlus aria-hidden className="size-4" />}
          >
            Apply for leave
          </Button>
        }
      />

      <Card className="mt-5">
        <CardHeader title="Balances" description="Entitled, consumed and remaining days this year." />
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.balances.map((balance) => (
            <li key={balance.typeLabel} className="rounded-md border border-border p-3">
              <p className="text-caption text-ink-muted">{balance.typeLabel}</p>
              <p className="mt-1 text-metric text-ink tabular">
                {balance.remainingDays}
                <span className="text-body-sm text-ink-muted"> of {balance.entitledDays}</span>
              </p>
              <ProgressBar
                className="mt-2"
                value={
                  balance.entitledDays
                    ? Math.round((balance.consumedDays / balance.entitledDays) * 100)
                    : 0
                }
                label={`${balance.typeLabel} consumed`}
                hideLabel
                tone="accent"
              />
              <p className="mt-1 text-caption text-ink-muted">
                {balance.consumedDays} consumed
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Callout tone="info" className="mt-4">
        Approved full-day leave removes the timesheet requirement for that day. Half-day leave
        halves it — 3:30 active instead of 7:00 — so the day is not counted as under-time.
      </Callout>

      {data.requests.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="No leave requests yet"
          description="Apply for leave and it will appear here with its decision."
        />
      ) : (
        <Card className="mt-5">
          <CardHeader title="Requests" description="Newest first." />
          <ul className="mt-4 space-y-3">
            {data.requests.map((request) => (
              <RequestCard key={request.id} request={request} onCancel={cancel} />
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        description="Your Team Lead decides. Your balance is checked before the request is created."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorSummary errors={errors} autoFocus={false} />
          {conflict && (
            <Alert tone="warning" title="Cannot submit this request" live>
              {conflict}
            </Alert>
          )}
          <Field
            label="Leave type"
            required
            helperText={
              selectedType
                ? `${selectedType.remainingDays} day(s) remaining${selectedType.allowsHalfDay ? '. Half days allowed.' : '. Full days only.'}`
                : undefined
            }
          >
            <Select
              value={form.leaveType}
              options={data.leaveTypeOptions.map((option) => ({
                value: option.value,
                label: `${option.label} — ${option.remainingDays} left`,
              }))}
              onChange={(event) =>
                setForm({ ...form, leaveType: event.target.value as LeaveTypeKey })
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" required>
              <Input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </Field>
            <Field label="End date" required error={fieldError('endDate')}>
              <Input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Portion"
            required
            error={fieldError('portion')}
            helperText="A half day covers a single date and halves that day's requirement."
          >
            <RadioGroup
              name="portion"
              legend="Leave portion"
              hideLegend
              value={form.portion}
              onValueChange={(value) => setForm({ ...form, portion: value as DayPortion })}
              options={
                selectedType?.allowsHalfDay
                  ? [
                      { value: 'full_day', label: 'Full day' },
                      {
                        value: 'half_day',
                        label: 'Half day',
                        description: 'Halves the required active time for that date.',
                      },
                    ]
                  : [
                      {
                        value: 'full_day',
                        label: 'Full day',
                        description: 'This leave type cannot be taken as a half day.',
                      },
                    ]
              }
            />
          </Field>
          <Field label="Reason" required error={fieldError('reason')}>
            <Textarea
              rows={3}
              name="reason"
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </Field>
        </div>
      </Dialog>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0722 — employee evaluation                                              */
/* -------------------------------------------------------------------------- */

const SELF_FIELDS: readonly {
  key: keyof SelfEvaluationFormValues;
  label: string;
  helper: string;
}[] = [
  { key: 'achievements', label: 'Key achievements', helper: 'What went well this period.' },
  { key: 'completedProjects', label: 'Completed projects', helper: 'Work you finished or shipped.' },
  { key: 'challenges', label: 'Challenges faced', helper: 'What blocked or slowed you down.' },
  { key: 'skills', label: 'Skills developed', helper: 'What you learned or improved.' },
  { key: 'trainingNeeds', label: 'Training needs', helper: 'What would help you next.' },
  { key: 'goals', label: 'Goals for the next period', helper: 'What you plan to focus on.' },
  { key: 'supportRequired', label: 'Support required', helper: 'What you need from your Team Lead.' },
];

export function SelfEvaluation() {
  const { user } = useSession();
  const toast = useToast();
  const [values, setValues] = React.useState<SelfEvaluationFormValues | null>(null);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockWorkspaceService.getSelfEvaluation(user?.userId ?? ''),
    [user?.userId],
  );

  // Seed the form once per loaded evaluation, adjusted during render rather
  // than in an effect so the fields never paint empty first.
  if (state.status === 'success' && seededFor !== state.data.id) {
    setSeededFor(state.data.id);
    setValues(state.data.values);
  }

  if (state.status === 'loading') return <ReportsLoading label="evaluation" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Evaluation" />;
  }
  const data = state.data;
  const current = values ?? data.values;

  async function save(submit: boolean) {
    setErrors([]);
    const result = await mockWorkspaceService.saveSelfEvaluation(
      user?.userId ?? '',
      current,
      submit,
    );
    if (result.status === 'success') {
      setConfirmOpen(false);
      setSeededFor(null);
      reload();
      toast.show({
        tone: 'success',
        title: submit ? 'Self-evaluation submitted' : 'Draft saved',
        description: submit
          ? 'Your reviewer can now see it. You will see the result once HR publishes the evaluation.'
          : 'Only you can see this draft until you submit it.',
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

  return (
    <PageContainer width="full">
      <PageHeader
        title="My evaluation"
        description={`${data.periodLabel} · ${data.rangeLabel}`}
        meta={
          <>
            <Badge
              tone={
                data.status === 'published'
                  ? 'success'
                  : data.status === 'awaiting_self_evaluation'
                    ? 'warning'
                    : 'accent'
              }
            >
              {data.statusLabel}
            </Badge>
            {data.dueDateLabel !== '—' && <Badge tone="neutral">Due {data.dueDateLabel}</Badge>}
          </>
        }
      />

      <Callout tone="info" className="mt-5">
        {data.statusExplanation}
      </Callout>

      {data.status === 'not_open' ? (
        <EmptyState
          className="mt-5"
          title="No evaluation period open"
          description="HR opens evaluation periods and assigns reviewers. You will be notified when one starts."
        />
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            {data.published && (
              <Card>
                <CardHeader
                  title="Published result"
                  description={`Published ${data.published.publishedAtLabel}. Weighting 30/25/15/10/10/10.`}
                />
                <p className="mt-4 text-metric text-ink">
                  {data.published.weightedScore.toFixed(2)} / 5
                </p>
                <p className="mt-2 text-body-sm text-ink">{data.published.reviewerSummary}</p>
                <ul className="mt-4 space-y-2">
                  {data.published.areas.map((area) => (
                    <li key={area.label} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-body-sm font-medium text-ink">{area.label}</span>
                        <span className="flex items-center gap-2">
                          <Badge tone="neutral">Weight {area.weightPercent}%</Badge>
                          <Badge tone="accent">{area.score} / 5</Badge>
                        </span>
                      </div>
                      {area.comment && (
                        <p className="mt-1 text-caption text-ink-muted">{area.comment}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Self-evaluation"
                description={
                  data.isEditable
                    ? 'Only you can see this until you submit it.'
                    : 'This has been submitted and can no longer be changed.'
                }
              />
              <form className="mt-4 space-y-4">
                <FormErrorSummary errors={errors} />
                {SELF_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label}
                    helperText={field.helper}
                    disabled={!data.isEditable}
                    error={errors.find((error) => error.field === field.key)?.message}
                    required={field.key === 'achievements'}
                  >
                    <Textarea
                      rows={3}
                      name={field.key}
                      disabled={!data.isEditable}
                      value={current[field.key]}
                      onChange={(event) =>
                        setValues({ ...current, [field.key]: event.target.value })
                      }
                    />
                  </Field>
                ))}

                {data.isEditable && (
                  <StickyActionBar>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => save(false)}
                      iconLeading={<Save aria-hidden className="size-4" />}
                    >
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setConfirmOpen(true)}
                      iconLeading={<Send aria-hidden className="size-4" />}
                    >
                      Submit
                    </Button>
                  </StickyActionBar>
                )}
              </form>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader
                title="Automatic facts"
                description="Taken from your own recorded time. Your reviewer sees the same figures."
              />
              <dl className="mt-4 space-y-3">
                {data.facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-caption text-ink-muted">{fact.label}</dt>
                    <dd className="text-body font-semibold text-ink tabular">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              {data.submittedAtLabel && (
                <p className="mt-4 border-t border-border pt-3 text-caption text-ink-muted">
                  Submitted {data.submittedAtLabel}
                </p>
              )}
            </Card>
          </aside>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit your self-evaluation?"
        description="Your reviewer will be able to read it, and you will not be able to change it."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button variant="primary" onClick={() => save(true)}>
              Submit self-evaluation
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-ink-muted">
          You will see your reviewer’s scoring and the final result only once HR publishes the
          evaluation.
        </p>
      </Dialog>
    </PageContainer>
  );
}
