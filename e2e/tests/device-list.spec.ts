import { test, expect } from '@playwright/test';
import { loginWithMfa } from '../helpers/login';

test.use({
  locale: 'ja-JP',
  extraHTTPHeaders: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
});

test('device list shows qulacs after opening the devices page', async ({
  page,
}) => {
  await loginWithMfa(page);

  await expect(page).not.toHaveURL(/login/i);

  await page.getByRole('link', { name: 'デバイス' }).click();
  await page.locator('div').filter({ hasText: 'デバイス ID' }).nth(5).click();
  await page.getByRole('cell', { name: 'qulacs', exact: true }).click();
});
