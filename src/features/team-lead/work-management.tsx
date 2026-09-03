'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, List, Plus, Users } from 'lucide-react';
import type { ProjectFormInput, TaskFormInput, TeamProjectView, TeamTaskView } from '@/contracts/team-lead';
import type { Priority, TaskStatus } from '@/contracts/domain';
import { mockTeamLeadService } from '@/services/mock/team-lead';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Duration, RestrictedValue } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs, TabPanel } from '@/components/feedback/disclosure';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, FileUpload, Input, NumberInput, Select, Textarea } from '@/components/forms/inputs';
import { FilterBar } from '@/components/data/filters';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { cn } from '@/lib/cn';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'closed'] as const;
const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;

function Loading({ label }: { label: string }) {
  return <PageContainer><div role="status" aria-busy><span className="sr-only">Loading {label}</span><Skeleton height="2rem" width="18rem" /><Skeleton height="18rem" rounded="md" className="mt-5" /></div></PageContainer>;
}

function Scope() {
  return <Badge tone="accent" icon={<Users aria-hidden className="size-3.5" />}>Assigned divisions and projects</Badge>;
}

const EMPTY_PROJECT: ProjectFormInput = {
  name: '', code: '', divisionId: 'pia', managerEmployeeId: 'emp-2001', memberIds: [], stakeholder: '',
  startDate: '2026-09-02', endDate: null, priority: 'medium', estimatedMinutes: 0, budgetAmount: '', completionPercent: 0, notes: '',
};

function ProjectForm({ initial, onCancel, onSaved }: { initial?: TeamProjectView; onCancel: () => void; onSaved: (project: TeamProjectView) => void }) {
  const { user } = useSession();
  const [form, setForm] = React.useState<ProjectFormInput>(() => initial ? {
    name: initial.name, code: initial.code, divisionId: initial.division.id, managerEmployeeId: initial.manager.id,
    memberIds: [], stakeholder: initial.stakeholder ?? '', startDate: '2026-01-05', endDate: null,
    priority: initial.priority, estimatedMinutes: initial.estimated.minutes, budgetAmount: '', completionPercent: initial.completionPercent, notes: initial.notes ?? '',
  } : EMPTY_PROJECT);
  const [files, setFiles] = React.useState<readonly { id: string; name: string; size: string }[]>([]);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const set = <K extends keyof ProjectFormInput>(key: K, value: ProjectFormInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = [!form.name.trim() ? { field: 'name', message: 'Enter a project name.' } : null, !form.code.trim() ? { field: 'code', message: 'Enter a project code.' } : null].filter(Boolean) as { field: string; message: string }[];
    setErrors(nextErrors);
    if (nextErrors.length) return;
    const result = await mockTeamLeadService.saveProject(user?.userId ?? '', form, initial?.id);
    if (result.status === 'success') onSaved(result.data);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <FormErrorSummary errors={errors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" required error={errors.find((item) => item.field === 'name')?.message}><Input value={form.name} onChange={(event) => set('name', event.target.value)} /></Field>
        <Field label="Project code" required error={errors.find((item) => item.field === 'code')?.message}><Input value={form.code} onChange={(event) => set('code', event.target.value)} /></Field>
        <Field label="Division" required><Select value={form.divisionId} onChange={(event) => set('divisionId', event.target.value)} options={[{ value: 'pia', label: 'PowerInAI' }, { value: 'pit', label: 'PowerInAI Training' }, { value: 'cjg', label: 'Computer Jagat' }, { value: 'wcf', label: 'WesternCF' }, { value: 'gov', label: 'Government Projects' }]} /></Field>
        <Field label="Project manager" required><Select value={form.managerEmployeeId} onChange={(event) => set('managerEmployeeId', event.target.value)} options={[{ value: 'emp-2001', label: 'Imran Hossain' }, { value: 'emp-2002', label: 'Farhana Islam' }]} /></Field>
        <Field label="Stakeholder"><Input value={form.stakeholder} onChange={(event) => set('stakeholder', event.target.value)} /></Field>
        <Field label="Priority"><Select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)} options={PRIORITIES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></Field>
        <Field label="Start date" required><Input type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} /></Field>
        <Field label="End date"><Input type="date" value={form.endDate ?? ''} onChange={(event) => set('endDate', event.target.value || null)} /></Field>
        <Field label="Estimate in minutes" helperText="Stored as integer minutes."><NumberInput min={0} value={form.estimatedMinutes} onChange={(event) => set('estimatedMinutes', Number(event.target.value))} /></Field>
        <div><p className="text-label text-ink">Budget amount</p><div className="mt-1.5 flex h-10 items-center rounded-md border border-border bg-surface-sunken px-3"><RestrictedValue /></div><p className="mt-1.5 text-caption text-ink-muted">Financial permission is required to enter or change a budget.</p></div>
        <Field label="Progress percent"><NumberInput min={0} max={100} value={form.completionPercent} onChange={(event) => set('completionPercent', Number(event.target.value))} /></Field>
      </div>
      <fieldset className="rounded-md border border-border p-3"><legend className="px-1 text-label text-ink">Project members</legend><div className="grid gap-2 sm:grid-cols-2"><Checkbox label="Nadia Rahman" checked={form.memberIds.includes('emp-1001')} onChange={(event) => set('memberIds', event.target.checked ? [...form.memberIds, 'emp-1001'] : form.memberIds.filter((id) => id !== 'emp-1001'))} /><Checkbox label="Tanvir Ahmed" checked={form.memberIds.includes('emp-1002')} onChange={(event) => set('memberIds', event.target.checked ? [...form.memberIds, 'emp-1002'] : form.memberIds.filter((id) => id !== 'emp-1002'))} /></div></fieldset>
      <Field label="Notes"><Textarea rows={4} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></Field>
      <FileUpload
        label="Attach project files"
        multiple
        files={files}
        onFilesSelected={(selected) =>
          setFiles((current) => [
            ...current,
            ...Array.from(selected).map((file, index) => ({
              id: `${Date.now()}-${index}`,
              name: file.name,
              size: `${Math.ceil(file.size / 1024)} KB`,
            })),
          ])
        }
        onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
        helperText="Files are represented locally in the frontend demo."
      />
      <StickyActionBar><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{initial ? 'Save project' : 'Create project'}</Button></StickyActionBar>
    </form>
  );
}

