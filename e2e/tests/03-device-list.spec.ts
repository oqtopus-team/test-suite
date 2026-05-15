import { test, expect } from '../fixtures/auth';

test('device list shows qulacs after opening the devices page', async ({
  authedPage,
}) => {
  await expect(authedPage).not.toHaveURL(/login/i);

  await authedPage.getByRole('link', { name: 'デバイス' }).click();

  await expect(
    authedPage.getByRole('cell', { name: 'qulacs', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
});
