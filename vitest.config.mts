import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    /*
     * Backend suites belong to `vitest.backend.config.mts`, which gives
     * integration tests 60 seconds and runs them serially because they talk to
     * MySQL. The pattern above also matches them, which dragged them into this
     * jsdom run with a 5-second concurrent timeout — they passed alone and
     * timed out under load. Excluded here; `npm run test:backend` still runs
     * them with the settings they were written for.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/**/*.unit.test.ts',
      'src/**/*.integration.test.ts',
      'src/**/*.api.test.ts',
      'src/**/*.authorization.test.ts',
    ],
    css: false,
  },
});
