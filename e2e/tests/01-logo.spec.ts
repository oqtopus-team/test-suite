import { test, expect } from '@playwright/test';

const colorSchemes = ['light', 'dark'] as const;

for (const scheme of colorSchemes) {
  test(`logo is rendered in ${scheme} mode`, async ({ page }) => {
    const baseURL = test.info().project.use.baseURL;
    test.skip(!baseURL, 'E2E_BASE_URL is not set');

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
