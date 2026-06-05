import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loginWithMfa } from '../helpers/login';
import { STORAGE_STATE } from '../helpers/storage';

/**
 * Auth gate + session bootstrap for the `chromium-auth` project. It logs in
 * once and saves the resulting cookies to `STORAGE_STATE`; authenticated specs
 * reuse that state (via the project's `storageState`) so they start already
 * logged in without each performing their own login. Logging in only once per
 * run means a single TOTP code is consumed, avoiding replay rejections.
 *
 * Authenticated specs depend on this `setup` project, so if login is broken in
 * the target environment this fails fast and every authenticated test is
 * skipped instead of each one burning its own timeout.
 */
setup('authenticate', async ({ browser }) => {
  const { E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_TOTP_SECRET } = process.env;
  setup.skip(!E2E_BASE_URL, 'E2E_BASE_URL is not set');
  setup.skip(!E2E_EMAIL || !E2E_PASSWORD, 'E2E_EMAIL or E2E_PASSWORD is not set');
  setup.skip(!E2E_TOTP_SECRET, 'E2E_TOTP_SECRET is not set');

  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    locale: 'ja-JP',
    extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
  });
  const page = await context.newPage();
  await loginWithMfa(page, {
    email: E2E_EMAIL!,
    password: E2E_PASSWORD!,
    totpSecret: E2E_TOTP_SECRET!,
  });

  await page.waitForURL((u) => !/login|confirm-mfa/i.test(u.toString()), {
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(/login|confirm-mfa/i);

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
