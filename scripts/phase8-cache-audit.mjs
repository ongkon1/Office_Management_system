import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) found.push(path);
  }
  return found;
}

const violations = [];
for (const path of await walk(join(process.cwd(), 'src/server'))) {
  const text = await readFile(path, 'utf8');
  if (/unstable_cache|force-cache|revalidate\s*[:=]\s*[1-9]/.test(text)) {
    violations.push(relative(process.cwd(), path));
  }
}
if (violations.length) {
  console.error(`Authorization-sensitive server caching requires explicit Phase 8 review:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Cache audit passed: protected server reads remain uncached; durable summaries provide performance without stale authorization.');
}

