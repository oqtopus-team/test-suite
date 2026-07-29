import { defineConfig } from '@playwright/test';
import 'dotenv/config';

/**
 * Benchmark tests are HTTP-driven (User-API) and need no browser, so a single
 * default project is enough. Env vars come from `../profiles/<PROFILE>.env`
 * (loaded via Taskfile) with a fallback to `benchmark-tests/.env`.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
});
