import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterEach, describe, expect, it } from 'vitest';
import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';

const USER = '30000000-0000-4000-8000-000000000005';
const EMPLOYEE = '40000000-0000-4000-8000-000000000005';
const FINANCE_ROLE = '20000000-0000-4000-8000-000000000005';
const HR_ROLE = '20000000-0000-4000-8000-000000000004';
const COST_PERMISSION = '21000000-0000-4000-8000-000000000004';

let database: IsolatedDatabase | undefined;
afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

async function legacyFinanceDatabase() {
  database = await createIsolatedDatabase({ throughVersion: '0017' });
  await database.connection.query(
    readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'),
  );
  await database.connection.query(`
    DELETE FROM scoped_grants WHERE user_id='${USER}' AND permission_id='${COST_PERMISSION}';
    DELETE FROM user_roles WHERE user_id='${USER}';
    UPDATE roles SET is_active=TRUE WHERE id='${FINANCE_ROLE}';
    INSERT INTO user_roles(id,user_id,role_id,effective_from)
    VALUES('12000000-0000-4000-8000-000000000001','${USER}','${FINANCE_ROLE}','2026-01-01');
    INSERT INTO requisition_reviews(id,requisition_id,reviewer_user_id,reviewer_employee_id,reviewer_role,stage,outcome,reason,decided_at_utc)
    VALUES('12000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000002','${USER}','${EMPLOYEE}','finance_manager','reviewer_review','approved',NULL,'2026-11-15 05:00:00');
    INSERT INTO conveyance_reviews(id,claim_id,reviewer_user_id,reviewer_employee_id,reviewer_role,stage,outcome,reason,decided_at_utc)
    VALUES('12000000-0000-4000-8000-000000000003','25100000-0000-4000-8000-000000000002','${USER}','${EMPLOYEE}','finance_manager','reviewer_review','approved',NULL,'2026-11-15 05:00:00');
    INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,after_protected)
    VALUES('12000000-0000-4000-8000-000000000004','${USER}','finance.review.recorded','requisition','24000000-0000-4000-8000-000000000002',JSON_OBJECT(),'Legacy Finance decision','12000000-0000-4000-8000-000000000005',JSON_OBJECT('actorRole','finance_manager'));
  `);
  return database;
}

describe('BE-1202 Finance Manager to HR migration', () => {
  it('retires assignment, preserves cost access exactly, audits the cutover and leaves history unchanged', async () => {
    const target = await legacyFinanceDatabase();
    const [[beforeHistory]] = await target.connection.query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM requisition_reviews WHERE reviewer_role='finance_manager') requisitions,
        (SELECT COUNT(*) FROM conveyance_reviews WHERE reviewer_role='finance_manager') conveyance,
        (SELECT COUNT(*) FROM audit_events WHERE JSON_UNQUOTE(JSON_EXTRACT(after_protected,'$.actorRole'))='finance_manager') audits
    `);

    await target.connection.query(
      readFileSync(join(process.cwd(), 'drizzle', '0018_finance_role_consolidation.sql'), 'utf8'),
    );

    const [[financeRole]] = await target.connection.query<RowDataPacket[]>(
      "SELECT is_active FROM roles WHERE role_key='finance_manager'",
    );
    expect(Boolean(financeRole.is_active)).toBe(false);

    const [activeRoles] = await target.connection.query<RowDataPacket[]>(`
      SELECT r.role_key FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=? AND r.is_active=TRUE
        AND ur.effective_from<=CURRENT_DATE AND (ur.effective_to IS NULL OR ur.effective_to>=CURRENT_DATE)
    `, [USER]);
    expect(activeRoles.map((row) => row.role_key)).toEqual(['hr_manager']);

    const [[preservedGrant]] = await target.connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) count FROM scoped_grants sg JOIN permissions p ON p.id=sg.permission_id
      WHERE sg.user_id=? AND p.permission_key='finance.cost.view'
        AND sg.division_id IS NULL AND sg.project_id IS NULL
    `, [USER]);
    expect(Number(preservedGrant.count)).toBe(1);

    const [[ordinaryHrGrant]] = await target.connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) count FROM scoped_grants sg JOIN permissions p ON p.id=sg.permission_id
      WHERE sg.user_id='30000000-0000-4000-8000-000000000004' AND p.permission_key='finance.cost.view'
    `);
    expect(Number(ordinaryHrGrant.count)).toBe(0);

    const [[hrRoleGrant]] = await target.connection.query<RowDataPacket[]>(`
      SELECT COUNT(*) count FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=? AND p.permission_key='finance.cost.view'
    `, [HR_ROLE]);
    expect(Number(hrRoleGrant.count)).toBe(0);

    const [[afterHistory]] = await target.connection.query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM requisition_reviews WHERE reviewer_role='finance_manager') requisitions,
        (SELECT COUNT(*) FROM conveyance_reviews WHERE reviewer_role='finance_manager') conveyance,
        (SELECT COUNT(*) FROM audit_events WHERE JSON_UNQUOTE(JSON_EXTRACT(after_protected,'$.actorRole'))='finance_manager') audits
    `);
    expect(afterHistory).toEqual(beforeHistory);

    const [[audit]] = await target.connection.query<RowDataPacket[]>(
      "SELECT actor_user_id,reason,before_protected,after_protected FROM audit_events WHERE action='role.finance_consolidated' AND resource_id=?",
      [USER],
    );
    expect(audit.actor_user_id).toBeNull();
    expect(String(audit.reason)).toContain('existing cost access preserved');
    const json = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
    expect(json(audit.before_protected)).toMatchObject({ activeRole: 'finance_manager', hadFinanceCostView: true });
    expect(json(audit.after_protected)).toMatchObject({ activeRole: 'hr_manager', financeManagerAssignable: false, financeCostViewPreserved: true });
  });

  it('reverses only migration-created access while keeping Finance-era records readable', async () => {
    const target = await legacyFinanceDatabase();
    await target.connection.query(readFileSync(join(process.cwd(), 'drizzle', '0018_finance_role_consolidation.sql'), 'utf8'));
    await target.connection.query(readFileSync(join(process.cwd(), 'drizzle', 'recovery', '0018_finance_role_consolidation.sql'), 'utf8'));

    const [[role]] = await target.connection.query<RowDataPacket[]>(
      "SELECT is_active FROM roles WHERE role_key='finance_manager'",
    );
    expect(Boolean(role.is_active)).toBe(true);
    const [[hrAssignments]] = await target.connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) count FROM user_roles WHERE user_id=? AND role_id=?', [USER, HR_ROLE],
    );
    expect(Number(hrAssignments.count)).toBe(0);
    const [[costGrants]] = await target.connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) count FROM scoped_grants WHERE user_id=? AND permission_id=?', [USER, COST_PERMISSION],
    );
    expect(Number(costGrants.count)).toBe(0);
    const [[history]] = await target.connection.query<RowDataPacket[]>(`
      SELECT
        (SELECT reviewer_role FROM requisition_reviews WHERE id='12000000-0000-4000-8000-000000000002') requisition_role,
        (SELECT reviewer_role FROM conveyance_reviews WHERE id='12000000-0000-4000-8000-000000000003') conveyance_role
    `);
    expect(history).toEqual({ requisition_role: 'finance_manager', conveyance_role: 'finance_manager' });
  });
});

