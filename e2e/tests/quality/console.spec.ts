import { test, expect } from '@playwright/test';

/**
 * QA-001 — Console error monitoring.
 *
 * Visits each major authenticated page and asserts that no uncaught JavaScript
 * errors are thrown during initial render. Uses Playwright's `page.on('pageerror')`
 * to capture exceptions that would otherwise only show up in DevTools.
 *
 * This is a cross-cutting quality gate: it catches regressions (missing env
 * vars, broken imports, render crashes) that page-specific tests may not cover.
 */

/** Pages to visit. Each entry is [path, human label, optional wait selector]. */
const PAGES: [string, string, (string | undefined)?][] = [
  ['/dashboard', 'Dashboard'],
  ['/devices', 'Devices'],
  ['/jobs', 'Jobs'],
  ['/jobs/form', 'Job submit form'],
  ['/composer', 'Composer'],
];

for (const [path, label, waitSelector] of PAGES) {
  test(`no uncaught errors on ${label} (${path})`, async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));

    await page.goto(path);
    await expect(page).not.toHaveURL(/login/i);

    // Wait for the page to settle — either the given selector or a generic
    // network-idle heuristic — so that lazy-loaded scripts have a chance to
    // fire before we check for errors.
    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 30_000 });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 30_000 });
    }

    expect(
      errors,
      `Uncaught error(s) on ${label}:\n${errors.map((e) => e.message).join('\n')}`,
    ).toHaveLength(0);
  });
}
