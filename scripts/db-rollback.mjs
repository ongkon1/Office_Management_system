import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { migrationDatabaseUrl } from './db-lib.mjs';

const targetIndex = process.argv.indexOf('--to');
const version = targetIndex >= 0 ? process.argv[targetIndex + 1] : undefined;
if (!version || !/^\d{4}$/.test(version)) throw new Error('Usage: npm run db:rollback -- --to 0001');
const recoveryDirectory = join(process.cwd(), 'drizzle', 'recovery');
const recoveryName = existsSync(recoveryDirectory)
  ? readdirSync(recoveryDirectory).find((name) => name.startsWith(`${version}_`) && name.endsWith('.sql'))
  : undefined;
if (!recoveryName) throw new Error(`No explicit recovery script for ${version}`);
const recoveryPath = join(recoveryDirectory, recoveryName);
if (process.env.ALLOW_DESTRUCTIVE_RECOVERY !== 'confirmed-empty-schema') {
  throw new Error('Set ALLOW_DESTRUCTIVE_RECOVERY=confirmed-empty-schema only after verifying the target');
}
const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), multipleStatements: true, timezone: 'Z' });
try {
  await connection.query(readFileSync(recoveryPath, 'utf8'));
  await connection.execute('DELETE FROM schema_migrations WHERE version >= ?', [version]);
} finally {
  await connection.end();
}
