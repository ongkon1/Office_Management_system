import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = {
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
