import { test, expect } from '@playwright/test';
import { generateSync } from 'otplib';

test.use({
  locale: 'ja-JP',
  extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
});

test('user can log in with credentials and MFA from .env', async ({ page }) => {
  const { E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD, E2E_TOTP_SECRET } = process.env;

  test.skip(!E2E_BASE_URL, 'E2E_BASE_URL is not set');
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'E2E_EMAIL or E2E_PASSWORD is not set');
  test.skip(!E2E_TOTP_SECRET, 'E2E_TOTP_SECRET is not set');

  await page.goto('/login');

  await page
    .getByRole('textbox', { name: 'Enter Email' })
    .pressSequentially(E2E_EMAIL!, { delay: 20 });
  await page
    .getByRole('textbox', { name: 'Enter Password' })
    .pressSequentially(E2E_PASSWORD!, { delay: 20 });
  await page.getByRole('button', { name: 'サインイン' }).click();

  const code = generateSync({ secret: E2E_TOTP_SECRET!, strategy: 'totp' });
  await page
    .getByRole('textbox', { name: 'Enter TOTP Code (6 digits)' })
    .pressSequentially(code, { delay: 20 });
  await page.getByRole('button', { name: '送信する' }).click();

  await expect(page).not.toHaveURL(/login/i);
  await expect(
    page.getByRole('img', { name: 'OQTOPUS Playground' }),
  ).toBeVisible();
});
