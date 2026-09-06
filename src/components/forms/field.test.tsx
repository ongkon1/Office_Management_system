import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, FormErrorSummary } from './field';
import { Input, Select, Checkbox, RadioGroup, Switch } from './inputs';

describe('Field', () => {
  it('associates its label with the control', () => {
    render(
      <Field label="Work description">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Work description')).toBeInTheDocument();
  });

  it('states that a field is required in words, not by an asterisk alone', () => {
    render(
      <Field label="Reason" required>
        <Input />
      </Field>,
    );
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('wires an error to the control through aria-describedby and marks it invalid', () => {
    render(
      <Field label="Start time" error="Enter a time before the end time.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Start time');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!.split(' ')[0]);
    expect(description?.textContent).toContain('Enter a time before the end time.');
  });

  it('describes the control with helper text before the user acts', () => {
    render(
      <Field label="Duration" helperText="Use H:MM, for example 7:00.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Duration');
    const describedBy = input.getAttribute('aria-describedby');
    const description = document.getElementById(describedBy!.split(' ')[0]);
    expect(description?.textContent).toContain('Use H:MM');
  });

  it('keeps the label available to assistive technology when it is hidden', () => {
    render(
      <Field label="Payroll period" hideLabel>
        <Select options={[{ value: 'a', label: 'July' }]} />
      </Field>,
    );
    expect(screen.getByLabelText('Payroll period')).toBeInTheDocument();
  });
});

describe('FormErrorSummary', () => {
  it('renders nothing when there is nothing wrong', () => {
    const { container } = render(<FormErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the failures through an alert', () => {
    render(
      <FormErrorSummary
        autoFocus={false}
        errors={[
          { field: 'start', message: 'Enter a start time.' },
          { field: 'reason', message: 'Give a reason for the overtime.' },
        ]}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter a start time.');
    expect(alert).toHaveTextContent('Give a reason for the overtime.');
    expect(alert).toHaveTextContent('2 fields need attention');
  });

  it('moves focus to the field a summary entry names', async () => {
    const user = userEvent.setup();
    const onFocusField = vi.fn();
    render(
      <FormErrorSummary
        autoFocus={false}
        onFocusField={onFocusField}
        errors={[{ field: 'reason', message: 'Give a reason.' }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Give a reason.' }));
    expect(onFocusField).toHaveBeenCalledWith('reason');
  });
});

describe('choice controls', () => {
  it('makes the whole checkbox row the label, for a large enough target', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Request a correction"
        description="The employee is asked to change the record."
        onChange={onChange}
      />,
    );
    // Clicking the description — not the box — must still toggle it.
    await user.click(screen.getByText('The employee is asked to change the record.'));
    expect(onChange).toHaveBeenCalled();
  });

  it('groups radio options under a legend', () => {
    render(
      <RadioGroup
        name="portion"
        legend="Leave portion"
        value="full_day"
        onValueChange={() => {}}
        options={[
          { value: 'full_day', label: 'Full day' },
          { value: 'half_day', label: 'Half day' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Leave portion' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Full day/ })).toBeChecked();
  });

  it('exposes a switch with its state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Active" />);

    const control = screen.getByRole('switch', { name: 'Active' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not fire when a switch is disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked onCheckedChange={onCheckedChange} label="Active" disabled />,
    );
    await user.click(screen.getByRole('switch', { name: 'Active' }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
