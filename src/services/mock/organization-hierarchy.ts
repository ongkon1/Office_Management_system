import type { DepartmentLeadScope, EmployeeDivisionAssignment, IsoDate } from '@/contracts/domain';
import { EMPLOYEES } from '@/fixtures/hr';
import {
  departmentById,
  departmentRecords,
  effectiveLeadAssignment,
} from './department-store';
import { mockStore } from './store';

const DEMO_HIERARCHY_DATE: IsoDate = '2026-09-02';

export function assignmentIsEffective(
  assignment: EmployeeDivisionAssignment,
  onDate: IsoDate,
): boolean {
  return assignment.isActive && assignment.startDate <= onDate &&
    (assignment.endDate === null || assignment.endDate >= onDate);
}

export function departmentMembers(
  departmentId: string,
  onDate: IsoDate = DEMO_HIERARCHY_DATE,
): readonly EmployeeDivisionAssignment[] {
  return mockStore.assignments().filter((assignment) =>
    assignment.departmentId === departmentId && assignmentIsEffective(assignment, onDate));
}

export function departmentLeadScopes(
  employeeId: string,
  onDate: IsoDate = DEMO_HIERARCHY_DATE,
): readonly DepartmentLeadScope[] {
  return departmentRecords().flatMap((department) => {
    const appointment = effectiveLeadAssignment(department.id, onDate);
    if (!department.isActive || appointment?.leadEmployeeId !== employeeId) return [];
    return [{
      departmentId: department.id,
      divisionId: department.divisionId,
      effectiveFrom: appointment.effectiveFrom,
      effectiveTo: appointment.effectiveTo,
    }];
  });
}

export function departmentLeadEmployeeIds(
  leadEmployeeId: string,
  onDate: IsoDate = DEMO_HIERARCHY_DATE,
): readonly string[] {
  const departmentIds = new Set(
    departmentLeadScopes(leadEmployeeId, onDate).map((scope) => scope.departmentId),
  );
  return [...new Set(
    mockStore.assignments()
      .filter((assignment) =>
        departmentIds.has(assignment.departmentId) && assignmentIsEffective(assignment, onDate))
      .map((assignment) => assignment.employeeId),
  )].filter((employeeId) => employeeId !== leadEmployeeId);
}

export function effectiveLeadForAssignment(
  assignment: EmployeeDivisionAssignment,
  onDate: IsoDate = DEMO_HIERARCHY_DATE,
): string | null {
  return effectiveLeadAssignment(assignment.departmentId, onDate)?.leadEmployeeId ?? null;
}

export function validateAssignmentDepartment(
  divisionId: string,
  departmentId: string,
): { field: 'departmentId'; message: string; guidance: string } | null {
  const department = departmentById(departmentId);
  if (!department || !department.isActive) {
    return {
      field: 'departmentId', message: 'Choose an active department.',
      guidance: 'Select a department available in the assignment division.',
    };
  }
  if (department.divisionId !== divisionId) {
    return {
      field: 'departmentId', message: 'The department belongs to another division.',
      guidance: 'Choose a department owned by the selected division.',
    };
  }
  return null;
}

export function validateLeadCandidate(
  departmentId: string,
  employeeId: string,
  onDate: IsoDate,
): { field: 'leadEmployeeId'; message: string; guidance: string } | null {
  const department = departmentById(departmentId);
  const employee = EMPLOYEES.find((candidate) => candidate.id === employeeId);
  if (!department || !employee || employee.status !== 'active') {
    return {
      field: 'leadEmployeeId', message: 'Choose an active employee.',
      guidance: 'Select an active employee assigned to the department division.',
    };
  }
  const eligible = mockStore.assignments().some((assignment) =>
    assignment.employeeId === employeeId && assignment.divisionId === department.divisionId &&
    assignmentIsEffective(assignment, onDate));
  return eligible ? null : {
    field: 'leadEmployeeId', message: 'The employee is not assigned to this division.',
    guidance: 'Choose an active employee with an effective assignment in the department division.',
  };
}
