'use client';

import * as React from 'react';
import { Calendar, Check, ChevronDown, Filter, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DateRange, DateRangePreset } from '@/contracts/query';
import { formatDateRange } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover } from '@/components/feedback/overlay';
import { Field } from '@/components/forms/field';
import { DateInput, SearchInput } from '@/components/forms/inputs';

/* -------------------------------------------------------------------------- */
/* Multi-select                                                               */
/* -------------------------------------------------------------------------- */

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  /** Secondary text, e.g. a division code or an employee ID. */
  readonly hint?: string;
}

export interface MultiSelectFilterProps {
  label: string;
  options: readonly FilterOption[];
  selected: readonly string[];
  onChange: (selected: readonly string[]) => void;
  /** Shows a search box once the list passes this length. */
  searchThreshold?: number;
  className?: string;
}

/**
 * A checkbox-list multi-select in a popover.
 *
 * Checkboxes rather than a custom listbox: multi-selection with a listbox is
 * routinely misannounced, while a group of checkboxes states exactly what is
 * and is not selected.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  searchThreshold = 8,
  className,
}: MultiSelectFilterProps) {
  const [term, setTerm] = React.useState('');

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.hint?.toLowerCase().includes(needle),
    );
  }, [options, term]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`;

  return (
    <Popover
      label={`${label} filter`}
      className={cn('w-64', className)}
      trigger={
        <Button
          variant="secondary"
          size="sm"
          iconTrailing={<ChevronDown aria-hidden className="size-4" />}
        >
          <span className="text-ink-muted">{label}:</span>
          <span className="max-w-32 truncate font-medium">{summary}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {options.length >= searchThreshold && (
          <SearchInput
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onClear={() => setTerm('')}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label}`}
          />
        )}

        <fieldset className="max-h-64 overflow-y-auto">
          <legend className="sr-only">{label}</legend>
          {filtered.length === 0 ? (
            <p className="px-1 py-3 text-caption text-ink-muted">No matches</p>
          ) : (
            filtered.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-surface-sunken"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-xs border',
                      checked
                        ? 'border-primary bg-primary text-white'
                        : 'border-border-strong bg-surface',
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm text-ink">
                      {option.label}
                    </span>
                    {option.hint && (
                      <span className="block truncate text-caption text-ink-subtle">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </fieldset>

        {selected.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear {label.toLowerCase()}
          </Button>
        )}
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Date range                                                                 */
/* -------------------------------------------------------------------------- */

const PRESETS: readonly { readonly key: DateRangePreset; readonly label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'payroll_period', label: 'Payroll period' },
];

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Resolves a preset to concrete dates; supplied by the calling feature. */
  resolvePreset: (preset: DateRangePreset) => DateRange;
  label?: string;
  className?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  resolvePreset,
  label = 'Period',
  className,
}: DateRangeFilterProps) {
  const summary =
    PRESETS.find((preset) => preset.key === value.preset)?.label ??
    formatDateRange(value.from, value.to);

  return (
    <Popover
      label={`${label} filter`}
      className={cn('w-72', className)}
      trigger={
        <Button
          variant="secondary"
          size="sm"
          iconLeading={<Calendar aria-hidden className="size-4" />}
          iconTrailing={<ChevronDown aria-hidden className="size-4" />}
        >
          <span className="text-ink-muted">{label}:</span>
          <span className="font-medium">{summary}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={value.preset === preset.key}
              onClick={() => onChange(resolvePreset(preset.key))}
              className={cn(
                'rounded-md border px-2 py-1.5 text-caption transition-colors',
                value.preset === preset.key
                  ? 'border-accent bg-accent-subtle text-accent'
                  : 'border-border bg-surface text-ink-muted hover:bg-surface-sunken',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Field label="From">
            <DateInput
              value={value.from}
              max={value.to}
              onChange={(event) =>
                onChange({ from: event.target.value, to: value.to, preset: 'custom' })
              }
            />
          </Field>
          <Field label="To">
            <DateInput
              value={value.to}
              min={value.from}
              onChange={(event) =>
                onChange({ from: value.from, to: event.target.value, preset: 'custom' })
              }
            />
          </Field>
        </div>
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter bar                                                                 */
/* -------------------------------------------------------------------------- */

export interface AppliedFilter {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly onRemove: () => void;
}

export interface FilterBarProps {
  children: React.ReactNode;
  /** Chips summarising what is applied, so the result set is explainable. */
  applied?: readonly AppliedFilter[];
  onClearAll?: () => void;
  /** Result count announced politely when filters change. */
  resultSummary?: string;
  className?: string;
}

/**
 * The filter row above a table.
 *
 * On small screens the controls collapse behind a single "Filters" button and
 * the applied chips remain visible, so the user always knows why a list is
 * short before concluding data is missing.
 */
export function FilterBar({
  children,
  applied = [],
  onClearAll,
  resultSummary,
  className,
}: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className={cn('flex flex-col gap-3', className)} data-print="hide">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="md:hidden"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
          iconLeading={<Filter aria-hidden className="size-4" />}
        >
          Filters
          {applied.length > 0 && (
            <Badge tone="accent" className="ml-1">
              {applied.length}
            </Badge>
          )}
        </Button>

        <div
          className={cn(
            'flex-wrap items-center gap-2',
            mobileOpen ? 'flex' : 'hidden',
            'md:flex',
          )}
        >
          {children}
        </div>
      </div>

      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-muted">Applied:</span>
          {applied.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-caption text-ink"
            >
              <span className="text-ink-muted">{filter.label}:</span>
              <span className="font-medium">{filter.value}</span>
              <button
                type="button"
                onClick={filter.onRemove}
                aria-label={`Remove ${filter.label} filter`}
                className="-mr-1 grid size-6 place-items-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-danger"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ))}
          {onClearAll && (
            <Button variant="link" size="sm" onClick={onClearAll}>
              Clear all
            </Button>
          )}
        </div>
      )}

      {resultSummary && (
        <p aria-live="polite" className="sr-only">
          {resultSummary}
        </p>
      )}
    </div>
  );
}
