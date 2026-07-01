import { test, expect } from '@playwright/test';

/**
 * Logging out must both return the user to `/login` and lock the protected
 * area behind it: once the session is gone, a direct hit on a protected URL
 * has to bounce back to the login screen rather than render.
 *
 * Runs under the `chromium-auth` project, so it starts from the shared
 * logged-in `storageState`. Playwright gives each test its own browser
 * context, so signing out here only clears this test's session and does not
 * disturb the other authenticated specs that load the same saved state.
 */
test('logout returns to /login and locks protected pages', async ({ page, context }) => {
  // Start from an arbitrary authenticated screen (the dashboard).
  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/login/i);

  // The ログアウト control sits in the app nav on every authenticated screen.
  await page.getByRole('button', { name: 'ログアウト' }).click();

  // Signing out lands on the login screen.
  await expect(page).toHaveURL(/\/login/i, { timeout: 15_000 });

  // Sign-out tears the Cognito session cookies down asynchronously while we sit
  // on /login. Wait for the auth tokens to actually be cleared before probing a
  // protected page — navigating away too early would both read a stale session
  // and abort the in-flight teardown.
  await expect
    .poll(async () => (await context.cookies()).some((c) => /idToken|accessToken/.test(c.name)), {
      timeout: 15_000,
    })
    .toBe(false);

  // With the session gone, a direct hit on a protected page must be redirected
  // back to the login screen by the route guard.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/i, { timeout: 15_000 });
});
