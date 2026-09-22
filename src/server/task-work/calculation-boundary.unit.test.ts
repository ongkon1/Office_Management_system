import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('MBE-0304 calculation dependency boundary', () => {
    it('has no direct or transitive import of workflow transitions or server persistence', () => {
        const visited = new Set<string>();
        function walk(path: string) {
            if (visited.has(path)) return; visited.add(path);
            expect(path.replaceAll('\\', '/')).not.toMatch(/\/task-work\/|\/task-transition\.|\/server\//);
            const source = readFileSync(path, 'utf8');
            const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
            for (const statement of file.statements) {
                if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
                const specifier = statement.moduleSpecifier; if (!specifier || !ts.isStringLiteral(specifier)) continue;
                const name = specifier.text; const base = name.startsWith('@/') ? resolve('src', name.slice(2)) : name.startsWith('.') ? resolve(dirname(path), name) : null;
                if (!base) continue;
                const target = [`${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find(existsSync); if (target) walk(target);
            }
        }
        walk(resolve('src/lib/calculation/engine.ts'));
        const engine = readFileSync('src/lib/calculation/engine.ts', 'utf8');
        expect(engine).not.toMatch(/\b(startedAt|completedAt|changedAt|taskTransitions)\b/);
        expect(visited.size).toBeGreaterThan(1);
    });
});
