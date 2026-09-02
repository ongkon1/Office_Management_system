'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PageInfo, SortDirection, SortParams } from '@/contracts/query';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/forms/inputs';
import { DropdownMenu, Popover, type MenuItem } from '@/components/feedback/overlay';
import { EmptyState, type EmptyStateVariant } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';

export interface DataTableColumn<TRow> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow) => React.ReactNode;
  readonly sortable?: boolean;
  readonly align?: 'left' | 'right';
  /** Hidden at and below this breakpoint; the mobile card still shows it. */
  readonly hideBelow?: 'sm' | 'md' | 'lg';
  /** Excluded from the column-visibility menu when the column is essential. */
  readonly alwaysVisible?: boolean;
  readonly widthClass?: string;
}

export interface DataTableProps<TRow> {
  rows: readonly TRow[];
  columns: readonly DataTableColumn<TRow>[];
  getRowId: (row: TRow) => string;
  /** Accessible name for the table. */
  caption: string;

  loading?: boolean;
  /** Rendered when `rows` is empty. Distinguishes empty from filtered-empty. */
  emptyState?: {
    variant?: EmptyStateVariant;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };

  sort?: SortParams;
  onSortChange?: (sort: SortParams) => void;

  pageInfo?: PageInfo;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;

  selectedIds?: readonly string[];
  onSelectionChange?: (ids: readonly string[]) => void;

  rowActions?: (row: TRow) => readonly MenuItem[];
  onRowClick?: (row: TRow) => void;

  /** Card body for widths below `md`. Without it, the table scrolls instead. */
  renderMobileCard?: (row: TRow) => React.ReactNode;

  className?: string;
}

const HIDE_CLASSES = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const;

/**
 * The shared data table.
 *
 * Two things it deliberately does not do: it never sorts or paginates the data
 * itself (the service does, so results stay consistent with the server's
 * authorization and totals), and it never hides a row for permission reasons
 * (a row the viewer may not see is absent from `rows` entirely).
 */
