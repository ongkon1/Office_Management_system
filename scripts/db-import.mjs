import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';
import {
  approveImport,
  commitImport,
  dryRunImport,
  importRejections,
  importStatus,
  rollbackImport,
} from './import-engine.mjs';
import { migrationDatabaseUrl } from './db-lib.mjs';

function argumentsMap(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function required(args, key) {
  if (!args[key]) throw new Error(`Missing required --${key}.`);
  return args[key];
}

function manifestAndSource(args) {
  const manifestPath = resolve(required(args, 'manifest'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sourcePath = resolve(args.source ?? resolve(dirname(manifestPath), manifest.sourceFileName));
  return { manifest, source: readFileSync(sourcePath) };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === 'help') {
  console.log(`Usage:
  npm run db:import -- dry-run --manifest <manifest.json> [--source <data.csv>]
  npm run db:import -- approve --batch <id> --scope <owner|hr|financial|division|technical> --actor <user-id> --reason <text>
  npm run db:import -- commit --manifest <manifest.json> [--source <data.csv>] --actor <user-id>
  npm run db:import -- status --batch <id> --actor <user-id>
  npm run db:import -- rejections --batch <id> --actor <user-id> [--output <safe-report.csv>]
  npm run db:import -- rollback --batch <id> --actor <user-id> --reason <text> --confirm <batch-id>`);
  process.exit(0);
}

const args = argumentsMap(rest);
const connection = await mysql.createConnection({ uri: migrationDatabaseUrl(), timezone: 'Z', dateStrings: true });
await connection.query("SET time_zone = '+00:00'");
try {
  let result;
  if (command === 'dry-run') {
    const { manifest, source } = manifestAndSource(args);
    result = await dryRunImport(connection, manifest, source);
  } else if (command === 'approve') {
    result = await approveImport(connection, { batchId: required(args, 'batch'), scope: required(args, 'scope'), actorUserId: required(args, 'actor'), reason: required(args, 'reason') });
  } else if (command === 'commit') {
    const { manifest, source } = manifestAndSource(args);
    result = await commitImport(connection, manifest, source, required(args, 'actor'));
  } else if (command === 'status') {
    result = await importStatus(connection, required(args, 'batch'), required(args, 'actor'));
  } else if (command === 'rejections') {
    result = await importRejections(connection, required(args, 'batch'), required(args, 'actor'));
    if (args.output) {
      const headers = ['source_row_number', 'source_key_hash', 'error_code', 'error_field', 'safe_message', 'corrective_guidance'];
      writeFileSync(resolve(args.output), `${headers.join(',')}\n${result.map((row) => headers.map((header) => csvCell(row[header])).join(',')).join('\n')}\n`, { encoding: 'utf8', flag: 'wx' });
    }
  } else if (command === 'rollback') {
    result = await rollbackImport(connection, { batchId: required(args, 'batch'), actorUserId: required(args, 'actor'), reason: required(args, 'reason'), confirmation: required(args, 'confirm') });
  } else throw new Error(`Unknown import command: ${command}`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Import command failed.');
  process.exitCode = 1;
} finally {
  await connection.end();
}
