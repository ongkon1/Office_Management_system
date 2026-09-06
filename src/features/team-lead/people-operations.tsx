'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CheckCircle2, Gauge, Send, Users } from 'lucide-react';
import type { EvaluationAreaKey } from '@/contracts/domain';
import type { TeamEvaluationView, TeamRequestView } from '@/contracts/team-lead';
import { mockTeamLeadService } from '@/services/mock/team-lead';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Select, Textarea } from '@/components/forms/inputs';
import { cn } from '@/lib/cn';
import { REQUEST_STATE_LABEL } from '@/lib/status';

function Loading({ label }: { label: string }) {
  return <PageContainer><div role="status" aria-busy><span className="sr-only">Loading {label}</span><Skeleton height="2rem" width="18rem" /><Skeleton height="18rem" rounded="md" className="mt-5" /></div></PageContainer>;
}

function Scope({ label = 'Assigned employee scope' }: { label?: string }) {
  return <Badge tone="accent" icon={<Users aria-hidden className="size-3.5" />}>{label}</Badge>;
}

function requestTone(state: TeamRequestView['state']): BadgeTone {
  if (state === 'approved') return 'success';
  if (state === 'rejected') return 'danger';
  if (state === 'information_requested') return 'warning';
  return state === 'pending' ? 'accent' : 'neutral';
}

export function RequestQueue() {
  const router = useRouter();
  const { user } = useSession();
  const [tab, setTab] = React.useState('pending');
  const { state } = useAsync(() => mockTeamLeadService.listRequests(user?.userId ?? ''), [user?.userId]);
  if (state.status === 'loading') return <Loading label="request queue" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Requests unavailable" /></PageContainer>;
  const items = state.data.filter((item) => tab === 'all' || item.state === tab);
  const tabs = [
    { key: 'pending', label: 'Pending', badgeCount: state.data.filter((item) => item.state === 'pending').length },
    { key: 'information_requested', label: 'Information requested', badgeCount: state.data.filter((item) => item.state === 'information_requested').length },
    { key: 'approved', label: 'Approved', badgeCount: state.data.filter((item) => item.state === 'approved').length },
    { key: 'rejected', label: 'Rejected', badgeCount: state.data.filter((item) => item.state === 'rejected').length },
    { key: 'all', label: 'All' },
  ];
  return (
    <PageContainer>
      <PageHeader title="WFH and Leave Requests" description="Review requests submitted by employees assigned to you." meta={<Scope />} />
      <Tabs items={tabs} activeKey={tab} onChange={setTab} label="Request queue states" className="mt-5" />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((request) => (
          <button key={`${request.kind}-${request.id}`} type="button" onClick={() => router.push(`/requests/${request.kind}/${request.id}`)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <Card className="h-full hover:border-highlight-hover hover:bg-surface-sunken">
              <div className="flex items-start justify-between gap-3"><div><p className="text-caption font-semibold uppercase tracking-wide text-accent">{request.kind === 'wfh' ? 'WFH request' : 'Leave request'}</p><h2 className="mt-1 text-h3 text-ink">{request.employee.fullName}</h2><p className="text-caption text-ink-muted">{request.employee.employeeCode} · {request.division.code}</p></div><Badge tone={requestTone(request.state)}>{REQUEST_STATE_LABEL[request.state]}</Badge></div>
              <p className="mt-4 text-body-sm font-medium text-ink">{request.dateLabel} · {request.portionLabel}</p>
              <p className="mt-2 line-clamp-2 text-body-sm text-ink-muted">{request.reason}</p>
              {request.overrideReason && <div className="mt-3 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">HR override recorded: {request.overrideReason}</div>}
            </Card>
          </button>
        ))}
      </div>
      {items.length === 0 && <EmptyState className="mt-5" title={`No ${tab.replace('_', ' ')} requests`} description="No requests in this assigned-scope view." />}
    </PageContainer>
  );
}

