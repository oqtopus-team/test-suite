import { test, expect } from '@playwright/test';
import { boolEnv, requireBaseURL } from '../helpers/env';
import { submitSignupForm } from '../helpers/signup';

/**
 * Whether signup with a non-whitelisted email is expected to be blocked in the
 * target environment. Default is `false`, so this check is opt-in: set
 * `E2E_SIGNUP_BLOCKED=true` in the profile for environments that reject signup
 * with a non-whitelisted email.
 */
const signupBlocked = boolEnv('E2E_SIGNUP_BLOCKED', false);

test('signup with a non-whitelisted email shows an error', async ({ page }) => {
  requireBaseURL();
  test.skip(
    !signupBlocked,
    'signup failure check runs only when E2E_SIGNUP_BLOCKED=true',
  );

  // Use a valid-format address with a fresh local-part so the failure is the
  // whitelist policy, not address reuse or invalid TLD handling.
  const nonWhitelisted = `e2e-not-whitelisted+${Date.now()}@example.com`;
  await submitSignupForm(page, nonWhitelisted);

  // The app surfaces signup failures as an in-page toast/alert. The exact
  // wording may differ per environment; observed so far: "Failed to sign up".
  await expect(
    page.getByRole('alert').filter({ hasText: /sign ?up|失敗|エラー/i }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/signup/i);
});
