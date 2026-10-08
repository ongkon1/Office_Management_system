/**
 * OH-BE-0110: the department migration review report.
 *
 * Prints what migration 0013 settled and what it refused to guess, from the
 * tables the migration wrote — never recomputed here, so the report cannot
 * disagree with what was actually applied. Read-only: it changes nothing, so it
 * is safe to run against production before and after a deployment, and it is
 * the evidence HR signs off before the later cutover migration removes the
 * legacy columns (OH-BE-0115).
 *
 * Usage: npm run db:department-report [-- --issues <type> --limit 50]
 */
import mysql from 'mysql2/promise';
import { migrationDatabaseUrl } from './db-lib.mjs';

const argumentOf = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const issueFilter = argumentOf('--issues');
const limit = Number(argumentOf('--limit') ?? 25);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
  throw new Error('--limit must be a whole number between 1 and 1000');
}

const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), timezone: 'Z' });
try {
  const [[applied]] = await connection.query(
    "SELECT COUNT(*) AS applied FROM schema_migrations WHERE version = '0013'",
  );
  if (!applied.applied) {
    throw new Error('Migration 0013 is not applied to this database.');
  }

  const [[totals]] = await connection.query(
    `SELECT legacy_combination_count,department_count,active_assignment_count,
            mapped_assignment_count,unmapped_assignment_count,lead_period_count,
            review_row_count,reconciled_at
     FROM department_migration_reconciliation WHERE id = 1`,
  );

  console.log('Department migration review (migration 0013)');
  console.log(`  reconciled at              ${totals.reconciled_at.toISOString?.() ?? totals.reconciled_at}`);
  console.log(`  legacy combinations found  ${totals.legacy_combination_count}`);
  console.log(`  departments created        ${totals.department_count}`);
  console.log(`  active assignments         ${totals.active_assignment_count}`);
  console.log(`  placed                     ${totals.mapped_assignment_count}`);
  console.log(`  awaiting placement         ${totals.unmapped_assignment_count}`);
  console.log(`  lead periods created       ${totals.lead_period_count}`);
  console.log(`  rows needing review        ${totals.review_row_count}`);

  /*
   * The arithmetic the migration's CHECK constraint already enforces, restated
   * here so a reader of the report can see it rather than trust it.
   */
  const placedPlusAwaiting = totals.mapped_assignment_count + totals.unmapped_assignment_count;
  console.log(
    `  reconciliation             ${placedPlusAwaiting} = ${totals.active_assignment_count} ${
      placedPlusAwaiting === totals.active_assignment_count ? 'OK' : 'MISMATCH'
    }`,
  );

  /*
   * The block above is the migration's own record, frozen at the instant it
   * ran. Administration and seeding move on from it, so the live counts are
   * printed beside it — a report that shows only the frozen numbers reads as
   * though nothing has been placed since.
   */
  const [[live]] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM departments) AS departments,
       (SELECT COUNT(*) FROM departments WHERE is_active = FALSE) AS inactive_departments,
       (SELECT COUNT(*) FROM employee_division_assignments WHERE is_active = TRUE) AS active_assignments,
       (SELECT COUNT(*) FROM employee_division_assignments WHERE is_active = TRUE AND department_id IS NOT NULL) AS placed,
       (SELECT COUNT(*) FROM department_lead_assignments WHERE effective_to IS NULL AND effective_from <= CURRENT_DATE) AS leads_in_force,
       (SELECT COUNT(*) FROM department_lead_assignments WHERE effective_from > CURRENT_DATE) AS leads_scheduled,
       (SELECT COUNT(*) FROM employees WHERE department IS NOT NULL AND TRIM(department) <> '') AS legacy_values_remaining`,
  );
  console.log('\nToday');
  console.log(`  departments                ${live.departments} (${live.inactive_departments} inactive)`);
  console.log(`  active assignments placed  ${live.placed} of ${live.active_assignments}`);
  console.log(`  appointments in force      ${live.leads_in_force}`);
  console.log(`  appointments scheduled     ${live.leads_scheduled}`);
  console.log(`  legacy values still stored ${live.legacy_values_remaining} (frozen, removed in the later cutover)`);

  const [byType] = await connection.query(
    'SELECT issue_type, COUNT(*) AS count FROM department_migration_review GROUP BY issue_type ORDER BY count DESC',
  );
  console.log('\nBy issue type');
  if (byType.length === 0) console.log('  nothing needs review');
  for (const row of byType) console.log(`  ${String(row.issue_type).padEnd(28)} ${row.count}`);

  const [rows] = await connection.query(
    `SELECT r.issue_type,r.detail,r.legacy_value,
            d.name AS division_name,dep.name AS department_name,
            e.employee_code,e.display_name,r.assignment_id
     FROM department_migration_review r
     LEFT JOIN divisions d ON d.id = r.division_id
     LEFT JOIN departments dep ON dep.id = r.department_id
     LEFT JOIN employees e ON e.id = r.employee_id
     ${issueFilter ? 'WHERE r.issue_type = ?' : ''}
     ORDER BY r.issue_type, r.id
     LIMIT ${limit}`,
    issueFilter ? [issueFilter] : [],
  );

  console.log(`\nRows${issueFilter ? ` (${issueFilter})` : ''}, first ${limit}`);
  if (rows.length === 0) console.log('  none');
  for (const row of rows) {
    const subject = [
      row.division_name ? `division ${row.division_name}` : null,
      row.department_name ? `department ${row.department_name}` : null,
      row.employee_code ? `${row.employee_code} ${row.display_name}` : null,
      row.legacy_value ? `legacy "${row.legacy_value}"` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    console.log(`  [${row.issue_type}] ${subject}`);
    console.log(`      ${row.detail}`);
  }

  if (totals.unmapped_assignment_count > 0) {
    console.log(
      '\nEvery assignment awaiting placement keeps working and is excluded from department scope until a Super Administrator places it.',
    );
  }
} finally {
  await connection.end();
}