export function ProjectList() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const [status, setStatus] = React.useState('all');
  const [priority, setPriority] = React.useState('all');
  const [formOpen, setFormOpen] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const { state } = useAsync(() => mockTeamLeadService.listProjects(user?.userId ?? ''), [user?.userId, version]);
  if (state.status === 'loading') return <Loading label="projects" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Projects unavailable" /></PageContainer>;
  const filtered = state.data.filter((project) => (status === 'all' || project.status === status) && (priority === 'all' || project.priority === priority));
  return (
    <PageContainer>
      <PageHeader title="Projects" description="Projects in your assigned division scope, with protected budget visibility." meta={<Scope />} actions={<Button variant="primary" iconLeading={<Plus aria-hidden className="size-4" />} onClick={() => setFormOpen(true)}>New project</Button>} />
      <FilterBar className="mt-5" applied={[status !== 'all' ? { key: 'status', label: 'Status', value: status.replace('_', ' '), onRemove: () => setStatus('all') } : null, priority !== 'all' ? { key: 'priority', label: 'Priority', value: priority, onRemove: () => setPriority('all') } : null].filter(Boolean) as never[]} onClearAll={() => { setStatus('all'); setPriority('all'); }} resultSummary={`${filtered.length} projects`}><Select aria-label="Project status" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: 'all', label: 'All statuses' }, ...PROJECT_STATUSES.map((value) => ({ value, label: value.replace('_', ' ') }))]} className="min-w-40" /><Select aria-label="Project priority" value={priority} onChange={(event) => setPriority(event.target.value)} options={[{ value: 'all', label: 'All priorities' }, ...PRIORITIES.map((value) => ({ value, label: value }))]} className="min-w-40" /></FilterBar>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <button key={project.id} type="button" onClick={() => router.push(`/projects/${project.id}`)} className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><Card className="h-full transition-colors hover:border-highlight-hover hover:bg-surface-sunken"><div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{project.name}</h2><p className="text-caption text-ink-muted">{project.code} · {project.division.code}</p></div><Badge tone={project.status === 'active' ? 'accent' : project.status === 'completed' ? 'success' : 'neutral'}>{project.status.replace('_', ' ')}</Badge></div><div className="mt-4"><ProgressBar value={project.completionPercent} label="Progress" valueText={`${project.completionPercent}%`} /></div><dl className="mt-4 grid grid-cols-2 gap-3"><div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="font-semibold text-ink"><Duration value={project.estimated} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="font-semibold text-ink"><Duration value={project.actual} /></dd></div><div><dt className="text-caption text-ink-muted">Priority</dt><dd className="capitalize text-ink">{project.priority}</dd></div><div><dt className="text-caption text-ink-muted">Budget</dt><dd>{project.budgetRestricted ? <RestrictedValue /> : project.budgetLabel ?? 'Not recorded'}</dd></div></dl></Card></button>)}</div>
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Create project" description="Create within your assigned division scope." size="lg"><ProjectForm onCancel={() => setFormOpen(false)} onSaved={(project) => { setFormOpen(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Project created', description: project.name }); }} /></Dialog>
    </PageContainer>
  );
}

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState('overview');
  const [editing, setEditing] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const projectState = useAsync(() => mockTeamLeadService.getProject(user?.userId ?? '', projectId), [user?.userId, projectId, version]).state;
  const taskState = useAsync(() => mockTeamLeadService.listTasks(user?.userId ?? ''), [user?.userId, version]).state;
  if (projectState.status === 'loading') return <Loading label="project" />;
  if (projectState.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Project not found" description="It may be outside your assigned scope." /></PageContainer>;
  const project = projectState.data;
  const tasks = taskState.status === 'success' ? taskState.data.filter((task) => task.projectId === projectId) : [];
  const tabs = ['overview', 'team', 'tasks', 'time', 'files', 'activity'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), badgeCount: key === 'tasks' ? tasks.length : undefined }));
  return (
    <PageContainer>
      <PageHeader title={project.name} description={`${project.code} · ${project.division.name}`} crumbs={[{ label: 'Projects', href: '/projects' }, { label: project.name }]} backHref="/projects" backLabel="Projects" meta={<><Scope /><Badge tone="accent">{project.status.replace('_', ' ')}</Badge></>} actions={<Button variant="secondary" onClick={() => setEditing(true)}>Edit project</Button>} />
      <Tabs items={tabs} activeKey={tab} onChange={setTab} label="Project sections" className="mt-5" />
      <TabPanel tabKey="overview" activeKey={tab} className="mt-5"><div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader title="Delivery overview" /><ProgressBar className="mt-4" value={project.completionPercent} label="Progress" valueText={`${project.completionPercent}%`} /><dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="text-metric text-ink"><Duration value={project.estimated} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="text-metric text-ink"><Duration value={project.actual} /></dd></div><div><dt className="text-caption text-ink-muted">Priority</dt><dd className="capitalize text-ink">{project.priority}</dd></div><div><dt className="text-caption text-ink-muted">Budget</dt><dd>{project.budgetRestricted ? <RestrictedValue /> : project.budgetLabel ?? 'Not recorded'}</dd></div></dl></Card><Card><CardHeader title="Project context" /><dl className="mt-4 space-y-3 text-body-sm"><div><dt className="text-ink-muted">Manager</dt><dd className="font-medium text-ink">{project.manager.fullName}</dd></div><div><dt className="text-ink-muted">Stakeholder</dt><dd className="text-ink">{project.stakeholder ?? 'Not recorded'}</dd></div><div><dt className="text-ink-muted">Dates</dt><dd className="text-ink">{project.startDateLabel} – {project.endDateLabel ?? 'Open-ended'}</dd></div><div><dt className="text-ink-muted">Notes</dt><dd className="text-ink">{project.notes ?? 'No project notes.'}</dd></div></dl></Card></div></TabPanel>
      <TabPanel tabKey="team" activeKey={tab} className="mt-5"><Card><CardHeader title="Project team" description={`${project.memberCount} assigned member${project.memberCount === 1 ? '' : 's'}.`} /><p className="mt-4 text-body-sm text-ink-muted">Project manager: {project.manager.fullName}. Team membership is maintained through the project form.</p></Card></TabPanel>
      <TabPanel tabKey="tasks" activeKey={tab} className="mt-5"><div className="grid gap-3 md:grid-cols-2">{tasks.map((task) => <a href={`/tasks/${task.id}`} key={task.id}><Card className="h-full hover:border-highlight-hover"><CardHeader title={task.title} description={`${task.assignee.fullName} · ${TASK_STATUS_LABEL[task.status]}`} /><p className="mt-3 text-caption text-ink-muted">Actual <Duration value={task.actual} /> · Estimate <Duration value={task.estimated} /></p></Card></a>)}</div></TabPanel>
      <TabPanel tabKey="time" activeKey={tab} className="mt-5"><Card><CardHeader title="Project time" description="Actual time is derived from linked entries." /><p className="mt-4 text-metric text-ink"><Duration value={project.actual} /></p></Card></TabPanel>
      <TabPanel tabKey="files" activeKey={tab} className="mt-5"><Card><CardHeader title="Files" /><EmptyState title="No shared project files" description="Attach files from Edit project." /></Card></TabPanel>
      <TabPanel tabKey="activity" activeKey={tab} className="mt-5"><Card><CardHeader title="Activity" /><ul className="mt-3 space-y-3 text-body-sm text-ink-muted"><li>Project progress updated to {project.completionPercent}%.</li><li>Actual time recalculated from linked entries.</li><li>Project scope confirmed for {project.division.name}.</li></ul></Card></TabPanel>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit project" description={project.name} size="lg"><ProjectForm initial={project} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Project updated', description: saved.name }); }} /></Dialog>
    </PageContainer>
  );
}

