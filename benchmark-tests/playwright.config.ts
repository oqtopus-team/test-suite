import { defineConfig } from '@playwright/test';
import 'dotenv/config';

/**
 * Benchmark tests are HTTP-driven (User-API) and need no browser, so a single
 * default project is enough. Env vars come from `../profiles/<PROFILE>.env`
 * (loaded via Taskfile) with a fallback to `benchmark-tests/.env`.
 */
// The Bell pair fidelity benchmark is opt-in: it is ignored unless
// RUN_BELL_FIDELITY=true, which CI sets only when tests/bell-fidelity.spec.ts
// is passed via the benchmark-test.yml `test_files` input.
export default defineConfig({
  testDir: './tests',
  testIgnore: process.env.RUN_BELL_FIDELITY === 'true' ? [] : ['**/bell-fidelity.spec.ts'],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
});
