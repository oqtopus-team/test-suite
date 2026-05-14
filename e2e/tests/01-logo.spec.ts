import { test, expect } from '@playwright/test';
import { requireBaseURL } from '../helpers/env';

const colorSchemes = ['light', 'dark'] as const;

for (const scheme of colorSchemes) {
  test(`logo is rendered in ${scheme} mode`, async ({ page }) => {
    requireBaseURL();

    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');

    const logo = page.getByRole('img', { name: 'OQTOPUS Playground' });
    await expect(logo).toBeVisible();

    const naturalWidth = await logo.evaluate(
      (el) => (el as HTMLImageElement).naturalWidth,
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });
}
