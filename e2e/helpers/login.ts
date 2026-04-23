import { Page, test } from '@playwright/test';
import { generateSync } from 'otplib';

const TOTP_STEP_MS = 30_000;
let lastTotpWindow = -1;

/**
 * Return a TOTP code that is guaranteed to belong to a window we have not
 * already used in this worker. If the current 30-second window was the one
 * used for the previous login, wait until the next window starts so the
 * server does not reject the code as a replay.
 */
async function freshTotp(secret: string): Promise<string> {
  let window = Math.floor(Date.now() / TOTP_STEP_MS);
  if (window === lastTotpWindow) {
    const waitMs = (lastTotpWindow + 1) * TOTP_STEP_MS - Date.now() + 500;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    window = Math.floor(Date.now() / TOTP_STEP_MS);
  }
  lastTotpWindow = window;
  return generateSync({ secret, strategy: 'totp' });
}

/**
 * Log in to OQTOPUS Playground using credentials and TOTP secret from .env.
 * Skips the calling test if required environment variables are missing.
 */
export async function loginWithMfa(page: Page): Promise<void> {
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

  const code = await freshTotp(E2E_TOTP_SECRET!);
  await page
    .getByRole('textbox', { name: 'Enter TOTP Code (6 digits)' })
    .pressSequentially(code, { delay: 20 });
  await page.getByRole('button', { name: '送信する' }).click();
}
