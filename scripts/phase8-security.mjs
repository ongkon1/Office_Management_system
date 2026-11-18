import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const findings = [];
const sourceRoots = ['src', 'scripts'];
const ignored = new Set(['node_modules', '.next', '.git', '.data', '.tools']);
const auditOnlyFiles = new Set(['scripts/phase8-security.mjs']);

async function files(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await files(path));
    else if (/\.(?:ts|tsx|mjs|js|sql)$/.test(entry.name)) rows.push(path);
  }
  return rows;
}

for (const directory of sourceRoots) {
  for (const path of await files(join(root, directory))) {
    const text = await readFile(path, 'utf8');
    const name = relative(root, path).replaceAll('\\', '/');
    if (auditOnlyFiles.has(name) || /(?:\.unit|\.integration|\.test)\.[^.]+$/.test(name) || /scripts\/_fe\d+-probe\.mjs$/.test(name)) continue;
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push([name, 'private_key']);
    if (/mysql:\/\/[^\s:'"`]+:[^\s@'"`]+@/.test(text) && !/replace-me|\[redacted\]/.test(text)) findings.push([name, 'database_credential']);
    if (/(?:^|[^.$\w])(?:eval|new Function)\s*\(/m.test(text)) findings.push([name, 'dynamic_code_execution']);
    if (/child_process[^\n]+exec\s*\(/.test(text)) findings.push([name, 'shell_exec']);
    if (/dangerouslySetInnerHTML/.test(text) && !/sanitiz|trusted/i.test(text)) findings.push([name, 'unreviewed_html_sink']);
    if (/console\.(?:log|error|warn)\([^\n]*(?:password|token|secret|salary|cost)\s*[:=]/i.test(text)) findings.push([name, 'sensitive_log']);
  }
}

const boundary = await readFile(join(root, 'src/server/security/request.ts'), 'utf8');
if (!boundary.includes('isTrustedMutation') || !boundary.includes('trustedOrigins') || !boundary.includes('origin')) findings.push(['src/server/security/request.ts', 'csrf_origin_boundary']);
if (!boundary.includes('httpOnly') || !boundary.includes('sameSite') || !boundary.includes('secure')) findings.push(['src/server/security/request.ts', 'cookie_flags']);
const uploads = await readFile(join(root, 'src/server/files/application.ts'), 'utf8');
for (const invariant of ['scan', 'mediaType', 'size']) if (!uploads.toLowerCase().includes(invariant.toLowerCase())) findings.push(['src/server/files/application.ts', `upload_${invariant}`]);

if (findings.length) {
  for (const [file, code] of findings) console.error(`${code}: ${file}`);
  process.exitCode = 1;
} else {
  console.log('Phase 8 static security review passed: secrets, injection sinks, request boundary, cookies, and upload controls checked.');
}

