import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Field } from './field';
import { Select2 } from './select2';

it('renders the Select2 search and selects a matching category', async () => {
  const onChange = vi.fn();
  render(
    <Field label="Task category">
      <Select2 value="" onChange={onChange} options={[
        { value: 'design', label: 'Design' }, { value: 'support', label: 'Client Support' },
      ]} />
    </Field>,
  );
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Task category' })).toHaveClass('select2-selection'));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Task category' }), { button: 0, which: 1 });
  const search = await screen.findByRole('searchbox');
  fireEvent.input(search, { target: { value: 'support' } });
  fireEvent.mouseUp(await screen.findByRole('option', { name: 'Client Support' }));
  expect(onChange).toHaveBeenCalledWith('support');
});
