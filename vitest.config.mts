import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/services/runtime/admin': fileURLToPath(new URL('./src/test/runtime/admin.ts', import.meta.url)),
      '@/services/runtime/employee': fileURLToPath(new URL('./src/test/runtime/employee.ts', import.meta.url)),
      '@/services/runtime/profile': fileURLToPath(new URL('./src/test/runtime/profile.ts', import.meta.url)),
      '@/services/runtime/task-review': fileURLToPath(new URL('./src/test/runtime/task-review.ts', import.meta.url)),
      '@/services/runtime/finance': fileURLToPath(new URL('./src/test/runtime/finance.ts', import.meta.url)),
      '@/services/runtime/reporting': fileURLToPath(new URL('./src/test/runtime/reporting.ts', import.meta.url)),
      '@/services/runtime/timesheet': fileURLToPath(new URL('./src/test/runtime/timesheet.ts', import.meta.url)),
      '@/services/runtime/workspace': fileURLToPath(new URL('./src/test/runtime/workspace.ts', import.meta.url)),
      '@/services/runtime/hr': fileURLToPath(new URL('./src/test/runtime/hr.ts', import.meta.url)),
      '@/services/runtime/team-lead': fileURLToPath(new URL('./src/test/runtime/team-lead.ts', import.meta.url)),
      '@/services/runtime/requisition': fileURLToPath(new URL('./src/test/runtime/requisition.ts', import.meta.url)),
      '@/services/runtime/conveyance': fileURLToPath(new URL('./src/test/runtime/conveyance.ts', import.meta.url)),
      '@/services/runtime/meeting-minutes': fileURLToPath(new URL('./src/test/runtime/meeting-minutes.ts', import.meta.url)),
      '@/services/runtime/department-admin': fileURLToPath(new URL('./src/test/runtime/department-admin.ts', import.meta.url)),
      '@/services/runtime/dashboard': fileURLToPath(new URL('./src/test/runtime/dashboard.ts', import.meta.url)),
      '@/services/runtime/organization': fileURLToPath(new URL('./src/test/runtime/organization.ts', import.meta.url)),
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
