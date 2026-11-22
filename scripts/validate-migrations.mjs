import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'drizzle');
const recoveryRoot = join(root, 'recovery');
if (!existsSync(root)) throw new Error('Missing drizzle migration directory.');

const migrations = readdirSync(root)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
if (migrations.length === 0) throw new Error('No versioned migrations found.');

for (const [index, name] of migrations.entries()) {
  const version = name.slice(0, 4);
  const expected = String(index + 1).padStart(4, '0');
  if (version !== expected) throw new Error(`Migration sequence gap: expected ${expected}, found ${version}`);

  const sql = readFileSync(join(root, name), 'utf8');
  if (!/--\s*Recovery:/i.test(sql)) throw new Error(`Missing recovery reference: ${name}`);
  if (/\b(?:DROP\s+DATABASE|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i.test(sql)) {
    throw new Error(`Destructive statement is forbidden in a forward migration: ${name}`);
  }
  if (/\b(?:FLOAT|DOUBLE|REAL)\b/i.test(sql.replace(/^\s*--.*$/gm, ''))) {
    throw new Error(`Floating-point storage is forbidden: ${name}`);
  }

  const recovery = existsSync(recoveryRoot)
    ? readdirSync(recoveryRoot).find((candidate) => candidate.startsWith(`${version}_`) && candidate.endsWith('.sql'))
    : undefined;
  if (!recovery) throw new Error(`Missing recovery script for ${name}`);
  if (readFileSync(join(recoveryRoot, recovery), 'utf8').trim().length === 0) {
    throw new Error(`Recovery script is empty: ${recovery}`);
  }
}

const taskWorkMigration = readFileSync(join(root, '0011_task_work_log_cutover.sql'), 'utf8');
for (const required of [
  'time_capture_cutovers',
  'task_status_transitions',
  'migrated_clock_entry',
  'idempotency_key',
  'task_work_migration_reconciliation',
  'cutover-timer:',
  'task_status_transitions_no_update',
  'task_status_transitions_no_delete',
  'ix_work_log_employee_date',
  'ix_work_log_task_date',
]) {
  if (!taskWorkMigration.includes(required)) {
    throw new Error(`Migration 0011 is missing required invariant: ${required}`);
  }
}

const departmentMigration = readFileSync(join(root, '0013_department_hierarchy.sql'), 'utf8');
for (const required of [
  'uq_departments_division_name',
  'uq_departments_division_code',
  'uq_departments_id_division',
  'uq_department_lead_start',
  'uq_department_single_open_period',
  'fk_assignments_department FOREIGN KEY(department_id,division_id)',
  'department_migration_review',
  'department_migration_reconciliation',
  'mapped_assignment_count + unmapped_assignment_count = active_assignment_count',
  'employees_legacy_department_read_only',
  'assignment_legacy_lead_read_only',
]) {
  if (!departmentMigration.includes(required)) {
    throw new Error(`Migration 0013 is missing required invariant: ${required}`);
  }
}
if (/ALTER TABLE employees[\s\S]*?DROP COLUMN department/i.test(departmentMigration)) {
  throw new Error('Migration 0013 must keep the legacy employee department column (OH-BE-0115 removes it later).');
}
if (/UUID\(\)/i.test(departmentMigration.replace(/^\s*--.*$/gm, ''))) {
  throw new Error('Migration 0013 must derive deterministic ids so a rehearsal can be compared to the real run.');
}

const grantHardener = readFileSync(join(process.cwd(), 'scripts', 'db-harden-task-work-grants.mjs'), 'utf8');
if (!grantHardener.includes("table === 'task_status_transitions'") || !grantHardener.includes("table !== 'timer_sessions'")) {
  throw new Error('Runtime grant hardener must keep transitions insert-only and timers read-only.');
}
if (!grantHardener.includes("table.startsWith('department_migration_')")) {
  throw new Error('Runtime grant hardener must keep the department migration review tables read-only.');
}
if (!grantHardener.includes("table.startsWith('import_')")) {
  throw new Error('Runtime grant hardener must keep production import evidence read-only.');
}
if (!grantHardener.includes("table !== 'role_consolidation_migration_users'")) {
  throw new Error('Runtime grant hardener must keep role-consolidation evidence read-only.');
}

const importMigration = readFileSync(join(root, '0015_production_data_imports.sql'), 'utf8');
for (const required of [
  'import_batches',
  'uq_import_source',
  'import_rows',
  'import_approvals',
  'uq_import_active_approval',
  'import_crosswalks',
  'uq_import_crosswalk',
  'import_mutations',
  'committed_row_sha256',
  'reconciliation_json',
]) {
  if (!importMigration.includes(required)) {
    throw new Error(`Migration 0015 is missing required import invariant: ${required}`);
  }
}

const requisitionMigration = readFileSync(join(root, '0016_requisitions.sql'), 'utf8');
for (const required of [
  'requisitions',
  'requisition_in_house_details',
  'requisition_new_details',
  'requisition_reviews',
  'uq_requisition_reviewer_role',
  'chk_requisition_terminal',
  'requisition_reviews_no_update',
  'requisition_reviews_no_delete',
]) {
  if (!requisitionMigration.includes(required)) {
    throw new Error(`Migration 0016 is missing required requisition invariant: ${required}`);
  }
}

const conveyanceMigration = readFileSync(join(root, '0017_conveyance_claims.sql'), 'utf8');
for (const required of [
  'conveyance_claims', 'conveyance_reviews', 'receipt_attachment_id',
  'uq_conveyance_reviewer_role', 'chk_conveyance_mode_description',
  'chk_conveyance_terminal', 'conveyance_reviews_no_update', 'conveyance_reviews_no_delete',
]) {
  if (!conveyanceMigration.includes(required)) {
    throw new Error(`Migration 0017 is missing required conveyance invariant: ${required}`);
  }
}

const roleConsolidationMigration = readFileSync(join(root, '0018_finance_role_consolidation.sql'), 'utf8');
for (const required of [
  'role_consolidation_migration_users',
  'had_role_cost_permission',
  'had_personal_cost_grant',
  'created_hr_role_id',
  'created_cost_grant_id',
  "role_key='finance_manager'",
  "role_key='hr_manager'",
  "permission_key='finance.cost.view'",
  'role.finance_consolidated',
]) {
  if (!roleConsolidationMigration.includes(required)) {
    throw new Error(`Migration 0018 is missing required role-consolidation invariant: ${required}`);
  }
}
if (/UPDATE\s+(?:requisition_reviews|conveyance_reviews|audit_events)/i.test(roleConsolidationMigration)) {
  throw new Error('Migration 0018 must not rewrite recorded Finance-era history.');
}

console.log(`Migration validation passed: ${migrations.length} forward migration(s) and matching recovery scripts checked.`);