export function DataTable<TRow>({
  rows,
  columns,
  getRowId,
  caption,
  loading = false,
  emptyState,
  sort,
  onSortChange,
  pageInfo,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectionChange,
  rowActions,
  onRowClick,
  renderMobileCard,
  className,
}: DataTableProps<TRow>) {
  const [hiddenColumns, setHiddenColumns] = React.useState<readonly string[]>([]);

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.key)),
    [columns, hiddenColumns],
  );

  const selectable = Boolean(onSelectionChange);
  const selected = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(getRowId(row)));

  function toggleSort(key: string) {
    if (!onSortChange) return;
    const direction: SortDirection =
      sort?.field === key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ field: key, direction });
  }

  function toggleRow(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  }

  function toggleAll() {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : rows.map(getRowId));
  }

  if (loading) {
    return <DataTableSkeleton columns={visibleColumns.length} className={className} />;
  }

  if (rows.length === 0 && emptyState) {
    return (
      <EmptyState
        variant={emptyState.variant ?? 'empty'}
        title={emptyState.title}
        description={emptyState.description}
        action={emptyState.action}
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(onSelectionChange || columns.some((column) => !column.alwaysVisible)) && (
        <div className="flex items-center justify-between gap-3" data-print="hide">
          <div aria-live="polite" className="text-body-sm text-ink-muted">
            {selectable && selected.size > 0
              ? `${selected.size} selected`
              : pageInfo
                ? `${pageInfo.totalItems.toLocaleString('en-US')} record${pageInfo.totalItems === 1 ? '' : 's'}`
                : null}
          </div>
          <ColumnVisibilityMenu
            columns={columns}
            hidden={hiddenColumns}
            onChange={setHiddenColumns}
          />
        </div>
      )}

      {/* Mobile cards. */}
      {renderMobileCard && (
        <ul className="flex flex-col gap-2 md:hidden">
          {rows.map((row) => {
            const id = getRowId(row);
            return (
              <li
                key={id}
                className={cn(
                  'rounded-lg border border-border bg-surface p-3',
                  onRowClick && 'cursor-pointer transition-colors hover:bg-surface-sunken',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {renderMobileCard(row)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Table. Wide content scrolls inside this region, never the page. */}
      <div
        className={cn(
          'table-scroll rounded-lg border border-border bg-surface',
          renderMobileCard && 'hidden md:block',
        )}
        tabIndex={0}
        role="region"
        aria-label={`${caption} table`}
      >
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="sticky top-0 z-10 bg-surface-sunken">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2">
                  <Checkbox
                    label="Select all rows"
                    hideLabel
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {visibleColumns.map((column) => {
                const active = sort?.field === column.key;
                const SortIcon = !active
                  ? ChevronsUpDown
                  : sort?.direction === 'asc'
                    ? ArrowUp
                    : ArrowDown;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort?.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : column.sortable
                          ? 'none'
                          : undefined
                    }
                    className={cn(
                      'border-b border-border px-3 py-2 text-label font-medium text-ink-muted',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.hideBelow && HIDE_CLASSES[column.hideBelow],
                      column.widthClass,
                    )}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          'inline-flex min-h-6 items-center gap-1 rounded-xs transition-colors hover:text-ink',
                          column.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {column.header}
                        <SortIcon aria-hidden className="size-3.5 shrink-0" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Row actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = getRowId(row);
              const isSelected = selected.has(id);

              return (
                <tr
                  key={id}
                  aria-selected={selectable ? isSelected : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors duration-150',
                    isSelected ? 'bg-accent-subtle' : 'hover:bg-surface-sunken',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-[var(--row-padding-y)]">
                      <Checkbox
                        label={`Select row ${id}`}
                        hideLabel
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  )}
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-3 py-[var(--row-padding-y)] text-ink',
                        column.align === 'right' ? 'text-right tabular' : 'text-left',
                        column.hideBelow && HIDE_CLASSES[column.hideBelow],
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className="px-3 py-[var(--row-padding-y)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu
                        label={`Actions for row ${id}`}
                        items={rowActions(row)}
                        trigger={
                          <IconButton
                            label="Row actions"
                            variant="ghost"
                            size="sm"
                            icon={<MoreHorizontal aria-hidden className="size-4" />}
                          />
                        }
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageInfo && onPageChange && (
        <Pagination
          pageInfo={pageInfo}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

function ColumnVisibilityMenu<TRow>({
  columns,
  hidden,
  onChange,
}: {
  columns: readonly DataTableColumn<TRow>[];
  hidden: readonly string[];
  onChange: (hidden: readonly string[]) => void;
}) {
  const optional = columns.filter((column) => !column.alwaysVisible);
  if (optional.length === 0) return null;

  return (
    <Popover
      label="Column visibility"
      align="end"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          iconLeading={<Columns3 aria-hidden className="size-4" />}
        >
          Columns
        </Button>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-ink-muted">Visible columns</legend>
        {optional.map((column) => (
          <Checkbox
            key={column.key}
            label={column.header}
            checked={!hidden.includes(column.key)}
            onChange={() =>
              onChange(
                hidden.includes(column.key)
                  ? hidden.filter((key) => key !== column.key)
                  : [...hidden, column.key],
              )
            }
          />
        ))}
      </fieldset>
    </Popover>
  );
}

export function Pagination({
  pageInfo,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  pageInfo: PageInfo;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}) {
  const firstItem = (pageInfo.page - 1) * pageInfo.pageSize + 1;
  const lastItem = Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.totalItems);

  return (
    <nav
      aria-label="Pagination"
      data-print="hide"
      className={cn(
        'flex flex-col items-center justify-between gap-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-caption text-ink-muted tabular">
        {pageInfo.totalItems === 0
          ? 'No records'
          : `${firstItem}–${lastItem} of ${pageInfo.totalItems.toLocaleString('en-US')}`}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-caption text-ink-muted">
            <span>Rows</span>
            <select
              value={pageInfo.pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-md border border-border-strong bg-surface px-2 text-caption text-ink"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={!pageInfo.hasPreviousPage}
          onClick={() => onPageChange(pageInfo.page - 1)}
        >
          Previous
        </Button>
        <span className="text-caption text-ink-muted tabular">
          Page {pageInfo.page} of {Math.max(1, pageInfo.totalPages)}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!pageInfo.hasNextPage}
          onClick={() => onPageChange(pageInfo.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

function DataTableSkeleton({
  columns,
  className,
}: {
  columns: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy
      aria-live="polite"
      className={cn('rounded-lg border border-border bg-surface', className)}
    >
      <span className="sr-only">Loading table</span>
      <div className="border-b border-border bg-surface-sunken px-3 py-2.5">
        <Skeleton height="0.875rem" width="30%" />
      </div>
      {Array.from({ length: 6 }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0"
        >
          {Array.from({ length: Math.max(1, columns) }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              height="0.875rem"
              width={columnIndex === 0 ? '25%' : '12%'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
