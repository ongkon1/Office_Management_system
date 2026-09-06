/**
 * Divisions, assignments, and project/task selection.
 *
 * The effective-date rule lives here: an assignment grants access only on
 * dates inside its range (`REQ-DATA-002`, `REQ-ORG-009`). "Which divisions can
 * this employee use" is therefore always a question with a date, never a
 * simple lookup.
 */

import { taskAcceptsTime } from '@/contracts/domain';
import type { Division, EmployeeDivisionAssignment, IsoDate, Project, Task } from '@/contracts/domain';
import { success, type Result } from '@/contracts/results';
import { PROJECTS } from '@/fixtures';
import { DIVISIONS } from './accounts';
import { mockStore } from './store';

const STAMP = {
  createdAt: '2026-01-01T09:00:00+06:00',
  createdBy: { userId: 'usr-system', displayName: 'System' },
  updatedAt: '2026-01-01T09:00:00+06:00',
  updatedBy: { userId: 'usr-system', displayName: 'System' },
};

export const ALL_DIVISIONS: readonly Division[] = Object.values(DIVISIONS).map(
  (division) => ({
    id: division.id,
    name: division.name,
    code: division.code,
    description: null,
    teamLeadEmployeeId: null,
    isActive: true,
    isRestricted: division.isRestricted,
    ...STAMP,
  }),
);

export function divisionById(id: string): Division | undefined {
  return ALL_DIVISIONS.find((division) => division.id === id);
}

/** Assignments for an employee, most recent first. */
export function assignmentsFor(employeeId: string): readonly EmployeeDivisionAssignment[] {
  return mockStore
    .assignments()
    .filter((assignment) => assignment.employeeId === employeeId)
    .sort(
    (a, b) => b.startDate.localeCompare(a.startDate),
  );
}

/** True when the assignment covers `date`. */
export function isEffectiveOn(
  assignment: EmployeeDivisionAssignment,
  date: IsoDate,
): boolean {
  if (date < assignment.startDate) return false;
  if (assignment.endDate && date > assignment.endDate) return false;
  return true;
}

/**
 * Divisions the employee may record time against on a given date.
 *
 * An expired temporary assignment drops out here, which is what makes
 * `REQ-ORG-009` enforceable rather than advisory.
 */
export function effectiveDivisionIds(
  employeeId: string,
  date: IsoDate,
): readonly string[] {
  return assignmentsFor(employeeId)
    .filter((assignment) => isEffectiveOn(assignment, date))
    .map((assignment) => assignment.divisionId);
}

/** Concurrent planned allocation, used for the 100% warning (`REQ-ORG-010`). */
export function concurrentAllocationPercent(employeeId: string, date: IsoDate): number {
  return assignmentsFor(employeeId)
    .filter((assignment) => assignment.isActive && isEffectiveOn(assignment, date))
    .reduce((total, assignment) => total + assignment.allocationPercent, 0);
}

/** Projects accepting time for a division on a date (`REQ-WORK-008`). */
export function selectableProjects(divisionId: string): readonly Project[] {
  return PROJECTS.filter(
    (project) =>
      project.divisionId === divisionId && project.isActive && project.acceptsTimeEntries,
  );
}

export function selectableTasks(projectId: string): readonly Task[] {
  return mockStore
    .tasks()
    .filter(
      (task) =>
        task.projectId === projectId &&
        task.status !== 'completed' &&
        // An employee-raised task is not selectable until it has been
        // endorsed. The rule is enforced again in validation, because a
        // filtered dropdown is a convenience and not a control.
        taskAcceptsTime(task.reviewState),
    );
}

export function projectById(id: string): Project | undefined {
  return PROJECTS.find((project) => project.id === id);
}

/** Actual project hours derived from time entries, never stored (`REQ-WORK-002`). */
export function actualProjectMinutes(projectId: string): number {
  return mockStore
    .entriesForProject(projectId)
    .filter((entry) => entry.state !== 'draft')
    .reduce((total, entry) => total + entry.activeMinutes, 0);
}

/** Actual task time derived from linked entries (`REQ-WORK-007`). */
export function actualTaskMinutes(taskId: string): number {
  return mockStore
    .entriesForTask(taskId)
    .filter((entry) => entry.state !== 'draft')
    .reduce((total, entry) => total + entry.activeMinutes, 0);
}

export const mockOrganizationService = {
  async listDivisions(): Promise<Result<readonly Division[]>> {
    return success(ALL_DIVISIONS);
  },

  async listAssignments(
    employeeId: string,
  ): Promise<Result<readonly EmployeeDivisionAssignment[]>> {
    return success(assignmentsFor(employeeId));
  },

  async listEffectiveDivisions(
    employeeId: string,
    workDate: IsoDate,
  ): Promise<Result<readonly Division[]>> {
    const ids = effectiveDivisionIds(employeeId, workDate);
    return success(ALL_DIVISIONS.filter((division) => ids.includes(division.id)));
  },
};
