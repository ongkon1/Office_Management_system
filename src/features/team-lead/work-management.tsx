'use client';

import * as React from 'react';
import { TaskSourceMinute } from '@/features/meeting-minutes/task-source-minute';
import { useRouter } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import type { ProjectFormInput, ProjectFormOptionsView, TaskFormInput, TeamProjectView, TeamTaskView } from '@/contracts/team-lead';
import type { Priority, ProjectStatus } from '@/contracts/domain';
import { businessToday } from '@/lib/business-date';
import { teamLeadService as mockTeamLeadService } from '@/services/runtime/team-lead';
import { TaskReviewQueue } from './task-review-queue';
import {
  TaskDetailTransitions,
  TaskHistoryTimeline,
  TaskWorkflowBoard,
  type WorkflowBoardTask,
} from '@/features/tasks/task-workflow';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Duration, RestrictedValue } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs, TabPanel } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, Input, NumberInput, Select, Textarea } from '@/components/forms/inputs';
import { FilterBar } from '@/components/data/filters';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { cn } from '@/lib/cn';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'closed'] as const;

function Loading({ label }: { label: string }) {
  return <PageContainer><div role="status" aria-busy><span className="sr-only">Loading {label}</span><Skeleton height="2rem" width="18rem" /><Skeleton height="18rem" rounded="md" className="mt-5" /></div></PageContainer>;
}

function Scope() {
  return <Badge tone="accent" icon={<Users aria-hidden className="size-3.5" />}>Assigned divisions and projects</Badge>;
}

/** One line a person can act on, for a refusal that is not about one field. */
function failureMessage(result: { readonly message: string; readonly guidance?: string | null }) {
  return result.guidance ? `${result.message} ${result.guidance}` : result.message;
}

type FieldErrors = readonly { field: string; message: string }[];

/** Project and task form options, loaded from the service — never a fixed list. */
function useProjectFormOptions(userId: string) {
  return useAsync(() => mockTeamLeadService.getProjectFormOptions(userId), [userId]).state;
}

