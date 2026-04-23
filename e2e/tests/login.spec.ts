import { test, expect } from '@playwright/test';
import { loginWithMfa } from '../helpers/login';

test.use({
  locale: 'ja-JP',
  extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
});

test('user can log in with credentials and MFA from .env', async ({ page }) => {
  await loginWithMfa(page);

  await expect(page).not.toHaveURL(/login/i);
  await expect(
    page.getByRole('img', { name: 'OQTOPUS Playground' }),
  ).toBeVisible();
});
