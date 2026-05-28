import { test, expect } from '@playwright/test';
import { requireBaseURL } from '../helpers/env';

test('base URL is reachable', async ({ page }) => {
  requireBaseURL();

  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
});
