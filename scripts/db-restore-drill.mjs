import { createDecipheriv, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const MAGIC = Buffer.from('OMSBAK01');
const source = resolve(process.env.RESTORE_BACKUP_FILE ?? '');
const targetValue = process.env.RESTORE_DATABASE_URL;
const runtimeValue = process.env.DATABASE_URL;
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? '', 'base64');
if (!source || !targetValue?.startsWith('mysql://')) throw new Error('RESTORE_BACKUP_FILE and RESTORE_DATABASE_URL are required.');
if (targetValue === runtimeValue) throw new Error('Restore drill refuses the runtime database URL.');
const target = new URL(targetValue);
const database = target.pathname.slice(1);
if (!/(?:restore|recovery|drill|isolated)/i.test(database)) throw new Error('Restore target database name must explicitly identify an isolated restore/drill environment.');
if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes.');

async function fileSha256(path) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  stream.on('data', (chunk) => hash.update(chunk));
  await once(stream, 'end');
  return hash.digest('hex');
}

const info = await stat(source);
if (info.size <= MAGIC.length + 12 + 16) throw new Error('Backup file is incomplete.');
const handle = await open(source, 'r');
const header = Buffer.alloc(MAGIC.length + 12);
const tag = Buffer.alloc(16);
await handle.read(header, 0, header.length, 0);
await handle.read(tag, 0, tag.length, info.size - tag.length);
await handle.close();
if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Backup format is not recognized.');
const manifest = JSON.parse(await readFile(`${source}.manifest.json`, 'utf8'));
const sha256 = await fileSha256(source);
if (manifest.sha256 !== sha256) throw new Error('Backup checksum does not match its manifest.');

const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
decipher.setAuthTag(tag);
const restore = spawn(process.env.MYSQL_BINARY ?? 'mysql', [
  '-h', target.hostname, '-P', target.port || '3306', '-u', decodeURIComponent(target.username), database,
], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(target.password) }, stdio: ['pipe', 'ignore', 'pipe'] });
const stderr = [];
restore.stderr.on('data', (chunk) => { if (stderr.join('').length < 4_000) stderr.push(String(chunk)); });
createReadStream(source, { start: header.length, end: info.size - tag.length - 1 }).pipe(decipher).pipe(restore.stdin);
const [exitCode] = await once(restore, 'exit');
if (exitCode !== 0) throw new Error(`Isolated restore failed (${exitCode}): ${stderr.join('').slice(0, 500)}`);

const connection = await mysql.createConnection({ uri: targetValue, decimalNumbers: false, timezone: 'Z' });
const actual = {};
try {
  for (const table of Object.keys(manifest.reconciliation).filter((key) => key !== 'schemaMigration')) {
    const [rows] = await connection.query(`SELECT COUNT(*) count FROM \`${table}\``);
    actual[table] = Number(rows[0].count);
  }
  const [migrations] = await connection.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  actual.schemaMigration = migrations[0]?.version ?? null;
} finally {
  await connection.end();
}
const differences = Object.entries(manifest.reconciliation).filter(([key, value]) => actual[key] !== value);
if (differences.length) throw new Error(`Restore reconciliation failed for: ${differences.map(([key]) => key).join(', ')}`);
console.log(JSON.stringify({ outcome: 'success', source: basename(source), target: database, reconciliation: actual }));

