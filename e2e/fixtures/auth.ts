import { test as base, Page } from '@playwright/test';
import { loginWithMfa } from '../helpers/login';

/**
 * Worker-scoped fixture that signs in once per worker and exposes the
 * authenticated page to every test. Because Playwright cannot carry this
 * app's session across browser contexts (the auth token lives outside of
 * cookies / localStorage / sessionStorage), we keep a single context alive
 * for the lifetime of the worker instead.
 *
 * The UI is exercised in Japanese (button labels like 'サインイン'), so the
 * browser context is pinned to ja-JP.
 */
export const test = base.extend<{}, { authedPage: Page }>({
  authedPage: [
    async ({ browser }, use) => {
      const { E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_TOTP_SECRET } = process.env;
      base.skip(!E2E_BASE_URL, 'E2E_BASE_URL is not set');
      base.skip(!E2E_EMAIL || !E2E_PASSWORD, 'E2E_EMAIL or E2E_PASSWORD is not set');
      base.skip(!E2E_TOTP_SECRET, 'E2E_TOTP_SECRET is not set');

      const context = await browser.newContext({
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
      });
      const page = await context.newPage();
      await loginWithMfa(page, {
        email: E2E_EMAIL!,
        password: E2E_PASSWORD!,
        totpSecret: E2E_TOTP_SECRET!,
      });
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