function ProjectForm({
  initial,
  options,
  onCancel,
  onSaved,
}: {
  initial?: TeamProjectView;
  options: ProjectFormOptionsView;
  onCancel: () => void;
  onSaved: (project: TeamProjectView) => void;
}) {
  const { user } = useSession();
  const [form, setForm] = React.useState<ProjectFormInput>(() => {
    if (initial) {
      return {
        name: initial.name, divisionId: initial.division.id, managerEmployeeId: initial.manager.id,
        memberIds: initial.members.map((member) => member.id), client: initial.client ?? '',
        startDate: initial.startDate ?? businessToday(), endDate: initial.endDate, priority: initial.priority,
        estimatedMinutes: initial.estimated.minutes, budgetAmount: initial.budgetAmount ?? '',
        completionPercent: initial.completionPercent, notes: initial.notes ?? '', status: initial.status,
      };
    }
    const divisionId = options.divisions[0]?.value ?? '';
    const selfPlaced = options.people.some((person) => person.value === user?.employeeId && person.divisionIds.includes(divisionId));
    return {
      name: '', divisionId, managerEmployeeId: selfPlaced ? user?.employeeId ?? '' : '', memberIds: [], client: '',
      startDate: businessToday(), endDate: null, priority: 'medium', estimatedMinutes: 0, budgetAmount: '',
      completionPercent: 0, notes: '',
    };
  });
  const [errors, setErrors] = React.useState<FieldErrors>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof ProjectFormInput>(key: K, value: ProjectFormInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const fieldError = (field: string) => errors.find((item) => item.field === field)?.message;

  // People placed in the chosen division. The current manager and members of
  // an existing project stay listed even if their placement has since ended,
  // so opening the form never silently drops them.
  const placed = options.people.filter((person) => person.divisionIds.includes(form.divisionId));
  const kept = initial
    ? [initial.manager, ...initial.members]
      .filter((person) => !placed.some((option) => option.value === person.id))
      .map((person) => ({ value: person.id, label: `${person.fullName} · ${person.employeeCode}`, divisionIds: [] }))
    : [];
  const people = [...placed, ...kept.filter((person, index) => kept.findIndex((other) => other.value === person.value) === index)];

  function changeDivision(divisionId: string) {
    const inDivision = (id: string) => options.people.some((person) => person.value === id && person.divisionIds.includes(divisionId));
    setForm((current) => ({
      ...current,
      divisionId,
      managerEmployeeId: inDivision(current.managerEmployeeId) ? current.managerEmployeeId : '',
      memberIds: current.memberIds.filter(inDivision),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const local = [
      !form.name.trim() ? { field: 'name', message: 'Enter a project name.' } : null,
      !form.divisionId ? { field: 'divisionId', message: 'Choose a division.' } : null,
      !form.managerEmployeeId ? { field: 'managerEmployeeId', message: 'Choose a project manager.' } : null,
    ].filter(Boolean) as { field: string; message: string }[];
    setErrors(local);
    setFailure(null);
    if (local.length) return;
    setSaving(true);
    const result = await mockTeamLeadService.saveProject(user?.userId ?? '', form, initial?.id);
    setSaving(false);
    if (result.status === 'success') {
      onSaved(result.data);
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(result.fieldErrors.map((error) => ({ field: error.field, message: `${error.message} ${error.guidance}` })));
      return;
    }
    setFailure(failureMessage(result as { message: string; guidance?: string | null }));
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FormErrorSummary errors={errors} />
      {failure && <Alert tone="danger" title="Could not save the project" live>{failure}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" required error={fieldError('name')}>
          <Input name="name" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label="Project code" helperText="Assigned automatically and never changes.">
          <Input name="projectCode" readOnly value={initial?.code ?? 'Assigned when saved (PRJ-0000)'} />
        </Field>
        <Field
          label="Division"
          required
          error={fieldError('divisionId')}
          helperText={initial ? 'A project stays in the division it was created in.' : undefined}
        >
          <Select
            name="divisionId"
            value={form.divisionId}
            disabled={Boolean(initial)}
            options={initial ? [{ value: initial.division.id, label: initial.division.name }] : options.divisions}
            placeholder="Choose a division"
            onChange={(event) => changeDivision(event.target.value)}
          />
        </Field>
        <Field label="Project manager" required error={fieldError('managerEmployeeId')} helperText="Anyone placed in the division.">
          <Select
            name="managerEmployeeId"
            value={form.managerEmployeeId}
            options={people}
            placeholder={people.length ? 'Choose a manager' : 'No one is placed in this division'}
            onChange={(event) => set('managerEmployeeId', event.target.value)}
          />
        </Field>
        <Field label="Client" error={fieldError('client')}>
          <Input value={form.client} onChange={(event) => set('client', event.target.value)} />
        </Field>
        <Field label="Priority" error={fieldError('priority')}>
          <Select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)} options={PRIORITIES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
        </Field>
        {initial && (
          <Field label="Status" error={fieldError('status')}>
            <Select value={form.status ?? initial.status} onChange={(event) => set('status', event.target.value as ProjectStatus)} options={PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABEL[value] }))} />
          </Field>
        )}
        <Field label="Start date" required error={fieldError('startDate')}>
          <Input type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </Field>
        <Field label="End date" error={fieldError('endDate')}>
          <Input type="date" value={form.endDate ?? ''} onChange={(event) => set('endDate', event.target.value || null)} />
        </Field>
        <Field label="Estimate in minutes" helperText="Stored as integer minutes." error={fieldError('estimatedMinutes')}>
          <NumberInput min={0} value={form.estimatedMinutes} onChange={(event) => set('estimatedMinutes', Math.trunc(Number(event.target.value)))} />
        </Field>
        <Field label="Progress percent" error={fieldError('completionPercent')}>
          <NumberInput min={0} max={100} value={form.completionPercent} onChange={(event) => set('completionPercent', Math.trunc(Number(event.target.value)))} />
        </Field>
        {options.canEditBudget ? (
          <Field label={`Budget (${options.currency})`} helperText="Up to two decimal places. Leave empty for no budget." error={fieldError('budgetAmount')}>
            <Input name="budgetAmount" inputMode="decimal" value={form.budgetAmount} onChange={(event) => set('budgetAmount', event.target.value)} />
          </Field>
        ) : (
          <div>
            <p className="text-label text-ink">Budget amount</p>
            <div className="mt-1.5 flex h-10 items-center rounded-md border border-border bg-surface-sunken px-3"><RestrictedValue /></div>
            <p className="mt-1.5 text-caption text-ink-muted">Cost access is required to enter or change a budget.</p>
          </div>
        )}
      </div>
      <fieldset className="rounded-md border border-border p-3">
        <legend className="px-1 text-label text-ink">Project members</legend>
        {fieldError('memberIds') && <p className="mb-2 text-body-sm text-danger">{fieldError('memberIds')}</p>}
        {people.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {people.map((person) => (
              <Checkbox
                key={person.value}
                label={person.label}
                checked={form.memberIds.includes(person.value)}
                onChange={(event) => set('memberIds', event.target.checked ? [...form.memberIds, person.value] : form.memberIds.filter((id) => id !== person.value))}
              />
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-ink-muted">Choose a division to see who is placed there.</p>
        )}
      </fieldset>
      <Field label="Notes" error={fieldError('notes')}>
        <Textarea rows={4} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </Field>
      <StickyActionBar>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save project' : 'Create project'}</Button>
      </StickyActionBar>
    </form>
  );
}

const PROJECT_STATUS_LABEL: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned', active: 'Active', on_hold: 'On hold', completed: 'Completed', closed: 'Closed',
};

export function ProjectList() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const [status, setStatus] = React.useState('all');
  const [priority, setPriority] = React.useState('all');
  const [formOpen, setFormOpen] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const { state } = useAsync(() => mockTeamLeadService.listProjects(user?.userId ?? ''), [user?.userId, version]);
  const optionsState = useProjectFormOptions(user?.userId ?? '');
  if (state.status === 'loading') return <Loading label="projects" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Projects unavailable" description={state.failure.message} /></PageContainer>;
  const options = optionsState.status === 'success' ? optionsState.data : null;
  const filtered = state.data.filter((project) => (status === 'all' || project.status === status) && (priority === 'all' || project.priority === priority));
  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Projects you manage, belong to, or oversee, with protected budget visibility."
        meta={<Scope />}
        actions={options?.canCreate ? <Button variant="primary" iconLeading={<Plus aria-hidden className="size-4" />} onClick={() => setFormOpen(true)}>New project</Button> : undefined}
      />
      <FilterBar className="mt-5" applied={[status !== 'all' ? { key: 'status', label: 'Status', value: PROJECT_STATUS_LABEL[status as ProjectStatus], onRemove: () => setStatus('all') } : null, priority !== 'all' ? { key: 'priority', label: 'Priority', value: priority, onRemove: () => setPriority('all') } : null].filter(Boolean) as never[]} onClearAll={() => { setStatus('all'); setPriority('all'); }} resultSummary={`${filtered.length} projects`}><Select aria-label="Project status" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: 'all', label: 'All statuses' }, ...PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABEL[value] }))]} className="min-w-40" /><Select aria-label="Project priority" value={priority} onChange={(event) => setPriority(event.target.value)} options={[{ value: 'all', label: 'All priorities' }, ...PRIORITIES.map((value) => ({ value, label: value }))]} className="min-w-40" /></FilterBar>
      {filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={state.data.length ? 'No projects match these filters' : 'No projects yet'}
          description={state.data.length ? 'Clear a filter to see more.' : options?.canCreate ? 'Create the first project for your division.' : 'Projects you manage or belong to appear here.'}
        />
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <button key={project.id} type="button" onClick={() => router.push(`/projects/${project.id}`)} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><Card className="h-full transition-colors hover:border-highlight-hover hover:bg-surface-sunken"><div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{project.name}</h2><p className="text-caption text-ink-muted">{project.code} · {project.division.code}</p></div><Badge tone={project.status === 'active' ? 'accent' : project.status === 'completed' ? 'success' : 'neutral'}>{PROJECT_STATUS_LABEL[project.status]}</Badge></div><div className="mt-4"><ProgressBar value={project.completionPercent} label="Progress" valueText={`${project.completionPercent}%`} /></div><dl className="mt-4 grid grid-cols-2 gap-3"><div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="font-semibold text-ink"><Duration value={project.estimated} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="font-semibold text-ink"><Duration value={project.actual} /></dd></div><div><dt className="text-caption text-ink-muted">Priority</dt><dd className="capitalize text-ink">{project.priority}</dd></div><div><dt className="text-caption text-ink-muted">Budget</dt><dd>{project.budgetRestricted ? <RestrictedValue /> : project.budgetLabel ?? 'Not recorded'}</dd></div></dl></Card></button>)}</div>
      )}
      {options && (
        <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Create project" description="Create within your division scope. The project code is assigned when you save." size="lg">
          <ProjectForm options={options} onCancel={() => setFormOpen(false)} onSaved={(project) => { setFormOpen(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Project created', description: `${project.name} · ${project.code}` }); }} />
        </Dialog>
      )}
    </PageContainer>
  );
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState('overview');
  const [editing, setEditing] = React.useState(false);
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const projectState = useAsync(() => mockTeamLeadService.getProject(user?.userId ?? '', projectId), [user?.userId, projectId, version]).state;
  const taskState = useAsync(() => mockTeamLeadService.listTasks(user?.userId ?? ''), [user?.userId, version]).state;
  const optionsState = useProjectFormOptions(user?.userId ?? '');
  if (projectState.status === 'loading') return <Loading label="project" />;
  if (projectState.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Project not found" description="It may be outside your assigned scope." /></PageContainer>;
  const project = projectState.data;
  const options = optionsState.status === 'success' ? optionsState.data : null;
  const tasks = taskState.status === 'success' ? taskState.data.filter((task) => task.projectId === projectId) : [];
  const tabs = ['overview', 'team', 'tasks', 'time', 'files', 'activity'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), badgeCount: key === 'tasks' ? tasks.length : key === 'team' ? project.members.length : undefined }));
  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        description={`${project.code} · ${project.division.name}`}
        crumbs={[{ label: 'Projects', href: '/projects' }, { label: project.name }]}
        backHref="/projects"
        backLabel="Projects"
        meta={<><Scope /><Badge tone="accent">{PROJECT_STATUS_LABEL[project.status]}</Badge></>}
        actions={project.canManage && options ? <Button variant="secondary" onClick={() => setEditing(true)}>Edit project</Button> : undefined}
      />
      <Tabs items={tabs} activeKey={tab} onChange={setTab} label="Project sections" className="mt-5" />
      <TabPanel tabKey="overview" activeKey={tab} className="mt-5"><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader title="Delivery overview" /><ProgressBar className="mt-4" value={project.completionPercent} label="Progress" valueText={`${project.completionPercent}%`} /><dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="text-metric text-ink"><Duration value={project.estimated} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="text-metric text-ink"><Duration value={project.actual} /></dd></div><div><dt className="text-caption text-ink-muted">Priority</dt><dd className="capitalize text-ink">{project.priority}</dd></div><div><dt className="text-caption text-ink-muted">Budget</dt><dd>{project.budgetRestricted ? <RestrictedValue /> : project.budgetLabel ?? 'Not recorded'}</dd></div></dl></Card><Card><CardHeader title="Project context" /><dl className="mt-4 space-y-3 text-body-sm"><div><dt className="text-ink-muted">Manager</dt><dd className="font-medium text-ink">{project.manager.fullName}</dd></div><div><dt className="text-ink-muted">Client</dt><dd className="text-ink">{project.client ?? 'Not recorded'}</dd></div><div><dt className="text-ink-muted">Dates</dt><dd className="text-ink">{project.startDateLabel} – {project.endDateLabel ?? 'Open-ended'}</dd></div><div><dt className="text-ink-muted">Notes</dt><dd className="text-ink">{project.notes ?? 'No project notes.'}</dd></div></dl></Card></div></TabPanel>
      <TabPanel tabKey="team" activeKey={tab} className="mt-5">
        <Card>
          <CardHeader title="Project team" description={`Managed by ${project.manager.fullName}. ${project.members.length} member${project.members.length === 1 ? '' : 's'}.`} />
          {project.members.length ? (
            <ul className="mt-4 divide-y divide-border">
              {project.members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                  <span className="font-medium text-ink">{member.fullName}</span>
                  <span className="text-ink-muted">{member.employeeCode}{member.designation ? ` · ${member.designation}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-body-sm text-ink-muted">No members yet.{project.canManage ? ' Add them from Edit project.' : ''}</p>
          )}
        </Card>
      </TabPanel>
      <TabPanel tabKey="tasks" activeKey={tab} className="mt-5">
        {project.canManage && project.canAddTasks && options && (
          <div className="mb-4 flex justify-end"><Button variant="primary" iconLeading={<Plus aria-hidden className="size-4" />} onClick={() => setCreatingTask(true)}>New task</Button></div>
        )}
        {tasks.length ? (
          <div className="grid gap-3 md:grid-cols-2">{tasks.map((task) => <a href={`/tasks/${task.id}`} key={task.id}><Card className="h-full hover:border-highlight-hover"><CardHeader title={task.title} description={`${task.assignee?.fullName ?? 'Unassigned'} · ${TASK_STATUS_LABEL[task.status]}`} /><p className="mt-3 text-caption text-ink-muted">Actual <Duration value={task.actual} /> · Estimate <Duration value={task.estimated} /></p></Card></a>)}</div>
        ) : (
          <EmptyState
            title="No tasks yet"
            description={project.canAddTasks ? 'Create the first task for this project.' : project.canManage ? 'New tasks require an active project that accepts work.' : 'Tasks you can see in this project appear here.'}
          />
        )}
      </TabPanel>
      <TabPanel tabKey="time" activeKey={tab} className="mt-5"><Card><CardHeader title="Project time" description="Actual time is derived from saved work logs." /><p className="mt-4 text-metric text-ink"><Duration value={project.actual} /></p></Card></TabPanel>
      <TabPanel tabKey="files" activeKey={tab} className="mt-5">
        <Card>
          <CardHeader title="Files" />
          <EmptyState title="Project files are not available yet" description="Protected file storage is part of the document module (Backend Phase 7). Until it ships, share files through your approved document store and link them in the project notes." />
        </Card>
      </TabPanel>
      <TabPanel tabKey="activity" activeKey={tab} className="mt-5">
        <Card>
          <CardHeader title="Activity" description="Recorded changes to this project, newest first." />
          {project.activity.length ? (
            <ul className="mt-3 space-y-3 text-body-sm">
              {project.activity.map((item) => (
                <li key={item.id}><span className="font-medium text-ink">{item.label}</span> <span className="text-ink-muted">· {item.actorName} · {item.atLabel}</span></li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-body-sm text-ink-muted">No recorded changes yet.</p>
          )}
        </Card>
      </TabPanel>
      {options && (
        <Dialog open={editing} onClose={() => setEditing(false)} title="Edit project" description={project.name} size="lg">
          <ProjectForm initial={project} options={options} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Project updated', description: saved.name }); }} />
        </Dialog>
      )}
      <Dialog open={creatingTask && project.canAddTasks} onClose={() => setCreatingTask(false)} title="Create task" description={`In ${project.name}`} size="lg">
        <TaskForm defaultProjectId={project.id} onCancel={() => setCreatingTask(false)} onSaved={(task) => { setCreatingTask(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Task created', description: task.title }); }} />
      </Dialog>
    </PageContainer>
  );
}

function TaskForm({
  initial,
  defaultProjectId,
  onCancel,
  onSaved,
}: {
  initial?: TeamTaskView;
  defaultProjectId?: string;
  onCancel: () => void;
  onSaved: (task: TeamTaskView) => void;
}) {
  const { user } = useSession();
  const projectsState = useAsync(() => mockTeamLeadService.listProjects(user?.userId ?? ''), [user?.userId]).state;
  const optionsState = useProjectFormOptions(user?.userId ?? '');
  const [form, setForm] = React.useState<TaskFormInput>(() => initial
    ? { title: initial.title, projectId: initial.projectId, assigneeEmployeeId: initial.assignee?.id ?? '', supportingMemberIds: initial.supportingMembers.map((item) => item.id), startDate: initial.startDate, dueDate: initial.dueDate, priority: initial.priority, estimatedMinutes: initial.estimated.minutes, description: initial.description ?? '', checklist: initial.checklist.map((item) => item.label) }
    : { title: '', projectId: defaultProjectId ?? '', assigneeEmployeeId: '', supportingMemberIds: [], startDate: businessToday(), dueDate: null, priority: 'medium', estimatedMinutes: 0, description: '', checklist: [] });
  const [checklistText, setChecklistText] = React.useState(form.checklist.join('\n'));
  const [errors, setErrors] = React.useState<FieldErrors>([]);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof TaskFormInput>(key: K, value: TaskFormInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const fieldError = (field: string) => errors.find((item) => item.field === field)?.message;

  const projects = projectsState.status === 'success'
    ? projectsState.data.filter((project) => (project.canManage && project.canAddTasks) || project.id === initial?.projectId)
    : [];
  const project = projects.find((item) => item.id === form.projectId);
  const people = optionsState.status === 'success' && project
    ? optionsState.data.people
      .filter((person) => person.divisionIds.includes(project.division.id))
      .map((person) => ({ ...person, label: person.value === user?.employeeId ? `${person.label} (me)` : person.label }))
    : [];
  const selfEmployeeId = user?.employeeId ?? '';
  const isSelfAssigned = Boolean(selfEmployeeId && form.assigneeEmployeeId === selfEmployeeId);

  function changeProject(projectId: string) {
    const next = projects.find((item) => item.id === projectId);
    const inDivision = (id: string) => optionsState.status === 'success' && Boolean(next) &&
      optionsState.data.people.some((person) => person.value === id && person.divisionIds.includes(next!.division.id));
    setForm((current) => ({
      ...current,
      projectId,
      assigneeEmployeeId: inDivision(current.assigneeEmployeeId) ? current.assigneeEmployeeId : '',
      supportingMemberIds: current.supportingMemberIds.filter(inDivision),
    }));
  }

  function setAssignee(assigneeEmployeeId: string) {
    setForm((current) => ({
      ...current,
      assigneeEmployeeId,
      supportingMemberIds: assigneeEmployeeId === selfEmployeeId
        ? []
        : current.supportingMemberIds.filter((id) => id !== assigneeEmployeeId),
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const local = [
      !form.title.trim() ? { field: 'title', message: 'Enter a task title.' } : null,
      !form.projectId ? { field: 'projectId', message: 'Choose a project.' } : null,
      !form.assigneeEmployeeId ? { field: 'assigneeEmployeeId', message: 'Choose an assignee.' } : null,
      form.startDate && form.dueDate && form.dueDate < form.startDate ? { field: 'dueDate', message: 'The due date cannot be before the start date.' } : null,
    ].filter(Boolean) as { field: string; message: string }[];
    setErrors(local);
    setFailure(null);
    if (local.length) return;
    setSaving(true);
    const result = await mockTeamLeadService.saveTask(
      user?.userId ?? '',
      {
        ...form,
        supportingMemberIds: isSelfAssigned ? [] : form.supportingMemberIds,
        checklist: checklistText.split('\n').map((item) => item.trim()).filter(Boolean),
      },
      initial?.id,
    );
    setSaving(false);
    if (result.status === 'success') {
      onSaved(result.data);
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(result.fieldErrors.map((error) => ({ field: error.field, message: `${error.message} ${error.guidance}` })));
      return;
    }
    setFailure(failureMessage(result as { message: string; guidance?: string | null }));
  }

  const loading = projectsState.status === 'loading' || optionsState.status === 'loading';
  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <FormErrorSummary errors={errors} />
      {failure && <Alert tone="danger" title="Could not save the task" live>{failure}</Alert>}
      {!loading && !projects.length && (
        <Alert tone="info" title="No project to add tasks to">You can add tasks only to active projects that accept work and that you manage. Ask a Team Lead or HR to activate or assign one.</Alert>
      )}
      <Field label="Task title" required error={fieldError('title')}>
        <Input name="title" value={form.title} onChange={(event) => set('title', event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" required error={fieldError('projectId')} helperText={initial ? 'A task stays in its project.' : undefined}>
          <Select
            name="projectId"
            value={form.projectId}
            disabled={Boolean(initial)}
            options={projects.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))}
            placeholder={loading ? 'Loading projects' : 'Choose a project'}
            onChange={(event) => changeProject(event.target.value)}
          />
        </Field>
        <Field
          label="Assignee"
          required
          error={fieldError('assigneeEmployeeId')}
          helperText={isSelfAssigned ? 'Only you can complete and record work against this task.' : 'Anyone placed in the project\'s division.'}
        >
          <Select
            name="assigneeEmployeeId"
            value={form.assigneeEmployeeId}
            onChange={(event) => setAssignee(event.target.value)}
            options={people}
            placeholder={project ? 'Choose an assignee' : 'Choose a project first'}
          />
        </Field>
        <Field label="Start date" error={fieldError('startDate')}><Input type="date" value={form.startDate ?? ''} onChange={(event) => set('startDate', event.target.value || null)} /></Field>
        <Field label="Due date" error={fieldError('dueDate')}><Input type="date" value={form.dueDate ?? ''} onChange={(event) => set('dueDate', event.target.value || null)} /></Field>
        <Field label="Priority"><Select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)} options={PRIORITIES.map((value) => ({ value, label: value }))} /></Field>
        <Field label="Estimate in minutes" error={fieldError('estimatedMinutes')}><NumberInput min={0} value={form.estimatedMinutes} onChange={(event) => set('estimatedMinutes', Math.trunc(Number(event.target.value)))} /></Field>
      </div>
      <fieldset className="rounded-md border border-border p-3" disabled={isSelfAssigned}>
        <legend className="px-1 text-label text-ink">Supporting members</legend>
        {fieldError('supportingMemberIds') && <p className="mb-2 text-body-sm text-danger">{fieldError('supportingMemberIds')}</p>}
        {isSelfAssigned ? (
          <p className="text-caption text-ink-muted">Unavailable because this is a personal task.</p>
        ) : people.filter((person) => person.value !== form.assigneeEmployeeId).length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {people.filter((person) => person.value !== form.assigneeEmployeeId).map((person) => (
              <Checkbox
                key={person.value}
                label={person.label}
                checked={form.supportingMemberIds.includes(person.value)}
                onChange={(event) => set('supportingMemberIds', event.target.checked ? [...form.supportingMemberIds, person.value] : form.supportingMemberIds.filter((id) => id !== person.value))}
              />
            ))}
          </div>
        ) : (
          <p className="text-caption text-ink-muted">{project ? 'No one else is placed in this division.' : 'Choose a project first.'}</p>
        )}
      </fieldset>
      <Field label="Description"><Textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
      <Field label="Checklist" helperText="One item per line."><Textarea rows={4} value={checklistText} onChange={(event) => setChecklistText(event.target.value)} /></Field>
      <StickyActionBar>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save task' : 'Create task'}</Button>
      </StickyActionBar>
    </form>
  );
}

export function TeamTaskBoard() {
  const { user } = useSession();
  const toast = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const { state, reload } = useAsync(
    () => mockTeamLeadService.listTasks(user?.userId ?? ''),
    [user?.userId, version],
    { keepPrevious: true },
  );

  if (state.status === 'loading') return <Loading label="tasks" />;
  if (state.status !== 'success') {
    return <PageContainer><EmptyState variant="error" title="Tasks unavailable" /></PageContainer>;
  }

  const boardTasks = state.data.map((task) => teamBoardTask(task, user?.employeeId ?? ''));
  return (
    <PageContainer>
      <PageHeader
        title="Tasks"
        description="Manage team work and create your own tasks through Pending, In Progress, and Completed."
        meta={<Scope />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              iconLeading={<Plus aria-hidden className="size-4" />}
              onClick={() => setFormOpen(true)}
            >
              New task
            </Button>
          </div>
        }
      />
      <TaskReviewQueue onDecided={() => setVersion((value) => value + 1)} />
      <TaskWorkflowBoard
        tasks={boardTasks}
        actorRole="team_lead"
        onMoved={reload}
      />
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Create task"
        description="Assign the task to yourself or an employee within your project scope."
        size="lg"
      >
        <TaskForm
          onCancel={() => setFormOpen(false)}
          onSaved={(task) => {
            setFormOpen(false);
            setVersion((value) => value + 1);
            toast.show({ tone: 'success', title: 'Task created', description: task.title });
          }}
        />
      </Dialog>
    </PageContainer>
  );
}

export function TeamTaskDetail({ taskId }: { taskId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const { state, reload } = useAsync(
    () => mockTeamLeadService.getTask(user?.userId ?? '', taskId),
    [user?.userId, taskId, version],
    { keepPrevious: true },
  );
  if (state.status === 'loading') return <Loading label="task" />;
  if (state.status !== 'success') {
    return <PageContainer><EmptyState variant="no-results" title="Task not found" /></PageContainer>;
  }
  const task = state.data;
  const workflowTask = teamBoardTask(task, user?.employeeId ?? '');
  return (
    <PageContainer>
      <PageHeader
        title={task.title}
        description={task.projectLabel}
        crumbs={[{ label: 'Tasks', href: '/tasks' }, { label: task.title }]}
        backHref="/tasks"
        backLabel="Tasks"
        meta={
          <>
            <Scope />
            {task.isOverdue && <Badge tone="danger">Overdue</Badge>}
            <Badge tone="accent">{TASK_STATUS_LABEL[task.status]}</Badge>
          </>
        }
        actions={<Button variant="secondary" onClick={() => setEditing(true)}>Edit task</Button>}
      />
      {/* `FE-1124`: renders nothing for an ordinary task. */}
      <TaskSourceMinute taskId={taskId} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Task overview" />
            <p className="mt-3 text-body-sm text-ink-muted">{task.description ?? 'No description.'}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div><dt className="text-caption text-ink-muted">Assignee</dt><dd className="font-medium text-ink">{task.assignee?.fullName ?? 'Unassigned'}</dd></div>
              <div><dt className="text-caption text-ink-muted">Due</dt><dd className={cn('font-medium', task.isOverdue ? 'text-danger' : 'text-ink')}>{task.dueDateLabel ?? 'Not recorded'}</dd></div>
              <div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="font-medium text-ink"><Duration value={task.estimated} /></dd></div>
              <div><dt className="text-caption text-ink-muted">Actual</dt><dd className="font-medium text-ink"><Duration value={task.actual} /></dd></div>
              <div><dt className="text-caption text-ink-muted">Variance</dt><dd className={cn('font-medium', task.variance.minutes > 0 ? 'text-warning' : 'text-ink')}>{task.variance.label}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Checklist" description={`${task.checklist.filter((item) => item.isDone).length} of ${task.checklist.length} complete`} />
            {task.checklist.length ? (
              <ul className="mt-3 space-y-2">
                {task.checklist.map((item) => <li key={item.id} className="flex items-center gap-2 text-body-sm text-ink"><span aria-hidden className={cn('size-2 rounded-full', item.isDone ? 'bg-complete' : 'bg-border-strong')} />{item.label}</li>)}
              </ul>
            ) : <p className="mt-3 text-body-sm text-ink-muted">No checklist items.</p>}
          </Card>
          <Card>
            <CardHeader title="Task history" description="Transitions and work records are separate and shown in chronological order." />
            <TaskHistoryTimeline taskId={task.id} />
          </Card>
          <Card>
            <CardHeader title="Comments" description="Task comments are planned for the collaboration phase." />
            <div className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-sunken p-4 text-body-sm text-ink-muted">Comments placeholder — use a general remark for current review needs.</div>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Change status" description="Every move is confirmed and creates no active time." />
            <TaskDetailTransitions task={workflowTask} actorRole="team_lead" onMoved={reload} />
          </Card>
          <Card>
            <CardHeader title="Supporting members" />
            {task.supportingMembers.length ? <div className="mt-3 flex flex-wrap gap-2">{task.supportingMembers.map((member) => <Badge key={member.id} tone="neutral">{member.fullName}</Badge>)}</div> : <p className="mt-3 text-body-sm text-ink-muted">None assigned.</p>}
          </Card>
        </aside>
      </div>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit task" description={task.title} size="lg">
        <TaskForm
          initial={task}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setVersion((value) => value + 1);
            toast.show({ tone: 'success', title: 'Task updated', description: saved.title });
          }}
        />
      </Dialog>
    </PageContainer>
  );
}

function teamBoardTask(task: TeamTaskView, viewerEmployeeId: string): WorkflowBoardTask {
  const [projectCode, ...projectNameParts] = task.projectLabel.split(' · ');
  const canLogWorkWhenInProgress =
    !task.review.blocksTimeEntry &&
    (task.assignee?.id === viewerEmployeeId ||
      task.supportingMembers.some((member) => member.id === viewerEmployeeId));
  return {
    id: task.id,
    title: task.title,
    href: `/tasks/${task.id}`,
    project: {
      code: projectCode || task.projectId,
      name: projectNameParts.join(' · ') || task.projectLabel,
    },
    division: { name: task.division.name, code: task.division.code },
    assignee: task.assignee ? { id: task.assignee.id, fullName: task.assignee.fullName } : null,
    status: task.status,
    estimated: task.estimated,
    actual: task.actual,
    variance: task.variance,
    dueDate: task.dueDate,
    dueDateLabel: task.dueDateLabel,
    isOverdue: task.isOverdue,
    reviewBlockedReason: task.review.blocksTimeEntry ? task.review.detail : null,
    canLogWorkWhenInProgress,
  };
}
