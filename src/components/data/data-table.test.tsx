import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './data-table';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly division: string;
}

const ROWS: readonly Row[] = [
  { id: 'r1', name: 'Nadia Rahman', division: 'PIA' },
  { id: 'r2', name: 'Tanvir Ahmed', division: 'CJG' },
];

const COLUMNS = [
  { key: 'name', header: 'Employee', render: (row: Row) => row.name, alwaysVisible: true },
  { key: 'division', header: 'Division', render: (row: Row) => row.division, hideBelow: 'md' as const },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable<Row>
      caption="Employee hours"
      rows={ROWS}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      {...props}
    />,
  );
}

describe('DataTable', () => {
  it('names the table for assistive technology', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Employee hours' })).toBeInTheDocument();
  });

  it('scopes its header cells so a screen reader can associate them', () => {
    renderTable();
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
  });

  it('distinguishes an empty list from a filtered-empty one', () => {
    const { unmount } = renderTable({
      rows: [],
      emptyState: { title: 'No employees yet', description: 'Add the first record.' },
    });
    expect(screen.getByText('No employees yet')).toBeInTheDocument();
    unmount();

    renderTable({
      rows: [],
      emptyState: {
        variant: 'no-results',
        title: 'No employees match these filters',
        description: 'Clear a filter.',
      },
    });
    expect(screen.getByText('No employees match these filters')).toBeInTheDocument();
  });

  /**
   * A clickable row that only responds to a mouse is unreachable for a keyboard
   * user. This is the regression guard for that defect.
   */
  describe('a clickable row', () => {
    it('is reachable in the tab order', async () => {
      const onRowClick = vi.fn();
      renderTable({ onRowClick });
      const rows = screen.getAllByRole('row').filter((row) => row.tabIndex === 0);
      expect(rows.length).toBe(ROWS.length);
    });

    it('activates on Enter and on Space', async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      renderTable({ onRowClick });

      const row = screen.getAllByRole('row').find((candidate) => candidate.tabIndex === 0)!;
      row.focus();
      await user.keyboard('{Enter}');
      expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);

      await user.keyboard(' ');
      expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it('is not focusable when there is nothing to activate', () => {
      renderTable();
      expect(screen.getAllByRole('row').every((row) => row.tabIndex !== 0)).toBe(true);
    });
  });

  it('renders mobile cards alongside the table when one is supplied', () => {
    renderTable({ renderMobileCard: (row) => <span>{`card:${row.name}`}</span> });
    expect(screen.getByText('card:Nadia Rahman')).toBeInTheDocument();
    // The table is still present; it is hidden by CSS below `md`, not removed,
    // so a wide viewport keeps the tabular semantics.
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows a loading region rather than an empty table while loading', () => {
    renderTable({ loading: true });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
