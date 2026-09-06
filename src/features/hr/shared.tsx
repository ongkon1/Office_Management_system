'use client';

import * as React from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { PageContainer } from '@/components/layout/page';
import { EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { Result } from '@/contracts/results';

/** The loading state every HR screen shares. */
export function HrLoading({ label }: { label: string }) {
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

/**
 * Renders the non-success results a screen must distinguish.
 *
 * `permission_denied` is deliberately not folded into a generic error: the
 * viewer needs to know a control exists but is not theirs, and the guidance the
 * service returned is the only actionable part of that message.
 */
export function HrResultFallback({
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

/** Marks a screen as company-wide, which is the HR scope. */
export function CompanyScope() {
  return (
    <Badge tone="accent" icon={<Building2 aria-hidden className="size-3.5" />}>
      All divisions
    </Badge>
  );
}

/** Marks a control gated behind a separately granted permission. */
export function SensitiveBadge({ label }: { label: string }) {
  return (
    <Badge tone="warning" icon={<ShieldCheck aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  );
}

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];

export const WORK_MODE_OPTIONS = [
  { value: 'office', label: 'Office' },
  { value: 'wfh', label: 'WFH' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'field_work', label: 'Field Work' },
  { value: 'official_travel', label: 'Official Travel' },
  { value: 'training', label: 'Training' },
  { value: 'client_location', label: 'Client Location' },
];

export const DIVISION_OPTIONS = [
  { value: 'pia', label: 'PowerInAI' },
  { value: 'pit', label: 'PowerInAI Training' },
  { value: 'gov', label: 'Government Projects' },
  { value: 'cjg', label: 'Computer Jagat' },
  { value: 'wcf', label: 'WesternCF' },
];

export const TEAM_LEAD_OPTIONS = [
  { value: 'emp-2001', label: 'Imran Hossain' },
  { value: 'emp-2002', label: 'Farhana Islam' },
];
