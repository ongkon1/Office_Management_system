import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'src');
const allowedRoots = [
  resolve(root, 'fixtures'),
  resolve(root, 'services', 'mock'),
  resolve(root, 'test'),
];
const explicitDemoComposition = resolve(root, 'services', 'runtime', 'demo.ts');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const forbiddenImport = /from\s+['"]@\/(?:fixtures(?:\/|['"])|services\/mock(?:\/|['"]))/g;

function isInside(path, parent) {
  return path === parent || path.startsWith(`${parent}${sep}`);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!allowedRoots.some((allowed) => isInside(path, allowed))) {
        files.push(...await sourceFiles(path));
      }
      continue;
    }
    if (
      sourceExtensions.has(extname(entry.name)) &&
      path !== explicitDemoComposition &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.spec.')
    ) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
for (const file of await sourceFiles(root)) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(forbiddenImport)) {
    const line = content.slice(0, match.index).split(/\r?\n/).length;
    violations.push(`${relative(process.cwd(), file)}:${line}`);
  }
}

if (violations.length > 0) {
  console.error('Production modules must use runtime/server service boundaries, not fixtures or mock adapters:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Production data-boundary audit passed: no direct fixture or mock-service imports.');