const EMPTY_TASK: TaskFormInput = { title: '', projectId: 'prj-vp2', assigneeEmployeeId: 'emp-1001', supportingMemberIds: [], startDate: '2026-09-02', dueDate: null, priority: 'medium', estimatedMinutes: 0, description: '', checklist: [] };

function TaskForm({ initial, onCancel, onSaved }: { initial?: TeamTaskView; onCancel: () => void; onSaved: (task: TeamTaskView) => void }) {
  const { user } = useSession();
  const [form, setForm] = React.useState<TaskFormInput>(() => initial ? { title: initial.title, projectId: initial.projectId, assigneeEmployeeId: initial.assignee.id, supportingMemberIds: initial.supportingMembers.map((item) => item.id), startDate: null, dueDate: null, priority: initial.priority, estimatedMinutes: initial.estimated.minutes, description: initial.description ?? '', checklist: initial.checklist.map((item) => item.label) } : EMPTY_TASK);
  const [checklistText, setChecklistText] = React.useState(form.checklist.join('\n'));
  const [files, setFiles] = React.useState<readonly { id: string; name: string; size: string }[]>([]);
  const [error, setError] = React.useState('');
  const set = <K extends keyof TaskFormInput>(key: K, value: TaskFormInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!form.title.trim()) { setError('Enter a task title.'); return; } const result = await mockTeamLeadService.saveTask(user?.userId ?? '', { ...form, checklist: checklistText.split('\n').map((item) => item.trim()).filter(Boolean) }, initial?.id); if (result.status === 'success') onSaved(result.data); }
  return <form onSubmit={submit} className="space-y-4"><Field label="Task title" required error={error}><Input value={form.title} onChange={(event) => set('title', event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Project" required><Select value={form.projectId} onChange={(event) => set('projectId', event.target.value)} options={[{ value: 'prj-vp2', label: 'PIA-VP2 · Vision Platform v2' }, { value: 'prj-alb', label: 'PIT-ALB · AI Literacy Bootcamp' }, { value: 'prj-mip', label: 'CJG-MIP · Monthly Issue Production' }]} /></Field><Field label="Assignee" required><Select value={form.assigneeEmployeeId} onChange={(event) => set('assigneeEmployeeId', event.target.value)} options={[{ value: 'emp-1001', label: 'Nadia Rahman' }, { value: 'emp-1002', label: 'Tanvir Ahmed' }, { value: 'emp-1004', label: 'Sumaiya Noor' }]} /></Field><Field label="Start date"><Input type="date" value={form.startDate ?? ''} onChange={(event) => set('startDate', event.target.value || null)} /></Field><Field label="Due date"><Input type="date" value={form.dueDate ?? ''} onChange={(event) => set('dueDate', event.target.value || null)} /></Field><Field label="Priority"><Select value={form.priority} onChange={(event) => set('priority', event.target.value as Priority)} options={PRIORITIES.map((value) => ({ value, label: value }))} /></Field><Field label="Estimate in minutes"><NumberInput min={0} value={form.estimatedMinutes} onChange={(event) => set('estimatedMinutes', Number(event.target.value))} /></Field></div><fieldset className="rounded-md border border-border p-3"><legend className="px-1 text-label text-ink">Supporting members</legend><Checkbox label="Tanvir Ahmed" checked={form.supportingMemberIds.includes('emp-1002')} onChange={(event) => set('supportingMemberIds', event.target.checked ? [...form.supportingMemberIds, 'emp-1002'] : form.supportingMemberIds.filter((id) => id !== 'emp-1002'))} /></fieldset><Field label="Description"><Textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} /></Field><Field label="Checklist" helperText="One item per line."><Textarea rows={4} value={checklistText} onChange={(event) => setChecklistText(event.target.value)} /></Field><FileUpload label="Attach task files" multiple files={files} onFilesSelected={(selected) => setFiles(Array.from(selected).map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, size: `${Math.ceil(file.size / 1024)} KB` })))} onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))} /><StickyActionBar><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{initial ? 'Save task' : 'Create task'}</Button></StickyActionBar></form>;
}

export function TeamTaskBoard() {
  const { user } = useSession(); const toast = useToast(); const [view, setView] = React.useState<'board' | 'list'>('board'); const [formOpen, setFormOpen] = React.useState(false); const [version, setVersion] = React.useState(0);
  const { state } = useAsync(() => mockTeamLeadService.listTasks(user?.userId ?? ''), [user?.userId, version]);
  if (state.status === 'loading') return <Loading label="tasks" />; if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Tasks unavailable" /></PageContainer>;
  const taskCard = (task: TeamTaskView) => <a key={task.id} href={`/tasks/${task.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><Card className="hover:border-highlight-hover"><div className="flex items-start justify-between gap-2"><h3 className="text-body-sm font-semibold text-ink">{task.title}</h3>{task.isOverdue && <Badge tone="danger">Overdue</Badge>}</div><p className="mt-1 text-caption text-ink-muted">{task.projectLabel}</p><div className="mt-3 flex items-center justify-between gap-2"><Badge tone="neutral">{task.assignee.fullName}</Badge><span className="text-caption text-ink-muted"><Duration value={task.actual} /> / <Duration value={task.estimated} /></span></div></Card></a>;
  return <PageContainer><PageHeader title="Tasks" description="Manage work using the three approved task states." meta={<Scope />} actions={<><Button variant="secondary" iconLeading={view === 'board' ? <List aria-hidden className="size-4" /> : <LayoutGrid aria-hidden className="size-4" />} onClick={() => setView(view === 'board' ? 'list' : 'board')}>{view === 'board' ? 'List view' : 'Board view'}</Button><Button variant="primary" iconLeading={<Plus aria-hidden className="size-4" />} onClick={() => setFormOpen(true)}>New task</Button></>} />{view === 'board' ? <div className="mt-5 grid gap-4 lg:grid-cols-3">{TASK_STATUSES.map((status) => <section key={status} aria-labelledby={`column-${status}`} className="rounded-lg bg-surface-sunken p-3"><div className="mb-3 flex items-center justify-between"><h2 id={`column-${status}`} className="text-h3 text-ink">{TASK_STATUS_LABEL[status]}</h2><Badge tone="neutral">{state.data.filter((task) => task.status === status).length}</Badge></div><div className="space-y-3">{state.data.filter((task) => task.status === status).map(taskCard)}</div></section>)}</div> : <div className="mt-5 space-y-3">{state.data.map(taskCard)}</div>}<Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Create task" description="Assign work within your project scope." size="lg"><TaskForm onCancel={() => setFormOpen(false)} onSaved={(task) => { setFormOpen(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Task created', description: task.title }); }} /></Dialog></PageContainer>;
}

export function TeamTaskDetail({ taskId }: { taskId: string }) {
  const { user } = useSession(); const toast = useToast(); const [editing, setEditing] = React.useState(false); const [version, setVersion] = React.useState(0);
  const { state } = useAsync(() => mockTeamLeadService.getTask(user?.userId ?? '', taskId), [user?.userId, taskId, version]);
  if (state.status === 'loading') return <Loading label="task" />; if (state.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Task not found" /></PageContainer>; const task = state.data;
  async function changeStatus(status: TaskStatus) { const result = await mockTeamLeadService.setTaskStatus(user?.userId ?? '', task.id, status); if (result.status === 'success') { setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Task status updated', description: `${task.title} is now ${TASK_STATUS_LABEL[status]}.` }); } }
  return <PageContainer><PageHeader title={task.title} description={task.projectLabel} crumbs={[{ label: 'Tasks', href: '/tasks' }, { label: task.title }]} backHref="/tasks" backLabel="Tasks" meta={<><Scope />{task.isOverdue && <Badge tone="danger">Overdue</Badge>}<Badge tone="accent">{TASK_STATUS_LABEL[task.status]}</Badge></>} actions={<Button variant="secondary" onClick={() => setEditing(true)}>Edit task</Button>} /><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-5"><Card><CardHeader title="Task overview" /><p className="mt-3 text-body-sm text-ink-muted">{task.description ?? 'No description.'}</p><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><dt className="text-caption text-ink-muted">Assignee</dt><dd className="font-medium text-ink">{task.assignee.fullName}</dd></div><div><dt className="text-caption text-ink-muted">Due</dt><dd className={cn('font-medium', task.isOverdue ? 'text-danger' : 'text-ink')}>{task.dueDateLabel ?? 'Not recorded'}</dd></div><div><dt className="text-caption text-ink-muted">Estimate</dt><dd className="font-medium text-ink"><Duration value={task.estimated} /></dd></div><div><dt className="text-caption text-ink-muted">Actual</dt><dd className="font-medium text-ink"><Duration value={task.actual} /></dd></div></dl></Card><Card><CardHeader title="Checklist" description={`${task.checklist.filter((item) => item.isDone).length} of ${task.checklist.length} complete`} />{task.checklist.length ? <ul className="mt-3 space-y-2">{task.checklist.map((item) => <li key={item.id} className="flex items-center gap-2 text-body-sm text-ink"><span aria-hidden className={cn('size-2 rounded-full', item.isDone ? 'bg-complete' : 'bg-border-strong')} />{item.label}</li>)}</ul> : <p className="mt-3 text-body-sm text-ink-muted">No checklist items.</p>}</Card><Card><CardHeader title="Actual-time work history" description="Derived from time entries linked to this task." />{task.workHistory.length ? <ul className="mt-3 divide-y divide-border">{task.workHistory.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 py-3"><div><p className="font-medium text-ink">{entry.dateLabel}</p><p className="mt-1 text-caption text-ink-muted">{entry.completedWork}</p></div><Duration value={entry.duration} emphasis /></li>)}</ul> : <EmptyState title="No linked time" description="Actual time will appear after an employee records work against this task." />}</Card><Card><CardHeader title="Comments" description="Task comments are planned for the collaboration phase." /><div className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-sunken p-4 text-body-sm text-ink-muted">Comments placeholder — use a general remark for current review needs.</div></Card></div><aside className="space-y-5"><Card><CardHeader title="Change status" description="Only Pending, In Progress, and Completed are valid." /><div className="mt-3 space-y-2">{TASK_STATUSES.map((status) => <Button key={status} variant={task.status === status ? 'primary' : 'secondary'} className="w-full" disabled={task.status === status} onClick={() => changeStatus(status)}>{TASK_STATUS_LABEL[status]}</Button>)}</div></Card><Card><CardHeader title="Supporting members" />{task.supportingMembers.length ? <div className="mt-3 flex flex-wrap gap-2">{task.supportingMembers.map((member) => <Badge key={member.id} tone="neutral">{member.fullName}</Badge>)}</div> : <p className="mt-3 text-body-sm text-ink-muted">None assigned.</p>}</Card></aside></div><Dialog open={editing} onClose={() => setEditing(false)} title="Edit task" description={task.title} size="lg"><TaskForm initial={task} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); setVersion((value) => value + 1); toast.show({ tone: 'success', title: 'Task updated', description: saved.title }); }} /></Dialog></PageContainer>;
}
