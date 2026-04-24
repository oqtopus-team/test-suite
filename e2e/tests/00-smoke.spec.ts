import { test, expect } from '@playwright/test';

test('base URL is reachable', async ({ page }) => {
  const baseURL = test.info().project.use.baseURL;
  test.skip(!baseURL, 'E2E_BASE_URL is not set');

  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
});
