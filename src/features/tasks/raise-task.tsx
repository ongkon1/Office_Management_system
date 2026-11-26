'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import type { EmployeeTaskFormInput } from '@/contracts/task-review';
import type { Priority } from '@/contracts/domain';
import { taskReviewService as mockTaskReviewService } from '@/services/runtime/task-review';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { TaskCategoryField } from './task-category-field';
import { TaskBillingField } from './task-billing-field';

const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high', 'urgent'];

const EMPTY: EmployeeTaskFormInput = {
  title: '',
  projectId: '',
  priority: 'medium',
  dueDate: '',
  estimatedMinutes: '',
  description: '',
};

interface FormError {
  readonly field: string;
  readonly message: string;
}

/**
 * `FE-0781` — an employee or Team Lead creating a task for themselves.
 *
 * The form names the reviewer before anything is typed. "Your Team Lead will
 * review this" is the single most important thing about this screen: a person
 * who does not know their task needs endorsement will raise one, try to record
 * time against it, and read the refusal as a bug.
 */
export function RaiseTaskButton({ onCreated }: { onCreated: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<EmployeeTaskFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly FormError[]>([]);
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submittingRef = React.useRef(false);
  const requestKeyRef = React.useRef('');

  const { state } = useAsync(
    () => mockTaskReviewService.options(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status !== 'success' || !state.data.canCreate) {
    // Nothing is rendered rather than a disabled button: a control that can
    // never be used is noise, and the list screen explains the reason instead.
    return null;
  }

  const options = state.data;

  function set<K extends keyof EmployeeTaskFormInput>(
    key: K,
    value: EmployeeTaskFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // State updates are intentionally not the only guard: two submit events
    // can arrive before React paints the loading state. The ref closes that
    // small window synchronously.
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (!requestKeyRef.current) requestKeyRef.current = crypto.randomUUID();
    setErrors([]);
    setBlocked(null);
    setBusy(true);

    const result = await mockTaskReviewService.create(user?.userId ?? '', form, {
      idempotencyKey: requestKeyRef.current,
    });

    if (result.status === 'success') {
      submittingRef.current = false;
      requestKeyRef.current = '';
      setBusy(false);
      setOpen(false);
      setForm(EMPTY);
      onCreated();
      toast.show({
        tone: 'success',
        title: options.requiresReview ? 'Task raised' : 'Task created',
        description: options.requiresReview
          ? `${options.reviewerName ?? 'Your Team Lead'} reviews it before you can record time against it.`
          : 'This task needs no approval. Move it to In Progress when you begin work.',
      });
      return;
    }

    if (result.status === 'validation_failure') {
      submittingRef.current = false;
      requestKeyRef.current = '';
      setBusy(false);
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
      return;
    }

    submittingRef.current = false;
    // Keep the key after a retryable dependency failure: the server may have
    // committed the first request even if its response was interrupted.
    if (result.status !== 'error' || !result.retryable) requestKeyRef.current = '';
    setBusy(false);
    setBlocked(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  const errorFor = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          requestKeyRef.current = crypto.randomUUID();
          setOpen(true);
        }}
        iconLeading={<Plus aria-hidden className="size-4" />}
      >
        {options.requiresReview ? 'Raise a task' : 'Create my task'}
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          if (busy) return;
          requestKeyRef.current = '';
          setOpen(false);
        }}
        title={options.requiresReview ? 'Raise a task' : 'Create my task'}
        description={
          options.requiresReview
            ? 'Propose work for yourself. Your Team Lead reviews it before it can receive time.'
            : 'Create work for yourself. No approval is required.'
        }
        size="lg"
      >
        {/*
          `noValidate`: the browser's required-field bubble pre-empts the
          service, and the service carries the corrective guidance
          `REQ-TIME-025` requires.
        */}
        <form onSubmit={submit} noValidate className="space-y-4">
          {options.requiresReview && options.reviewerName && (
            <Callout tone="info">
              {options.reviewerName} will review this. You can record time against it once
              it is approved.
            </Callout>
          )}

          {errors.length > 0 && (
            <FormErrorSummary title="This task could not be raised" errors={errors} />
          )}

          {blocked && <Callout tone="warning">{blocked}</Callout>}

          <Field label="Task title" required error={errorFor('title')}>
            <Input
              name="title"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <TaskCategoryField value={form.categoryId} onChange={id => set('categoryId', id)} error={errorFor('categoryId')} />
            <TaskBillingField value={form.billingType} onChange={value => set('billingType', value)} error={errorFor('billingType')} />
            <Field label="Project" required error={errorFor('projectId')}>
              <Select
                name="projectId"
                value={form.projectId}
                placeholder="Select a project"
                onChange={(event) => set('projectId', event.target.value)}
                options={options.projects}
              />
            </Field>

            <Field label="Priority">
              <Select
                name="priority"
                value={form.priority}
                onChange={(event) => set('priority', event.target.value as Priority)}
                options={PRIORITIES.map((value) => ({
                  value,
                  label: value[0].toUpperCase() + value.slice(1),
                }))}
              />
            </Field>

            <Field
              label="Due date"
              helperText="Optional. Today or later."
              error={errorFor('dueDate')}
            >
              <Input
                type="date"
                name="dueDate"
                min={options.maxDueDateHint}
                value={form.dueDate}
                onChange={(event) => set('dueDate', event.target.value)}
              />
            </Field>

            <Field
              label="Estimate in minutes"
              required
              helperText="Enter whole minutes. After submission, the estimate is shown as hours and minutes."
              error={errorFor('estimatedMinutes')}
            >
              <Input
                type="number"
                name="estimatedMinutes"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.estimatedMinutes}
                onChange={(event) => set('estimatedMinutes', event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="What is the work?"
            helperText="Optional, but it is what your Team Lead reviews."
          >
            <Textarea
              name="description"
              rows={4}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                requestKeyRef.current = '';
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              {options.requiresReview ? 'Send for review' : 'Create task'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
