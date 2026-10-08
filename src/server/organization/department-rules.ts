/**
 * Department hierarchy rules that need no database (`OH-BE-0106`, `OH-BE-0107`).
 *
 * The repository reads rows under a lock and then asks these functions what to
 * do, so the decisions are testable without MySQL and exist once. A second copy
 * of the appointment decision is how the frontend's refusal and the server's
 * refusal come to disagree.
 */

export interface EffectiveRange {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface LeadPeriod extends EffectiveRange {
  readonly id: string;
  readonly leadEmployeeId: string;
}

/** Open-ended ranges are compared against the maximum date MySQL stores. */
const OPEN_ENDED = '9999-12-31';

export function rangesOverlap(left: EffectiveRange, right: EffectiveRange): boolean {
  return (
    left.effectiveFrom <= (right.effectiveTo ?? OPEN_ENDED) &&
    right.effectiveFrom <= (left.effectiveTo ?? OPEN_ENDED)
  );
}

export function isEffectiveOn(range: EffectiveRange, date: string): boolean {
  return range.effectiveFrom <= date && (range.effectiveTo === null || range.effectiveTo >= date);
}

/** The day a replaced appointment ends: the day before its successor starts. */
export function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function effectiveLeadPeriod(
  history: readonly LeadPeriod[],
  date: string,
): LeadPeriod | null {
  return history.find((period) => isEffectiveOn(period, date)) ?? null;
}

export type AppointmentDecision =
  /** Close `closePeriodId` the day before, then append. `null` appends only. */
  | { readonly kind: 'append'; readonly closePeriodId: string | null; readonly closeOn: string | null }
  /** An appointment already starts on or after this date. */
  | { readonly kind: 'overlap'; readonly periodId: string }
  /** The open period already names this employee. */
  | { readonly kind: 'already_leads'; readonly periodId: string };

/**
 * What appointing `leadEmployeeId` from `effectiveFrom` should do to the
 * history.
 *
 * Two rules are deliberate. An appointment starting on or after the new date is
 * refused rather than resolved, because resolving it means editing dates that
 * are already recorded. And a closed period is never a candidate for closing
 * again — only the open one is touched, by giving it an end date.
 */
export function appointmentDecision(
  history: readonly LeadPeriod[],
  effectiveFrom: string,
  leadEmployeeId: string,
): AppointmentDecision {
  const later = history.find((period) => period.effectiveFrom >= effectiveFrom);
  if (later) return { kind: 'overlap', periodId: later.id };

  const open = history.find(
    (period) => period.effectiveTo === null && period.effectiveFrom < effectiveFrom,
  );
  if (open && open.leadEmployeeId === leadEmployeeId) {
    return { kind: 'already_leads', periodId: open.id };
  }
  return open
    ? { kind: 'append', closePeriodId: open.id, closeOn: previousDay(effectiveFrom) }
    : { kind: 'append', closePeriodId: null, closeOn: null };
}

export interface PlacementCandidate extends EffectiveRange {
  readonly assignmentId: string;
  readonly departmentId: string | null;
  readonly isActive: boolean;
}

/**
 * `OH-BE-0106`. The other placement that stops this one.
 *
 * An employee may hold several assignments in one division over time, and may
 * be in a different department in each division — but on any one date, in one
 * division, exactly one department. Two overlapping active assignments naming
 * different departments is the state this returns.
 */
export function conflictingPlacement(
  others: readonly PlacementCandidate[],
  target: EffectiveRange & { readonly assignmentId: string; readonly departmentId: string },
): PlacementCandidate | null {
  return (
    others.find(
      (candidate) =>
        candidate.assignmentId !== target.assignmentId &&
        candidate.isActive &&
        candidate.departmentId !== null &&
        candidate.departmentId !== target.departmentId &&
        rangesOverlap(candidate, target),
    ) ?? null
  );
}
