import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';
import { STORAGE_STATE } from './helpers/storage';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-public',
      testIgnore: /authenticated\/.*/,
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-auth',
      testMatch: /authenticated\/.*\.spec\.ts/,
      // Reuse the cookies saved by `setup` so these tests start already logged
      // in. This logs in only once per run (one TOTP code), avoiding the replay
      // rejection that a per-test login would trigger. The locale is pinned to
      // ja-JP because the app is exercised in Japanese (e.g. the 'デバイス' link).
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
      },
      // If `setup` (login) fails, every test in this project is skipped instead
      // of each one burning its own timeout. New login-dependent specs only
      // need to live under tests/authenticated/ to inherit this gate.
      dependencies: ['setup'],
    },
  ],
});
