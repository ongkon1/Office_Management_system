import type { HrAssignmentView } from '@/contracts/hr';
import type { IsoDate } from '@/contracts/domain';

/**
 * `OH-FE-0306` — placement history, including department transfers.
 *
 * The employee detail already listed assignments; what it could not say is
 * *why* two of them exist. A transfer inside one division — Technical to Prompt
 * Engineering — is two assignment rows, and a reader had to infer the
 * relationship from dates. This derives it instead, so the history reads as the
 * sequence of events it actually is.
 *
 * It also fixes a labelling defect the same section carried: an assignment that
 * has not started yet is not effective today, so it was listed as **Ended**.
 * A placement is `scheduled`, `current` or `ended`, and those are three
 * different answers.
 */

export type PlacementState = 'current' | 'scheduled' | 'ended';

export interface PlacementHistoryRow {
  readonly assignment: HrAssignmentView;
  readonly state: PlacementState;
  /**
   * Set when this placement replaced another in the same division: the
   * department it came from, and the date the move took effect.
   */
  readonly transferredFrom: {
    readonly departmentName: string;
    readonly onDate: IsoDate;
    readonly onDateLabel: string;
  } | null;
}

export function placementState(assignment: HrAssignmentView, today: IsoDate): PlacementState {
  if (assignment.isEffectiveToday) return 'current';
  return assignment.isActive && assignment.startDate > today ? 'scheduled' : 'ended';
}

export const PLACEMENT_STATE_LABEL: Readonly<Record<PlacementState, string>> = {
  current: 'Current',
  scheduled: 'Scheduled',
  ended: 'Ended',
};

/**
 * Every placement, newest first, with its state and any transfer it represents.
 *
 * A transfer is recognised only inside one division and only between different
 * departments, because that is the only move that changes who an employee
 * reports to without changing which division they work in. A second division
 * starting is an additional placement, not a transfer — an employee may hold a
 * different department in each division at the same time (`OH-FE-0305`).
 */
export function placementHistory(
  assignments: readonly HrAssignmentView[],
  today: IsoDate,
): readonly PlacementHistoryRow[] {
  const ordered = [...assignments].sort(
    (left, right) =>
      right.startDate.localeCompare(left.startDate) || right.id.localeCompare(left.id),
  );

  return ordered.map((assignment) => {
    /* The placement this one succeeded: same division, earlier start, nearest. */
    const predecessor = ordered.find(
      (candidate) =>
        candidate.id !== assignment.id &&
        candidate.division.id === assignment.division.id &&
        candidate.startDate < assignment.startDate,
    );
    const transferred =
      predecessor && predecessor.department.id !== assignment.department.id
        ? {
            departmentName: predecessor.department.name,
            onDate: assignment.startDate,
            onDateLabel: assignment.startDateLabel,
          }
        : null;

    return {
      assignment,
      state: placementState(assignment, today),
      transferredFrom: transferred,
    };
  });
}

/** One line describing an employee's placements today (`OH-FE-0305`). */
export function describeCurrentPlacements(
  assignments: readonly HrAssignmentView[],
  today: IsoDate,
): string {
  const current = assignments.filter((assignment) => placementState(assignment, today) === 'current');
  if (current.length === 0) return 'No effective placement today.';
  if (current.length === 1) {
    const only = current[0]!;
    return `Placed in ${only.department.name} (${only.division.name}).`;
  }
  return `Placed in ${current.length} departments: ${current
    .map((assignment) => `${assignment.department.name} (${assignment.division.name})`)
    .join(', ')}.`;
}
