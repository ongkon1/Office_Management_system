import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import mysql from 'mysql2/promise';

export const migrationRoot = join(process.cwd(), 'drizzle');

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value?.startsWith('mysql://')) throw new Error('DATABASE_URL must be a MySQL URL');
  return value;
}

export function migrationDatabaseUrl() {
  const value = process.env.DATABASE_MIGRATION_URL;
  if (!value?.startsWith('mysql://')) throw new Error('DATABASE_MIGRATION_URL must be a MySQL URL');
  return value;
}

export function migrationFiles() {
  return readdirSync(migrationRoot)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, path: join(migrationRoot, name), version: name.slice(0, 4) }));
}

export function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export async function migrationConnection() {
  const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), multipleStatements: true, timezone: 'Z' });
  await connection.query("SET time_zone = '+00:00'");
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version CHAR(4) PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
  ) ENGINE=InnoDB`);
  return connection;
}

export async function appliedMigrations(connection) {
  const [rows] = await connection.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
  return new Map(rows.map((row) => [row.version, row]));
}

export function migrationContents(file) {
  return readFileSync(file.path, 'utf8');
}

export function displayName(file) {
  return basename(file.path);
}
