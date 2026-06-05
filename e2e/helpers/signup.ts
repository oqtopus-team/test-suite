import { Page } from '@playwright/test';

/**
 * Fill the signup form with the given email and a fixed dummy password, then
 * click the Sign up button. The password satisfies the app's complexity rules
 * (12+ chars with mixed case, digits, and symbols).
 */
export async function submitSignupForm(
  page: Page,
  email: string,
): Promise<void> {
  const password = 'SomePassword123!';
  await page.goto('/signup');
  await page
    .getByRole('textbox', { name: 'Enter Email' })
    .pressSequentially(email, { delay: 10 });
  await page
    .getByRole('textbox', { name: 'Enter Password' })
    .pressSequentially(password, { delay: 10 });
  await page
    .getByRole('textbox', { name: 'Enter Confirm Password' })
    .pressSequentially(password, { delay: 10 });
  await page.getByRole('button', { name: 'Sign up' }).click();
}
