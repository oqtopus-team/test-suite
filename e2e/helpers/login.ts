import { Page } from '@playwright/test';
import { generateSync } from 'otplib';

const TOTP_STEP_MS = 30_000;
let lastTotpWindow = -1;

/**
 * Return a TOTP code that is guaranteed to belong to a window we have not
 * already used in this process. If the current 30-second window was the one
 * used for the previous login, wait until the next window starts so the server
 * does not reject the code as a replay.
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

export interface LoginCredentials {
  email: string;
  password: string;
  totpSecret: string;
}

/**
 * Submit the first login step (email + password) on `/login` and click
 * サインイン. This stops before MFA, so it is shared by the full MFA login flow
 * and by failure specs that expect the credentials to be rejected before the
 * TOTP step is ever reached.
 */
export async function submitLoginForm(
  page: Page,
  { email, password }: { email: string; password: string },
): Promise<void> {
  await page.goto('/login');

  await page
    .getByRole('textbox', { name: 'Enter Email' })
    .pressSequentially(email, { delay: 20 });
  await page
    .getByRole('textbox', { name: 'Enter Password' })
    .pressSequentially(password, { delay: 20 });
  // Every caller runs under the ja-JP locale (setup project + the locale pinned
  // in login-failure.spec), so the sign-in button always renders 'サインイン'.
  await page.getByRole('button', { name: 'サインイン' }).click();
}

/**
 * Log in to OQTOPUS Playground using credentials and TOTP secret.
 * Callers are responsible for providing valid credentials (e.g., the
 * `authedPage` fixture validates env vars before calling this helper).
 */
export async function loginWithMfa(
  page: Page,
  { email, password, totpSecret }: LoginCredentials,
): Promise<void> {
  await submitLoginForm(page, { email, password });

  const code = await freshTotp(totpSecret);
  await page
    .getByRole('textbox', { name: 'Enter TOTP Code (6 digits)' })
    .pressSequentially(code, { delay: 20 });
  await page.getByRole('button', { name: '送信する' }).click();
}
