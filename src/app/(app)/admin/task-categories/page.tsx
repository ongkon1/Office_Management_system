'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/feedback/card';
import { Alert } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { PageContainer, PageHeader } from '@/components/layout/page';
import type { TaskCategory, TaskCategoryCommand } from '@/contracts/task-categories';
import { useAsync } from '@/lib/use-async';
import { taskCategories } from '@/services/server/task-categories';

type Editor = { action: 'create' } | { action: 'rename' | 'setActive'; category: TaskCategory };

export default function TaskCategoriesPage() {
  const [revision, refresh] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { state } = useAsync(() => taskCategories({ action: 'list', includeArchived: true }), [revision]);

  function open(next: Editor) {
    setName(next.action === 'rename' ? next.category.name : '');
    setError('');
    setEditor(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    const command: TaskCategoryCommand = editor.action === 'create' ? { action: 'create', name }
      : editor.action === 'rename' ? { action: 'rename', id: editor.category.id, name }
      : { action: 'setActive', id: editor.category.id, isActive: !editor.category.isActive };
    setSaving(true);
    const result = await taskCategories(command);
    setSaving(false);
    if (result.status === 'success') {
      setEditor(null);
      refresh(current => current + 1);
    } else {
      setError(result.status === 'validation_failure' ? result.fieldErrors[0]?.message ?? result.message : result.message);
    }
  }

  const changingStatus = editor?.action === 'setActive';
  const actionLabel = changingStatus ? (editor.category.isActive ? 'Archive' : 'Restore')
    : editor?.action === 'rename' ? 'Save changes' : 'Add category';

  return (
    <PageContainer>
      <PageHeader
        title="Task Categories"
        description="Manage the categories available when creating tasks."
        actions={<Button variant="primary" onClick={() => open({ action: 'create' })}>Add category</Button>}
      />
      <Card className="mt-5">
        {state.status === 'loading' && <p role="status">Loading categories…</p>}
        {state.status !== 'loading' && state.status !== 'success' && (
          <Alert tone="danger" title="Categories unavailable">
            <Button variant="secondary" onClick={() => refresh(current => current + 1)}>Try again</Button>
          </Alert>
        )}
        {state.status === 'success' && (
          state.data.length === 0 ? <p className="text-ink-muted">No categories yet.</p> :
            <ul className="divide-y divide-border">
              {state.data.map(category => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 break-words font-medium">
                    {category.name} {!category.isActive && <Badge tone="neutral">Archived</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" aria-label={`Edit ${category.name}`} onClick={() => open({ action: 'rename', category })}>Edit</Button>
                    <Button variant="ghost" size="sm" aria-label={`${category.isActive ? 'Archive' : 'Restore'} ${category.name}`} onClick={() => open({ action: 'setActive', category })}>
                      {category.isActive ? 'Archive' : 'Restore'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
        )}
      </Card>
      <Dialog open={Boolean(editor)} onClose={() => { if (!saving) setEditor(null); }} title={editor?.action === 'rename' ? 'Edit category' : actionLabel}>
        <form className="space-y-4" onSubmit={save}>
          {changingStatus ? (
            <>
              <p>{editor.category.isActive ? 'Existing tasks keep this category. New tasks will no longer offer it.' : 'This category will be available when creating tasks.'}</p>
              {error && <Alert tone="danger" title="Category could not be updated" live>{error}</Alert>}
            </>
          ) : (
            <Field label="Category name" required error={error || undefined}>
              <Input value={name} maxLength={120} onChange={event => setName(event.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>{actionLabel}</Button>
          </div>
        </form>
      </Dialog>
    </PageContainer>
  );
}
