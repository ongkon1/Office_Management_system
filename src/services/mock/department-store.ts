import type { Department, DepartmentLeadAssignment, IsoDate } from '@/contracts/domain';

const SYSTEM = { userId: 'usr-system', displayName: 'System' };
const STAMP = {
  createdAt: '2026-01-01T09:00:00+06:00', createdBy: SYSTEM,
  updatedAt: '2026-01-01T09:00:00+06:00', updatedBy: SYSTEM,
};

export type DepartmentRecord = Department;

const DEPARTMENT_SEEDS = [
  ['pia', 'Sales', 'SALES'], ['pia', 'Technical', 'TECH'],
  ['pia', 'Prompt Engineering', 'PROMPT'], ['pia', 'People', 'PPL'],
  ['pia', 'Finance', 'FIN'], ['pia', 'Executive', 'EXEC'], ['pia', 'IT', 'IT'],
  ['pit', 'Training', 'TRN'], ['pit', 'Programs', 'PRG'],
  ['gov', 'Delivery', 'DLV'], ['gov', 'Compliance', 'COMP'],
  ['cjg', 'Production', 'PROD'], ['cjg', 'Editorial', 'EDIT'],
  // Duplicate names are intentional: uniqueness is scoped to a division.
  ['wcf', 'Sales', 'SALES'], ['wcf', 'Client Services', 'CLIENT'],
  ['wcf', 'Operations', 'OPS'],
] as const;

function idFor(divisionId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `dept-${divisionId}-${slug}`;
}

function seedDepartments(): DepartmentRecord[] {
  return DEPARTMENT_SEEDS.map(([divisionId, name, code]) => ({
    id: idFor(divisionId, name), divisionId, name, code,
    description: null, isActive: true, ...STAMP,
  }));
}

function leadSeed(
  id: string, departmentId: string, leadEmployeeId: string,
  effectiveFrom: IsoDate, effectiveTo: IsoDate | null = null,
): DepartmentLeadAssignment {
  return {
    id, departmentId, leadEmployeeId, effectiveFrom, effectiveTo,
    reason: 'Initial demo mapping', ...STAMP,
  };
}

function seedLeadAssignments(): DepartmentLeadAssignment[] {
  const records = seedDepartments().map((department) =>
    leadSeed(
      `lead-${department.id}-current`, department.id,
      department.id === 'dept-pia-sales'
        ? 'emp-1001'
        : department.divisionId === 'gov' || department.divisionId === 'wcf'
          ? 'emp-2002' : 'emp-2001',
      '2025-01-01',
    ),
  );
  records.push(leadSeed(
    'lead-dept-pia-technical-history', 'dept-pia-technical', 'emp-1001',
    '2024-01-01', '2024-12-31',
  ));
  return records;
}

let departments = seedDepartments();
let leadAssignments = seedLeadAssignments();

export function departmentRecords(): readonly DepartmentRecord[] { return departments; }
export function departmentById(id: string): DepartmentRecord | undefined {
  return departments.find((department) => department.id === id);
}
export function departmentForDivisionAndName(
  divisionId: string | null, name: string | null,
): DepartmentRecord | undefined {
  if (!divisionId || !name) return undefined;
  return departments.find((department) =>
    department.divisionId === divisionId && department.name.toLowerCase() === name.toLowerCase());
}
export function departmentLeadAssignments(): readonly DepartmentLeadAssignment[] {
  return leadAssignments;
}
export function leadHistoryForDepartment(departmentId: string): readonly DepartmentLeadAssignment[] {
  return leadAssignments.filter((assignment) => assignment.departmentId === departmentId)
    .slice().sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
}
export function effectiveLeadAssignment(
  departmentId: string, onDate: IsoDate,
): DepartmentLeadAssignment | undefined {
  return leadAssignments.find((assignment) =>
    assignment.departmentId === departmentId && assignment.effectiveFrom <= onDate &&
    (assignment.effectiveTo === null || assignment.effectiveTo >= onDate));
}
export function saveDepartmentRecord(record: DepartmentRecord): void {
  const exists = departments.some((department) => department.id === record.id);
  departments = exists
    ? departments.map((department) => department.id === record.id ? record : department)
    : [...departments, record];
}
export function saveDepartmentLeadAssignment(record: DepartmentLeadAssignment): void {
  const exists = leadAssignments.some((assignment) => assignment.id === record.id);
  leadAssignments = exists
    ? leadAssignments.map((assignment) => assignment.id === record.id ? record : assignment)
    : [...leadAssignments, record];
}
export function removeDepartmentRecord(id: string): void {
  departments = departments.filter((department) => department.id !== id);
}
export function resetDepartmentState(): void {
  departments = seedDepartments();
  leadAssignments = seedLeadAssignments();
}
