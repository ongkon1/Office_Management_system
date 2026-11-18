import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const MAGIC = Buffer.from('OMSBAK01');
const urlValue = process.env.DATABASE_MIGRATION_URL;
const directoryValue = process.env.BACKUP_DIRECTORY;
const keyValue = process.env.BACKUP_ENCRYPTION_KEY;
if (!urlValue?.startsWith('mysql://')) throw new Error('DATABASE_MIGRATION_URL must be configured.');
if (!directoryValue) throw new Error('BACKUP_DIRECTORY must name the protected backup destination.');
if (!keyValue) throw new Error('BACKUP_ENCRYPTION_KEY must be base64-encoded 32-byte key material.');
const key = Buffer.from(keyValue, 'base64');
if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.');

async function fileSha256(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('data', (chunk) => hash.update(chunk));
  await once(stream, 'end');
  return hash.digest('hex');
}

const url = new URL(urlValue);
const directory = resolve(directoryValue);
await mkdir(directory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outputPath = resolve(directory, `office-management-${stamp}.sql.enc`);
if (!outputPath.startsWith(`${directory}\\`) && !outputPath.startsWith(`${directory}/`)) throw new Error('Backup path escaped its destination.');

const connection = await mysql.createConnection({ uri: urlValue, decimalNumbers: false, timezone: 'Z' });
const tables = ['users', 'employees', 'employee_division_assignments', 'projects', 'tasks', 'time_entries', 'audit_events', 'export_jobs'];
const counts = {};
try {
  for (const table of tables) {
    const [rows] = await connection.query(`SELECT COUNT(*) count FROM \`${table}\``);
    counts[table] = Number(rows[0].count);
  }
  const [migrationRows] = await connection.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  counts.schemaMigration = migrationRows[0]?.version ?? null;
} finally {
  await connection.end();
}

const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
output.write(MAGIC);
output.write(iv);
const stderr = [];
const dump = spawn(process.env.MYSQLDUMP_BINARY ?? 'mysqldump', [
  '--single-transaction', '--routines', '--events', '--triggers', '--hex-blob', '--skip-comments',
  '-h', url.hostname, '-P', url.port || '3306', '-u', decodeURIComponent(url.username), url.pathname.slice(1),
], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['ignore', 'pipe', 'pipe'] });
dump.stderr.on('data', (chunk) => { if (stderr.join('').length < 4_000) stderr.push(String(chunk)); });
dump.stdout.pipe(cipher).pipe(output, { end: false });
const [exitCode] = await once(dump, 'exit');
if (exitCode !== 0) {
  output.destroy();
  await unlink(outputPath).catch(() => undefined);
  throw new Error(`mysqldump failed (${exitCode}): ${stderr.join('').slice(0, 500)}`);
}
await once(cipher, 'end');
output.write(cipher.getAuthTag());
output.end();
await once(output, 'close');

const bytes = await stat(outputPath);
const manifest = {
  format: 'OMSBAK01',
  createdAt: new Date().toISOString(),
  deploymentVersion: process.env.DEPLOYMENT_VERSION ?? 'unknown',
  databaseNameHash: createHash('sha256').update(url.pathname.slice(1)).digest('hex'),
  encryptedFile: basename(outputPath),
  encryptedBytes: bytes.size,
  sha256: await fileSha256(outputPath),
  reconciliation: counts,
};
await writeFile(`${outputPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ outcome: 'success', encryptedFile: basename(outputPath), encryptedBytes: bytes.size, reconciliation: counts }));

