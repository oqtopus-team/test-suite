import { test, expect } from '@playwright/test';
import { requireBaseURL } from '../helpers/env';
import { submitLoginForm } from '../helpers/login';

// Exercise the login form and its error alert in Japanese (ja-JP), the locale
// the app is operated in. Pin the locale here so the spec is independent of the
// project default (chromium-public would otherwise render en-US).
test.use({
  locale: 'ja-JP',
  extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
});

/**
 * A wrong password must be rejected at the credential step: the app stays on
 * `/login`, never advances to the MFA (confirm-mfa) screen, and surfaces an
 * error. We use the real `E2E_EMAIL` so the failure is the password being
 * wrong, not an unknown account, and pin an obviously-wrong password instead
 * of mutating the real one to keep the reason unambiguous.
 */
test('login with a wrong password is rejected before MFA', async ({ page }) => {
  requireBaseURL();
  const { E2E_EMAIL } = process.env;
  test.skip(!E2E_EMAIL, 'E2E_EMAIL is not set');

  await submitLoginForm(page, {
    email: E2E_EMAIL!,
    password: 'wrong-password-e2e',
  });

  // The credential step must not advance to the MFA screen.
  await expect(page).not.toHaveURL(/confirm-mfa/i, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/i);

  // The rejection is surfaced in a role="alert" toast. The message itself comes
  // from the backend (Cognito) and is NOT localized: it stays English
  // ("Incorrect username or password.") even under the ja-JP UI, so match the
  // English wording rather than a Japanese translation.
  await expect(
    page.getByRole('alert').filter({ hasText: /incorrect|invalid|password/i }),
  ).toBeVisible({ timeout: 10_000 });
});
