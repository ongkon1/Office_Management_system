'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Six chart series colours, ordered so adjacent series also differ in
 * lightness. That ordering is what keeps a chart readable in greyscale, for a
 * colour-blind viewer, and on a projector — none of which a hue-only palette
 * survives (`REQ-NFR-UX-003`).
 */
export const CHART_SERIES_CLASSES = [
  'fill-chart-1',
  'fill-chart-2',
  'fill-chart-3',
  'fill-chart-4',
  'fill-chart-5',
  'fill-chart-6',
] as const;

export const CHART_SERIES_VARS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
] as const;

export function seriesColor(index: number): string {
  return CHART_SERIES_VARS[index % CHART_SERIES_VARS.length];
}

export interface ChartDatum {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** Pre-formatted for display, e.g. `7:00` or `BDT 1.25M`. */
  readonly display: string;
}

export interface ChartContainerProps {
  title: string;
  description?: string;
  data: readonly ChartDatum[];
  loading?: boolean;
  /** Rendered under the chart as the accessible equivalent. Always present. */
  tableCaption: string;
  valueHeader: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Wraps every chart with the things a chart alone cannot provide.
 *
 * The data table below the figure is not a fallback — it is always in the DOM,
 * collapsed for sighted users and available to screen readers, because a
 * visual encoding is never the only route to the numbers (`FE-0614`,
 * `REQ-NFR-UX-003`).
 */
export function ChartContainer({
  title,
  description,
  data,
  loading = false,
  tableCaption,
  valueHeader,
  children,
  actions,
  className,
}: ChartContainerProps) {
  const [showTable, setShowTable] = React.useState(false);

  if (loading) {
    return (
      <div
        role="status"
        aria-busy
        className={cn('rounded-xl border border-border bg-surface p-5 shadow-sm', className)}
      >
        <span className="sr-only">Loading chart</span>
        <Skeleton height="0.875rem" width="35%" />
        <Skeleton height="10rem" className="mt-4" rounded="md" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={`No data for ${title.toLowerCase()}`}
        description="There is nothing to chart for the selected filters."
        className={className}
      />
    );
  }

  return (
    <figure
      className={cn('min-w-0 rounded-xl border border-border bg-surface p-5 shadow-sm', className)}
    >
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 text-ink">{title}</h3>
          {description && (
            <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap gap-2">{actions}</div>}
      </figcaption>

      <div className="mt-4" role="img" aria-label={`${title}. ${tableCaption}`}>
        {children}
      </div>

      <ChartLegend data={data} />

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowTable((value) => !value)}
          aria-expanded={showTable}
          className="inline-flex min-h-6 items-center text-caption text-ink-muted underline underline-offset-2 hover:text-ink"
          data-print="hide"
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>

        <div hidden={!showTable} className="mt-2 table-scroll">
          <table className="w-full text-body-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-1.5 text-left text-label text-ink-muted">
                  Series
                </th>
                <th scope="col" className="border-b border-border py-1.5 text-right text-label text-ink-muted">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.key}>
                  <td className="border-b border-border py-1.5 text-ink">{datum.label}</td>
                  <td className="border-b border-border py-1.5 text-right text-ink tabular">
                    {datum.display}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </figure>
  );
}

export function ChartLegend({ data }: { data: readonly ChartDatum[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {data.map((datum, index) => (
        <li key={datum.key} className="flex items-center gap-1.5 text-caption text-ink-muted">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-xs"
            style={{ backgroundColor: seriesColor(index) }}
          />
          <span className="text-ink">{datum.label}</span>
          <span className="tabular">{datum.display}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Chart marks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A horizontal bar chart.
 *
 * Horizontal rather than vertical because the category labels here are
 * division and project names, which do not fit under a vertical axis without
 * rotating text.
 */
export function BarChart({
  data,
  max,
  className,
}: {
  data: readonly ChartDatum[];
  /** Defaults to the largest value; pass a target to compare against it. */
  max?: number;
  className?: string;
}) {
  const ceiling = max ?? Math.max(...data.map((datum) => datum.value), 1);

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {data.map((datum, index) => {
        const percent = ceiling === 0 ? 0 : (datum.value / ceiling) * 100;
        return (
          <div key={datum.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-caption">
              <span className="min-w-0 truncate text-ink">{datum.label}</span>
              <span className="shrink-0 text-ink-muted tabular">{datum.display}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.max(0, Math.min(100, percent))}%`,
                  backgroundColor: seriesColor(index),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A donut for part-to-whole splits such as division contribution. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  size = 180,
  className,
}: {
  data: readonly ChartDatum[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  className?: string;
}) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;

  // Offsets are accumulated up front rather than mutated while mapping, so the
  // render stays a pure function of its inputs.
  const segments = data.reduce<
    { readonly key: string; readonly length: number; readonly offset: number }[]
  >((acc, datum) => {
    const fraction = total === 0 ? 0 : datum.value / total;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    acc.push({ key: datum.key, length: fraction * circumference, offset });
    return acc;
  }, []);

  return (
    <div className={cn('flex justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((segment, index) => (
            <circle
              key={segment.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seriesColor(index)}
              strokeWidth={20}
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </g>
        {(centerValue || centerLabel) && (
          <>
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              className="fill-[var(--color-ink)] text-h3 font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {centerValue}
            </text>
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              className="fill-[var(--color-ink-muted)] text-caption"
            >
              {centerLabel}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
