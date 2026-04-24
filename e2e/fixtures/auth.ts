import { test as base, Page } from '@playwright/test';
import { loginWithMfa } from '../helpers/login';

/**
 * Worker-scoped fixture that signs in once per worker and exposes the
 * authenticated page to every test. Because Playwright cannot carry this
 * app's session across browser contexts (the auth token lives outside of
 * cookies / localStorage / sessionStorage), we keep a single context alive
 * for the lifetime of the worker instead.
 */
export const test = base.extend<{}, { authedPage: Page }>({
  authedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        locale: 'ja-JP',
        extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
      });
      const page = await context.newPage();
      await loginWithMfa(page);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
