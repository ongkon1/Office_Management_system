import { EMPLOYEES } from '@/fixtures/hr';

export interface DepartmentRecord {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly employeeCount: number;
}

const SEEDED_CODES: Readonly<Record<string, string>> = {
  Delivery: 'DLV',
  Engineering: 'ENG',
  Executive: 'EXEC',
  Finance: 'FIN',
  IT: 'IT',
  People: 'PPL',
  Production: 'PROD',
  Training: 'TRN',
};

function idFor(name: string): string {
  return `dept-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

function seedDepartments(): DepartmentRecord[] {
  const counts = new Map<string, number>();
  for (const employee of EMPLOYEES) {
    if (!employee.department) continue;
    counts.set(employee.department, (counts.get(employee.department) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, employeeCount]) => ({
      id: idFor(name),
      name,
      code: SEEDED_CODES[name] ?? name.slice(0, 4).toUpperCase(),
      description: null,
      employeeCount,
    }));
}

let departments = seedDepartments();

export function departmentRecords(): readonly DepartmentRecord[] {
  return departments;
}

export function departmentByName(name: string): DepartmentRecord | undefined {
  return departments.find((department) => department.name.toLowerCase() === name.toLowerCase());
}

export function saveDepartmentRecord(record: DepartmentRecord): void {
  const exists = departments.some((department) => department.id === record.id);
  departments = exists
    ? departments.map((department) => (department.id === record.id ? record : department))
    : [...departments, record];
}

export function removeDepartmentRecord(id: string): void {
  departments = departments.filter((department) => department.id !== id);
}

export function recordEmployeeDepartmentChange(
  previousDepartment: string | null,
  nextDepartment: string | null,
): void {
  if (previousDepartment === nextDepartment) return;
  departments = departments.map((department) => {
    if (department.name === previousDepartment) {
      return { ...department, employeeCount: Math.max(0, department.employeeCount - 1) };
    }
    if (department.name === nextDepartment) {
      return { ...department, employeeCount: department.employeeCount + 1 };
    }
    return department;
  });
}

export function resetDepartmentState(): void {
  departments = seedDepartments();
}
