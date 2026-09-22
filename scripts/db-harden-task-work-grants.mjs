import mysql from 'mysql2/promise';
import { migrationDatabaseUrl } from './db-lib.mjs';

const accounts = (process.env.RUNTIME_DATABASE_ACCOUNTS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const protectedDatabaseUsers = new Set([
  'root',
  'mysql.infoschema',
  'mysql.session',
  'mysql.sys',
]);

if (accounts.length === 0) {
  throw new Error('RUNTIME_DATABASE_ACCOUNTS must list runtime accounts as user@host.');
}

function quoteIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

function quoteAccount(value) {
  const match = /^([a-zA-Z0-9_]+)@([a-zA-Z0-9_.%-]+)$/.exec(value);
  if (!match) throw new Error(`Invalid runtime account: ${value}`);
  if (protectedDatabaseUsers.has(match[1])) {
    throw new Error(`Refusing to modify protected database account: ${value}`);
  }
  return `'${match[1]}'@'${match[2]}'`;
}

// Validate every target before opening a connection or changing any grants.
const quotedAccounts = accounts.map((value) => ({ value, quoted: quoteAccount(value) }));
const migrationUrl = migrationDatabaseUrl();
const url = new URL(migrationUrl);
const migrationUsername = decodeURIComponent(url.username);
if (quotedAccounts.some(({ value }) => value.split('@', 1)[0] === migrationUsername)) {
  throw new Error('The migration account cannot also be a runtime-hardening target.');
}
const database = decodeURIComponent(url.pathname.slice(1));
const databaseName = quoteIdentifier(database);
const connection = await mysql.createConnection({ uri: migrationUrl, timezone: 'Z' });

try {
  const [rows] = await connection.query(
    `SELECT table_name AS tableName FROM information_schema.tables
     WHERE table_schema=? AND table_type='BASE TABLE' ORDER BY table_name`,
    [database],
  );
  const tables = rows.map((row) => String(row.tableName));
  for (const required of ['task_status_transitions', 'timer_sessions']) {
    if (!tables.includes(required)) throw new Error(`Migration 0011 is not applied: missing ${required}`);
  }

  for (const { quoted: account } of quotedAccounts) {
    await connection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account}`);
    await connection.query(`GRANT SELECT ON ${databaseName}.* TO ${account}`);

    for (const table of tables) {
      const target = `${databaseName}.${quoteIdentifier(table)}`;
      if (table === 'task_status_transitions') {
        await connection.query(`GRANT INSERT ON ${target} TO ${account}`);
      } else if (
        table !== 'timer_sessions' &&
        !table.startsWith('task_work_migration_') &&
        table !== 'time_capture_cutovers' &&
        table !== 'schema_migrations'
      ) {
        await connection.query(`GRANT INSERT, UPDATE, DELETE ON ${target} TO ${account}`);
      }
    }
  }

  console.log(
    `Hardened ${accounts.length} runtime account(s): task transitions are insert-only and timer sessions are read-only.`,
  );
} finally {
  await connection.end();
}
