import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = {
  // Next's build-time client/server guard has no Node implementation; the stub
  // lets a `server-only` module be unit- and integration-tested without
  // dropping the protection it declares in production.
  'server-only': fileURLToPath(new URL('./src/server/test/server-only-stub.ts', import.meta.url)),
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};

function backendProject(name: string, include: string[]) {
  return {
    resolve: { alias },
    test: {
      name,
      environment: 'node',
      globals: true,
      include,
      testTimeout: name === 'integration' ? 60_000 : 10_000,
      hookTimeout: name === 'integration' ? 60_000 : 10_000,
      sequence: name === 'integration' ? { concurrent: false } : undefined,
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      backendProject('unit', ['src/**/*.unit.test.ts']),
      backendProject('integration', ['src/**/*.integration.test.ts']),
      backendProject('api', ['src/**/*.api.test.ts']),
      backendProject('authorization', ['src/**/*.authorization.test.ts']),
    ],
  },
});
