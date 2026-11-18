import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveImport,
  commitImport,
  dryRunImport,
  importRejections,
  rollbackImport,
  sha256,
} from '../../../scripts/import-engine.mjs';
import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';

const ADMIN_ID = '30000000-0000-4000-8000-000000000001';
const RELEASE_ID = 'be-0912-integration';
const SOURCE_SYSTEM = 'owner-rehearsal-test';

let database: IsolatedDatabase | undefined;

function csv(headers: readonly string[], values: readonly string[][]): Buffer {
  const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return Buffer.from(`${headers.join(',')}\n${values.map((row) => row.map(cell).join(',')).join('\n')}\n`, 'utf8');
}

function manifest(dataset: string, source: Buffer) {
  return {
    releaseId: RELEASE_ID,
    dataset,
    mappingVersion: 'be-0911-v1',
    sourceSystem: SOURCE_SYSTEM,
    sourceFileName: `${dataset}.csv`,
    sourceCutoffDate: '2026-11-02',
    declaredRowCount: source.toString('utf8').trim().split('\n').length - 1,
    sha256: sha256(source),
    sensitivity: dataset === 'cost_rates' ? 'financial' : dataset === 'employees' || dataset === 'leave_balances' ? 'restricted' : 'internal',
    actorUserId: ADMIN_ID,
    owner: 'Integration owner',
    ownerUserId: ADMIN_ID,
    steward: 'Integration steward',
    ...(dataset === 'cost_rates' ? { costPrecedence: 'project, then division, then employee' } : {}),
  };
}

const requiredScopes: Record<string, readonly string[]> = {
  employees: ['owner', 'hr', 'technical'],
  divisions: ['owner', 'technical'],
  assignments: ['owner', 'hr', 'technical'],
  holidays: ['owner', 'hr', 'technical'],
  leave_balances: ['owner', 'hr', 'technical'],
  projects: ['owner', 'division', 'technical'],
  tasks: ['owner', 'division', 'technical'],
  cost_rates: ['owner', 'financial', 'technical'],
  opening_periods: ['owner', 'hr', 'technical'],
};

async function importDataset(dataset: string, source: Buffer) {
  if (!database) throw new Error('Database not initialized.');
  const sourceManifest = manifest(dataset, source);
  const dryRun = await dryRunImport(database.connection, sourceManifest, source);
  expect(dryRun.state).toBe('ready_for_approval');
  expect(dryRun.counts.rejected).toBe(0);
  for (const scope of requiredScopes[dataset]) {
    await approveImport(database.connection, {
      batchId: dryRun.batchId,
      scope,
      actorUserId: ADMIN_ID,
      reason: `${scope} approval for integration rehearsal`,
    });
  }
  const committed = await commitImport(database.connection, sourceManifest, source, ADMIN_ID);
  expect(committed.state).toBe('committed');
  expect(committed.committed).toBe(sourceManifest.declaredRowCount);
  return { batchId: dryRun.batchId, manifest: sourceManifest, source };
}

