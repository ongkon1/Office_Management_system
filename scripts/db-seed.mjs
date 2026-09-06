import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { hashPassword } from 'better-auth/crypto';
import { databaseUrl } from './db-lib.mjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is prohibited in production');
}

const connection = await mysql.createConnection({ uri: databaseUrl(), multipleStatements: true, timezone: 'Z' });
try {
  await connection.beginTransaction();
  await connection.query(readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'));
  const demoHash = await hashPassword('Demo1234!');
  await connection.query(`INSERT INTO auth_accounts(id,user_id,provider_id,account_id,password_hash)
    SELECT UUID(),id,'credential',email_normalized,? FROM users
    ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)`, [demoHash]);
  await connection.commit();
  console.log('Deterministic development seed applied.');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
