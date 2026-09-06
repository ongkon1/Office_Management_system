'use client';

import * as React from 'react';
import { Coins, Lock, ShieldAlert } from 'lucide-react';
import type { FinancePeriodRef, RedactableMoneyView } from '@/contracts/finance';
import type { Result } from '@/contracts/results';
import { PageContainer } from '@/components/layout/page';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import { Select } from '@/components/forms/inputs';
import { Field } from '@/components/forms/field';

export function FinanceLoading({ label }: { label: string }) {
  return (
    <PageContainer>
      <div role="status" aria-busy>
        <span className="sr-only">Loading {label}</span>
        <Skeleton height="2rem" width="18rem" />
        <Skeleton height="20rem" rounded="md" className="mt-5" />
      </div>
    </PageContainer>
  );
}

export function FinanceFallback({
  result,
  subject,
}: {
  result: Exclude<Result<unknown>, { status: 'success' }>;
  subject: string;
}) {
  if (result.status === 'permission_denied') {
    return (
      <PageContainer>
        <EmptyState
          variant="denied"
          title="Not available to your role"
          description={`${result.message} ${result.guidance ?? ''}`.trim()}
        />
      </PageContainer>
    );
  }
  if (result.status === 'not_found') {
    return (
      <PageContainer>
        <EmptyState variant="no-results" title={`${subject} not found`} description={result.message} />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <EmptyState variant="error" title={`${subject} unavailable`} description="Try again in a moment." />
    </PageContainer>
  );
}

/**
 * Renders a money value or its restricted marker.
 *
 * The restricted branch is not a blank and not a zero: it states that a value
 * exists and is withheld (`REQ-NFR-SEC-004`, `REQ-RPT-007`).
 */
export function MoneyValue({
  value,
  emphasis = false,
  compact = false,
  className,
}: {
  value: RedactableMoneyView;
  emphasis?: boolean;
  /** Abbreviated form for dense summary tiles. Detail views stay exact. */
  compact?: boolean;
  className?: string;
}) {
  if (!value.visible) {
    return <RestrictedValue reason="Cost values need the financial-detail permission." className={className} />;
  }
  const classes = `tabular whitespace-nowrap ${emphasis ? 'font-semibold' : ''} ${className ?? ''}`;

  // Only the abbreviated form needs a second representation. Rendering both
  // when they are identical is redundant markup a screen reader has to skip.
  if (!compact) return <span className={classes}>{value.display}</span>;

  return (
    <span className={classes} title={value.display}>
      <span aria-hidden>{value.compact}</span>
      <span className="sr-only">{value.display}</span>
    </span>
  );
}

/** States that the period is verified, or that it is not and why that matters. */
export function VerificationBadge({ period }: { period: FinancePeriodRef }) {
  return period.isVerified ? (
    <Badge tone="success" icon={<Lock aria-hidden className="size-3.5" />}>
      Verified period
    </Badge>
  ) : (
    <Badge tone="warning" icon={<ShieldAlert aria-hidden className="size-3.5" />}>
      Not verified
    </Badge>
  );
}

export function UnverifiedWarning({ warning }: { warning: string | null }) {
  if (!warning) return null;
  return (
    <Alert className="mt-4" tone="warning" title="These figures are not payroll-ready">
      {warning}
    </Alert>
  );
}

export function RestrictionNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <Alert className="mt-4" tone="info" title="Some values are withheld">
      {note}
    </Alert>
  );
}

export function CostPermissionBadge({ allowed }: { allowed: boolean }) {
  return (
    <Badge
      tone={allowed ? 'accent' : 'neutral'}
      icon={<Coins aria-hidden className="size-3.5" />}
    >
      {allowed ? 'Cost visible' : 'Cost restricted'}
    </Badge>
  );
}

export function PeriodPicker({
  periods,
  value,
  onChange,
}: {
  periods: readonly FinancePeriodRef[];
  value: string;
  onChange: (periodId: string) => void;
}) {
  return (
    <Field label="Payroll period" hideLabel className="w-56">
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Payroll period"
        options={periods.map((period) => ({
          value: period.id,
          label: `${period.label}${period.isVerified ? '' : ' (not verified)'}`,
        }))}
      />
    </Field>
  );
}

export const DIVISION_FILTER_OPTIONS = [
  { value: 'pia', label: 'PowerInAI' },
  { value: 'pit', label: 'PowerInAI Training' },
  { value: 'gov', label: 'Government Projects' },
  { value: 'cjg', label: 'Computer Jagat' },
  { value: 'wcf', label: 'WesternCF' },
];

export const EMPLOYEE_FILTER_OPTIONS = [
  { value: 'emp-1001', label: 'Nadia Rahman' },
  { value: 'emp-1002', label: 'Tanvir Ahmed' },
  { value: 'emp-1003', label: 'Sadia Karim' },
  { value: 'emp-1004', label: 'Sumaiya Noor' },
];

export const PROJECT_FILTER_OPTIONS = [
  { value: 'prj-vp2', label: 'PIA-VP2 Vision Platform v2' },
  { value: 'prj-alb', label: 'PIT-ALB AI Literacy Bootcamp' },
  { value: 'prj-nrd', label: 'GOV-NRD National Records Digitisation' },
  { value: 'prj-mip', label: 'CJG-MIP Monthly Issue Production' },
  { value: 'prj-wpr', label: 'WCF-WPR Westbridge Portal Rollout' },
];

export const STATUS_FILTER_OPTIONS = [
  { value: 'complete', label: 'Complete' },
  { value: 'under_time', label: 'Under-time' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'critical', label: 'Critical' },
  { value: 'missing', label: 'Missing' },
];
