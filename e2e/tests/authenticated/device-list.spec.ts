import { test, expect } from '@playwright/test';

test('device list shows qulacs after opening the devices page', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/login/i);

  await page.getByRole('link', { name: 'デバイス' }).click();

  await expect(
    page.getByRole('cell', { name: 'qulacs', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});