beforeAll(async () => {
  database = await createIsolatedDatabase();
  await database.connection.query(readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'));
}, 60_000);

afterAll(async () => {
  await database?.dispose();
});

describe('BE-0912 production data imports', () => {
  it('dry-runs, approves, commits, reruns and safely rolls back every dataset family', async () => {
    if (!database) throw new Error('Database not initialized.');
    const sources = {
      employees: csv(
        ['employee_code', 'display_name', 'work_email', 'hire_date', 'employment_type', 'status', 'role_key', 'role_effective_from'],
        [
          ['IMP-001', 'Imported Employee', 'imported.employee@example.test', '2026-11-01', 'full_time', 'active', 'employee', '2026-11-01'],
          ['IMP-TL', 'Imported Team Lead', 'imported.lead@example.test', '2026-11-01', 'full_time', 'active', 'team_lead', '2026-11-01'],
        ],
      ),
      divisions: csv(
        ['division_key', 'name', 'is_government', 'is_active'],
        [['import-division', 'Import Division', 'false', 'true']],
      ),
      assignments: csv(
        ['employee_code', 'division_key', 'department_code', 'department_name', 'effective_from', 'allocation_percent', 'expected_weekly_minutes', 'is_primary', 'is_temporary', 'is_active'],
        [
          ['IMP-TL', 'import-division', 'TECH', 'Technical', '2026-11-01', '100.00', '2100', 'true', 'false', 'true'],
          ['IMP-001', 'import-division', 'TECH', 'Technical', '2026-11-01', '100.00', '2100', 'true', 'false', 'true'],
        ],
      ),
      holidays: csv(
        ['calendar_key', 'calendar_name', 'calendar_effective_from', 'holiday_date', 'holiday_name', 'portion', 'is_active', 'division_key'],
        [['import-calendar', 'Import Division 2027', '2027-01-01', '2027-02-21', 'Language Day', 'full_day', 'true', 'import-division']],
      ),
      leave_balances: csv(
        ['employee_code', 'leave_type_key', 'leave_type_name', 'is_paid', 'requires_attachment', 'leave_type_is_active', 'year', 'entitled_minutes', 'used_minutes', 'reserved_minutes', 'unit_minutes', 'balance_cutoff_date'],
        [['IMP-001', 'import-annual', 'Imported Annual Leave', 'true', 'false', 'true', '2027', '8400', '0', '0', '420', '2026-11-02']],
      ),
      projects: csv(
        ['project_code', 'division_key', 'name', 'status', 'priority', 'estimated_minutes', 'completion_percent', 'accepts_time_entries', 'is_active', 'manager_employee_code', 'member_employee_codes'],
        [['IMP-PRJ', 'import-division', 'Imported Project', 'active', 'high', '6000', '0', 'true', 'true', 'IMP-TL', 'IMP-001']],
      ),
      tasks: csv(
        ['source_task_key', 'project_code', 'title', 'creator_employee_code', 'creator_role', 'status', 'review_state', 'priority', 'estimated_minutes', 'is_active', 'assignee_employee_code'],
        [['owner-task-001', 'IMP-PRJ', 'Imported task', 'IMP-TL', 'team_lead', 'pending', 'not_required', 'medium', '480', 'true', 'IMP-001']],
      ),
      cost_rates: csv(
        ['source_rate_key', 'rate_amount', 'currency', 'rate_unit', 'effective_from', 'is_active', 'employee_code', 'division_key', 'project_code'],
        [['owner-rate-001', '1250.0000', 'BDT', 'hour', '2026-11-01', 'true', 'IMP-001', 'import-division', 'IMP-PRJ']],
      ),
      opening_periods: csv(
        ['timesheet_period_label', 'payroll_period_label', 'start_date', 'end_date', 'timesheet_status', 'payroll_status', 'policy_key', 'policy_version'],
        [['January 2027 Timesheets', 'January 2027 Payroll', '2027-01-01', '2027-01-31', 'open', 'open', 'standard-day', '1']],
      ),
    };

    const committed = [];
    for (const [dataset, source] of Object.entries(sources)) committed.push(await importDataset(dataset, source));

    const [batches] = await database.connection.query<import('mysql2/promise').RowDataPacket[]>("SELECT COUNT(*) count FROM import_batches WHERE release_id=? AND state='committed'", [RELEASE_ID]);
    const [crosswalks] = await database.connection.query<import('mysql2/promise').RowDataPacket[]>('SELECT COUNT(*) count FROM import_crosswalks WHERE source_system=? AND rolled_back_at IS NULL', [SOURCE_SYSTEM]);
    const [audits] = await database.connection.query<import('mysql2/promise').RowDataPacket[]>("SELECT COUNT(*) count FROM audit_events WHERE action='import.batch.committed' AND scope_json->>'$.releaseId'=?", [RELEASE_ID]);
    expect(Number(batches[0].count)).toBe(9);
    expect(Number(crosswalks[0].count)).toBe(11);
    expect(Number(audits[0].count)).toBe(9);

    const repeated = await commitImport(database.connection, committed[0].manifest, committed[0].source, ADMIN_ID);
    expect(repeated).toMatchObject({ state: 'committed', idempotent: true });

    for (const item of committed.reverse()) {
      const rolledBack = await rollbackImport(database.connection, {
        batchId: item.batchId,
        actorUserId: ADMIN_ID,
        reason: 'Integration rehearsal cleanup',
        confirmation: item.batchId,
      });
      expect(rolledBack.state).toBe('rolled_back');
    }

    const [remaining] = await database.connection.query<import('mysql2/promise').RowDataPacket[]>("SELECT COUNT(*) count FROM employees WHERE employee_code='IMP-001'");
    const [rolledBackCrosswalks] = await database.connection.query<import('mysql2/promise').RowDataPacket[]>('SELECT COUNT(*) count FROM import_crosswalks WHERE source_system=? AND rolled_back_at IS NOT NULL', [SOURCE_SYSTEM]);
    expect(Number(remaining[0].count)).toBe(0);
    expect(Number(rolledBackCrosswalks[0].count)).toBe(11);
  }, 60_000);

  it('rejects conflicting duplicate natural keys and emits safe corrective evidence', async () => {
    if (!database) throw new Error('Database not initialized.');
    const source = csv(
      ['division_key', 'name', 'is_government', 'is_active'],
      [
        ['duplicate-division', 'First Name', 'false', 'true'],
        ['duplicate-division', 'Conflicting Name', 'false', 'true'],
      ],
    );
    const result = await dryRunImport(database.connection, manifest('divisions', source), source);
    expect(result).toMatchObject({ state: 'dry_run_failed', counts: { received: 2, accepted: 0, rejected: 2 } });
    const rejections = await importRejections(database.connection, result.batchId, ADMIN_ID);
    expect(rejections).toHaveLength(2);
    expect(rejections.every((row: { error_code: string }) => row.error_code === 'DUPLICATE_CONFLICT')).toBe(true);
    expect(JSON.stringify(rejections)).not.toContain('First Name');
    expect(JSON.stringify(rejections)).not.toContain('Conflicting Name');
  });

  it('invalidates stale dry runs and refuses rollback after a committed row changes', async () => {
    if (!database) throw new Error('Database not initialized.');
    const staleSource = csv(
      ['division_key', 'name', 'is_government', 'is_active'],
      [['stale-division', 'Stale Division', 'false', 'true']],
    );
    const staleManifest = { ...manifest('divisions', staleSource), releaseId: 'be-0912-stale-test' };
    const staleDryRun = await dryRunImport(database.connection, staleManifest, staleSource);
    for (const scope of requiredScopes.divisions) await approveImport(database.connection, { batchId: staleDryRun.batchId, scope, actorUserId: ADMIN_ID, reason: 'Stale snapshot test approval' });
    const interveningId = randomUUID();
    await database.connection.execute('INSERT INTO divisions(id,division_key,name,is_government,is_active) VALUES(?,?,?,FALSE,TRUE)', [interveningId, 'intervening-division', 'Intervening Division']);
    await expect(commitImport(database.connection, staleManifest, staleSource, ADMIN_ID)).rejects.toThrow(/STALE_DRY_RUN/);
    await database.connection.execute('DELETE FROM divisions WHERE id=?', [interveningId]);

    const guardedSource = csv(
      ['division_key', 'name', 'is_government', 'is_active'],
      [['guarded-division', 'Guarded Division', 'false', 'true']],
    );
    const guardedManifest = { ...manifest('divisions', guardedSource), releaseId: 'be-0912-guarded-rollback' };
    const dryRun = await dryRunImport(database.connection, guardedManifest, guardedSource);
    for (const scope of requiredScopes.divisions) await approveImport(database.connection, { batchId: dryRun.batchId, scope, actorUserId: ADMIN_ID, reason: 'Guarded rollback test approval' });
    await commitImport(database.connection, guardedManifest, guardedSource, ADMIN_ID);
    await database.connection.execute("UPDATE divisions SET name='Changed after import' WHERE division_key='guarded-division'");
    await expect(rollbackImport(database.connection, { batchId: dryRun.batchId, actorUserId: ADMIN_ID, reason: 'Must not erase later edits', confirmation: dryRun.batchId })).rejects.toThrow(/changed after commit/);

    const invalidManifest = { ...manifest('divisions', guardedSource), sha256: '0'.repeat(64), releaseId: 'be-0912-bad-checksum' };
    await expect(dryRunImport(database.connection, invalidManifest, guardedSource)).rejects.toThrow(/CHECKSUM_MISMATCH/);

    const unsafeSource = csv(
      ['division_key', 'name', 'is_government', 'is_active'],
      [['unsafe-division', '=HYPERLINK("https://invalid.test")', 'false', 'true']],
    );
    await expect(dryRunImport(database.connection, { ...manifest('divisions', unsafeSource), releaseId: 'be-0912-unsafe-source' }, unsafeSource)).rejects.toThrow(/UNSAFE_CONTENT/);
  });
});