export function RequestDetail({ kind, requestId }: { kind: 'wfh' | 'leave'; requestId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [version, setVersion] = React.useState(0);
  const [decision, setDecision] = React.useState<'approved' | 'rejected' | 'information_requested'>('approved');
  const [remark, setRemark] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);
  const { state } = useAsync(async () => {
    const result = await mockTeamLeadService.listRequests(user?.userId ?? '');
    if (result.status !== 'success') return result;
    const item = result.data.find((request) => request.kind === kind && request.id === requestId);
    return item ? { status: 'success' as const, data: item } : { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'Request not found.' };
  }, [user?.userId, kind, requestId, version]);
  if (state.status === 'loading') return <Loading label="request" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Request not found" description="It may be outside your assigned scope." /></PageContainer>;
  const request = state.data;
  const canDecide = request.state === 'pending' || request.state === 'information_requested';
  async function applyDecision() {
    const result = await mockTeamLeadService.decideRequest({ userId: user?.userId ?? '', kind, id: requestId, outcome: decision, remark });
    if (result.status === 'success') { setConfirming(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Request decision recorded', description: `${request.employee.fullName} will receive a notification.` }); }
  }
  return (
    <PageContainer width="narrow">
      <PageHeader title={`${kind === 'wfh' ? 'WFH' : 'Leave'} request`} description={`${request.employee.fullName} · ${request.dateLabel}`} crumbs={[{ label: 'Requests', href: '/requests' }, { label: request.id }]} backHref="/requests" backLabel="Requests" meta={<><Scope /><Badge tone={requestTone(request.state)}>{REQUEST_STATE_LABEL[request.state]}</Badge></>} />
      <Card className="mt-5"><CardHeader title="Request details" /><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-caption text-ink-muted">Employee</dt><dd className="font-medium text-ink">{request.employee.fullName}</dd></div><div><dt className="text-caption text-ink-muted">Division</dt><dd className="font-medium text-ink">{request.division.name}</dd></div><div><dt className="text-caption text-ink-muted">Date</dt><dd className="text-ink">{request.dateLabel}</dd></div><div><dt className="text-caption text-ink-muted">Portion</dt><dd className="text-ink">{request.portionLabel}</dd></div></dl><div className="mt-4 border-t border-border pt-4"><p className="text-label text-ink-muted">Reason</p><p className="mt-1 text-body-sm text-ink">{request.reason}</p><p className="mt-3 text-label text-ink-muted">Planned work or leave details</p><p className="mt-1 text-body-sm text-ink">{request.details}</p></div></Card>
      {request.decisionLabel && <Card className="mt-5"><CardHeader title="Decision history" description="The actor, outcome, and any audited HR override remain visible." /><p className="mt-3 text-body-sm text-ink">{request.decisionLabel}</p>{request.overrideReason && <div className="mt-3 rounded-md border border-undertime-border bg-undertime-surface p-3 text-body-sm text-undertime"><strong>Audited HR override:</strong> {request.overrideReason}</div>}</Card>}
      {canDecide && <Card className="mt-5"><CardHeader title="Decision" description="A general remark is optional for approval and required for rejection or information requests." /><div className="mt-4 space-y-4"><Field label="Outcome"><Select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} options={[{ value: 'approved', label: 'Approve request' }, { value: 'information_requested', label: 'Request information' }, { value: 'rejected', label: 'Reject request' }]} /></Field><Field label="General remark" required={decision !== 'approved'} helperText="Included in the employee notification and decision history."><Textarea rows={4} value={remark} onChange={(event) => setRemark(event.target.value)} /></Field><Button variant="primary" iconLeading={<CheckCircle2 aria-hidden className="size-4" />} onClick={() => setConfirming(true)} disabled={decision !== 'approved' && !remark.trim()}>Review decision</Button></div></Card>}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Confirm request decision" description={`${REQUEST_STATE_LABEL[decision]} · ${request.employee.fullName}`} dismissOnBackdrop={false} footer={<><Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button><Button variant="primary" onClick={applyDecision}>Confirm and notify</Button></>}><div className="rounded-md border border-accent-border bg-accent-subtle p-3"><p className="text-body-sm font-semibold text-ink">Notification preview</p><p className="mt-1 text-caption text-ink-muted">{request.employee.fullName} will receive the outcome, request date, and your general remark without protected details.</p></div></Dialog>
    </PageContainer>
  );
}

export function WorkloadPlanner() {
  const { user } = useSession();
  const [view, setView] = React.useState<'capacity' | 'calendar'>('capacity');
  const { state } = useAsync(() => mockTeamLeadService.listWorkload(user?.userId ?? ''), [user?.userId]);
  if (state.status === 'loading') return <Loading label="workload" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Workload unavailable" /></PageContainer>;
  const overallocated = state.data.filter((item) => item.warning === 'overallocated').length;
  const underallocated = state.data.filter((item) => item.warning === 'underallocated').length;
  return (
    <PageContainer width="full">
      <PageHeader title="Workload" description="Weekly capacity, assignment, actual contribution, and leave-adjusted availability." meta={<Scope />} actions={<><Button variant={view === 'capacity' ? 'primary' : 'secondary'} onClick={() => setView('capacity')} iconLeading={<Gauge aria-hidden className="size-4" />}>Capacity</Button><Button variant={view === 'calendar' ? 'primary' : 'secondary'} onClick={() => setView('calendar')} iconLeading={<CalendarDays aria-hidden className="size-4" />}>Calendar</Button></>} />
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><MetricCard tile={{ key: 'people', label: 'Assigned employees', value: String(state.data.length) }} /><MetricCard tile={{ key: 'over', label: 'Overallocated', value: String(overallocated), tone: overallocated ? 'negative' : 'neutral' }} /><MetricCard tile={{ key: 'under', label: 'Underallocated', value: String(underallocated), tone: underallocated ? 'caution' : 'neutral' }} /></div>
      {view === 'capacity' ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{state.data.map((item) => <Card key={item.employee.id}><div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{item.employee.fullName}</h2><p className="text-caption text-ink-muted">{item.employee.employeeCode} · weekly capacity</p></div>{item.warning && <Badge tone={item.warning === 'overallocated' ? 'danger' : 'warning'}>{item.warning === 'overallocated' ? 'Overallocated' : 'Underallocated'}</Badge>}</div><ProgressBar className="mt-4" value={item.utilizationPercent} label="Planned utilization" valueText={`${item.utilizationPercent}%`} tone={item.warning === 'overallocated' ? 'critical' : item.warning === 'underallocated' ? 'undertime' : 'accent'} /><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><dt className="text-caption text-ink-muted">Capacity</dt><dd className="font-semibold text-ink"><Duration value={item.capacity} /></dd></div><div><dt className="text-caption text-ink-muted">Assigned</dt><dd className="font-semibold text-ink"><Duration value={item.assigned} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="font-semibold text-ink"><Duration value={item.actual} /></dd></div><div><dt className="text-caption text-ink-muted">Remaining</dt><dd className={cn('font-semibold', item.remaining.minutes < 0 ? 'text-danger' : 'text-ink')}><Duration value={item.remaining} /></dd></div></dl><div className="mt-4 border-t border-border pt-3"><p className="text-label text-ink-muted">Upcoming deadlines</p>{item.upcomingDeadlines.length ? <ul className="mt-2 space-y-1">{item.upcomingDeadlines.map((deadline) => <li key={deadline} className="text-caption text-ink">{deadline}</li>)}</ul> : <p className="mt-1 text-caption text-ink-muted">No upcoming deadlines.</p>}</div></Card>)}</div> : <div className="mt-5 space-y-4">{state.data.map((item) => <Card key={item.employee.id} padding="none"><div className="border-b border-border p-4"><h2 className="text-h3 text-ink">{item.employee.fullName}</h2><p className="text-caption text-ink-muted">Division and project context · leave-adjusted capacity</p></div><div className="grid grid-cols-1 divide-y divide-border md:grid-cols-5 md:divide-x md:divide-y-0">{item.days.map((day) => <div key={day.label} className={cn('min-h-32 p-3', day.leaveAdjusted && 'bg-info-surface')}><div className="flex items-center justify-between"><p className="text-label text-ink">{day.label}</p><span className="text-caption text-ink-muted"><Duration value={day.capacity} /></span></div>{day.leaveAdjusted && <Badge tone="info" className="mt-2">Half-day leave</Badge>}<div className="mt-2 space-y-2">{day.allocations.map((allocation, index) => <div key={`${allocation.projectCode}-${index}`} className="rounded-md border border-accent-border bg-accent-subtle p-2"><p className="text-caption font-semibold text-accent">{allocation.divisionCode} · {allocation.projectCode}</p><p className="mt-1 text-caption text-ink-muted"><Duration value={allocation.duration} /></p></div>)}</div></div>)}</div></Card>)}</div>}
    </PageContainer>
  );
}

const AREA_LABELS: Readonly<Record<EvaluationAreaKey, string>> = {
  task_completion: 'Task completion', work_quality: 'Work quality', timeliness: 'Timeliness',
  teamwork_communication: 'Teamwork and communication', responsibility: 'Responsibility', learning_initiative: 'Learning and initiative',
};
const AREA_WEIGHTS: Readonly<Record<EvaluationAreaKey, number>> = { task_completion: 30, work_quality: 25, timeliness: 15, teamwork_communication: 10, responsibility: 10, learning_initiative: 10 };
const AREAS = Object.keys(AREA_LABELS) as EvaluationAreaKey[];

function evaluationTone(state: TeamEvaluationView['state']): BadgeTone {
  if (state === 'published') return 'success';
  if (state === 'hr_review') return 'info';
  if (state === 'reviewer_scoring') return 'accent';
  return 'neutral';
}

export function EvaluationQueue() {
  const router = useRouter(); const { user } = useSession();
  const { state } = useAsync(() => mockTeamLeadService.listEvaluations(user?.userId ?? ''), [user?.userId]);
  if (state.status === 'loading') return <Loading label="evaluations" />; if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Evaluations unavailable" /></PageContainer>;
  return <PageContainer><PageHeader title="Evaluations" description="Review factual inputs and complete weighted Team Lead scoring." meta={<Scope />} /><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.data.map((evaluation) => <button type="button" key={evaluation.id} onClick={() => router.push(`/evaluations/${evaluation.id}`)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><Card className="h-full hover:border-highlight-hover hover:bg-surface-sunken"><div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{evaluation.employee.fullName}</h2><p className="text-caption text-ink-muted">{evaluation.periodLabel} · Due {evaluation.dueDateLabel}</p></div><Badge tone={evaluationTone(evaluation.state)}>{evaluation.state.replace('_', ' ')}</Badge></div><div className="mt-5"><p className="text-label text-ink-muted">Weighted score</p><p className="mt-1 text-metric text-ink">{evaluation.weightedScore === null ? 'Not scored' : `${evaluation.weightedScore.toFixed(2)} / 5`}</p></div></Card></button>)}</div></PageContainer>;
}

export function EvaluationDetail({ evaluationId }: { evaluationId: string }) {
  const { user } = useSession(); const toast = useToast(); const [version, setVersion] = React.useState(0);
  const { state } = useAsync(() => mockTeamLeadService.getEvaluation(user?.userId ?? '', evaluationId), [user?.userId, evaluationId, version]);
  const [scores, setScores] = React.useState<TeamEvaluationView['scores'] | null>(null); const [comments, setComments] = React.useState<TeamEvaluationView['comments'] | null>(null); const [summary, setSummary] = React.useState(''); const [confirming, setConfirming] = React.useState(false); const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  if (state.status === 'loading') return <Loading label="evaluation" />; if (state.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Evaluation not found" /></PageContainer>;
  const evaluation = state.data; const currentScores = scores ?? evaluation.scores; const currentComments = comments ?? evaluation.comments; const currentSummary = summary || evaluation.summary; const readOnly = evaluation.state === 'published' || evaluation.state === 'hr_review';
  async function save(submit: boolean) { const missing = AREAS.filter((area) => !currentScores[area]).map((area) => ({ field: area, message: `Score ${AREA_LABELS[area]}.` })); if (submit && missing.length) { setErrors(missing); return; } const result = await mockTeamLeadService.saveEvaluation({ userId: user?.userId ?? '', id: evaluation.id, scores: currentScores, comments: currentComments, summary: currentSummary, submit }); if (result.status === 'success') { setConfirming(false); setErrors([]); setScores(null); setComments(null); setSummary(''); setVersion((value) => value + 1); toast.show({ tone: 'success', title: submit ? 'Evaluation submitted to HR' : 'Evaluation draft saved', description: 'The weighted score was calculated by the service.' }); } }
  return <PageContainer><PageHeader title={`${evaluation.employee.fullName} evaluation`} description={`${evaluation.periodLabel} · Due ${evaluation.dueDateLabel}`} crumbs={[{ label: 'Evaluations', href: '/evaluations' }, { label: evaluation.employee.fullName }]} backHref="/evaluations" backLabel="Evaluations" meta={<><Scope /><Badge tone={evaluationTone(evaluation.state)}>{evaluation.state.replace('_', ' ')}</Badge></>} /><div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-5"><Card><CardHeader title="Supporting facts" description="Derived from authoritative time, task, WFH, leave, and remark records." /><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{evaluation.facts.map((fact) => <div key={fact.label}><dt className="text-caption text-ink-muted">{fact.label}</dt><dd className="mt-1 text-body font-semibold text-ink">{fact.value}</dd></div>)}</dl></Card><form className="space-y-4"><FormErrorSummary errors={errors} />{AREAS.map((area) => <Card key={area}><div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{AREA_LABELS[area]}</h2><p className="text-caption text-ink-muted">Weight {AREA_WEIGHTS[area]}%</p></div><Badge tone={currentScores[area] ? 'accent' : 'neutral'}>{currentScores[area] ? `${currentScores[area]} / 5` : 'Not scored'}</Badge></div><div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]"><Field label={`${AREA_LABELS[area]} score`} required><Select disabled={readOnly} value={String(currentScores[area] || '')} placeholder="Choose score" onChange={(event) => setScores({ ...currentScores, [area]: Number(event.target.value) })} options={[1,2,3,4,5].map((value) => ({ value: String(value), label: `${value} — ${value === 1 ? 'Needs improvement' : value === 5 ? 'Exceptional' : 'Meets expectations'}` }))} /></Field><Field label="Supporting comment"><Textarea disabled={readOnly} rows={3} value={currentComments[area]} onChange={(event) => setComments({ ...currentComments, [area]: event.target.value })} /></Field></div></Card>)}<Card><Field label="Reviewer summary" required><Textarea disabled={readOnly} rows={5} value={currentSummary} onChange={(event) => setSummary(event.target.value)} /></Field></Card>{!readOnly && <StickyActionBar><Button type="button" variant="secondary" onClick={() => save(false)}>Save draft</Button><Button type="button" variant="primary" iconLeading={<Send aria-hidden className="size-4" />} onClick={() => setConfirming(true)}>Submit review</Button></StickyActionBar>}</form></div><aside className="space-y-5"><Card className="sticky top-[calc(var(--shell-topbar-height)+1rem)]"><CardHeader title="Weighted summary" description="Calculated by the evaluation service after saving." /><p className="mt-4 text-metric text-ink">{evaluation.weightedScore === null ? 'Not calculated' : `${evaluation.weightedScore.toFixed(2)} / 5`}</p><p className="mt-2 text-caption text-ink-muted">Weighting version 1 · 30/25/15/10/10/10</p>{readOnly && <div className="mt-4 rounded-md border border-border bg-surface-sunken p-3 text-body-sm text-ink-muted">This submitted evaluation is read-only. HR must return it before scores can change.</div>}</Card></aside></div><Dialog open={confirming} onClose={() => setConfirming(false)} title="Submit evaluation to HR?" description="Scores and the weighted result become read-only after submission." dismissOnBackdrop={false} footer={<><Button variant="secondary" onClick={() => setConfirming(false)}>Keep editing</Button><Button variant="primary" onClick={() => save(true)}>Submit review</Button></>}><p className="text-body-sm text-ink-muted">HR will receive the review for its next workflow stage. The employee cannot see it until HR publishes the evaluation.</p></Dialog></PageContainer>;
}
