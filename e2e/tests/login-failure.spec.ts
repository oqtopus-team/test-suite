import { test, expect } from '@playwright/test';
import { requireBaseURL } from '../helpers/env';
import { submitLoginForm } from '../helpers/login';

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

  // The app surfaces the rejection as an in-page toast/alert. The exact wording
  // may differ per environment, so match common failure phrasings loosely.
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /password|incorrect|invalid|失敗|エラー|正しく/i }),
  ).toBeVisible({ timeout: 10_000 });
});
