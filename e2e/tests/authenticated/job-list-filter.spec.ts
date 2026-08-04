import { test, expect } from '@playwright/test';

/**
 * Job list status filter.
 *
 * Verifies the search form's status dropdown on the /jobs page. For each
 * status the dropdown is set, "検索" is clicked, and the test asserts:
 *   - the URL contains the status query param,
 *   - every data row in the table carries the selected status text.
 *
 * The "succeeded" filter additionally requires at least one row because the
 * CI environment's scenario-tests always supply succeeded jobs.
 */

const STATUSES = [
  'submitted',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

for (const status of STATUSES) {
  test(`filtering by "${status}" shows only ${status} jobs`, async ({
    page,
  }) => {
    await page.goto('/jobs');
    await expect(page).not.toHaveURL(/login/i);

    // Locate the search form by its heading.
    const form = page.locator('form').filter({
      has: page.getByText('ジョブ検索', { exact: true }),
    });
    await expect(form).toBeVisible({ timeout: 30_000 });

    // Select the target status and submit.
    await form.locator('select').selectOption(status);
    await form.getByRole('button', { name: '検索' }).click();

    // The URL must reflect the applied filter.
    await expect(page).toHaveURL(new RegExp(`status=${status}`));

    // Wait for filtered results: either a matching row or the no-data notice.
    const matchingRow = page
      .getByRole('row')
      .filter({ hasText: status })
      .first();
    const noData = page.getByText('表示するジョブがありません。');

    if (status === 'succeeded') {
      // Scenario-tests always supply succeeded jobs.
      await expect(matchingRow).toBeVisible({ timeout: 60_000 });
    } else {
      await expect(matchingRow.or(noData)).toBeVisible({ timeout: 60_000 });
    }

    // Assert every data row (rows with <td> cells, not header <th>) carries
    // the selected status.
    const dataRows = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });
    const count = await dataRows.count();
    for (let i = 0; i < count; i++) {
      await expect(dataRows.nth(i)).toContainText(status);
    }
  });
}
