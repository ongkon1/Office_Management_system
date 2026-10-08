import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { hashPassword } from 'better-auth/crypto';
import { migrationDatabaseUrl } from './db-lib.mjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is prohibited in production');
}

// Seeding is a privileged, non-production bootstrap operation. The restricted
// runtime identity intentionally cannot populate trigger-protected history.
const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), multipleStatements: true, timezone: 'Z' });
try {
  await connection.beginTransaction();
  await connection.query(readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'));
  const demoHash = await hashPassword('Demo1234!');
  // Reset credentials only for the deterministic accounts created by this
  // development seed. Selecting every row from `users` changed passwords for
  // accounts an administrator created through the application.
  await connection.query(`INSERT INTO auth_accounts(id,user_id,provider_id,account_id,password_hash)
    SELECT UUID(),id,'credential',email_normalized,? FROM users
    WHERE id IN (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000007',
      '30000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000009',
      '30000000-0000-4000-8000-000000000010',
      '30000000-0000-4000-8000-000000000011'
    )
    ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)`, [demoHash]);
  await connection.commit();
  console.log('Deterministic development seed applied.');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
