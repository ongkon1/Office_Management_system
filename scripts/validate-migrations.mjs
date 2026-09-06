import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'drizzle');
const recoveryRoot = join(root, 'recovery');
if (!existsSync(root)) throw new Error('Missing drizzle migration directory.');

const migrations = readdirSync(root)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
if (migrations.length === 0) throw new Error('No versioned migrations found.');

for (const [index, name] of migrations.entries()) {
  const version = name.slice(0, 4);
  const expected = String(index + 1).padStart(4, '0');
  if (version !== expected) throw new Error(`Migration sequence gap: expected ${expected}, found ${version}`);

  const sql = readFileSync(join(root, name), 'utf8');
  if (!/--\s*Recovery:/i.test(sql)) throw new Error(`Missing recovery reference: ${name}`);
  if (/\b(?:DROP\s+DATABASE|TRUNCATE\s+TABLE|DROP\s+TABLE)\b/i.test(sql)) {
    throw new Error(`Destructive statement is forbidden in a forward migration: ${name}`);
  }
  if (/\b(?:FLOAT|DOUBLE|REAL)\b/i.test(sql.replace(/^\s*--.*$/gm, ''))) {
    throw new Error(`Floating-point storage is forbidden: ${name}`);
  }

  const recovery = existsSync(recoveryRoot)
    ? readdirSync(recoveryRoot).find((candidate) => candidate.startsWith(`${version}_`) && candidate.endsWith('.sql'))
    : undefined;
  if (!recovery) throw new Error(`Missing recovery script for ${name}`);
  if (readFileSync(join(recoveryRoot, recovery), 'utf8').trim().length === 0) {
    throw new Error(`Recovery script is empty: ${recovery}`);
  }
}

console.log(`Migration validation passed: ${migrations.length} forward migration(s) and matching recovery scripts checked.`);
