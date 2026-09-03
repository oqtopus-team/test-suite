import { test, expect, Locator, Page } from '@playwright/test';

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

type JobStatus = (typeof STATUSES)[number];

// The filter test waits for API responses and page updates that may exceed the
// default 30 s test timeout. CI environments can be slow, so allow up to
// 6 minutes per test, and up to 2 minutes for any single wait inside it.
const TEST_TIMEOUT_MS = 360_000;
const WAIT_TIMEOUT_MS = 120_000;

for (const status of STATUSES) {
  test(`filtering by "${status}" shows only ${status} jobs`, async ({
    page,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const table = jobTable(page);
    const form = await openJobList(page, table);
    await applyStatusFilter(page, form, status);
    await expectOnlyStatusRows(table, status);
  });
}

/** The results table of the job list, as the test observes it. */
interface JobTable {
  /** Data rows of the table (the header row carries no `cell`, so it is out). */
  dataRows: Locator;
  /** The notice rendered instead of rows when a filter matches nothing. */
  noData: Locator;
  /** Retry `assert` until it holds on a table that is not mid-fetch. */
  expectSettled(assert: () => Promise<void>): Promise<void>;
}

function jobTable(page: Page): JobTable {
  // While a fetch is in flight the table body holds a spinner row instead of
  // the results. The locator is scoped to the table because the page also
  // keeps a second .animate-spin inside a permanently hidden global overlay.
  const spinner = page.locator('tbody .animate-spin');

  return {
    dataRows: page.getByRole('row').filter({ has: page.getByRole('cell') }),
    noData: page.getByText('表示するジョブがありません。'),
    // A single observation is never enough: the spinner row is absent both
    // before it appears and after it is removed, and the previous (unfiltered)
    // rows stay on screen until the response lands. Requiring both checks to
    // succeed within one attempt is what rules a stale render out.
    expectSettled: (assert) =>
      expect(async () => {
        await expect(spinner).toHaveCount(0);
        await assert();
      }).toPass({ timeout: WAIT_TIMEOUT_MS }),
  };
}

/**
 * Open /jobs, wait for the first result set to render and return the search
 * form. The initial load has to finish before a filter is submitted: a first
 * response arriving late would overwrite the filtered rows.
 */
async function openJobList(page: Page, table: JobTable): Promise<Locator> {
  await page.goto('/jobs');
  await expect(page).not.toHaveURL(/login/i);

  // Locate the search form by its heading.
  const form = page.locator('form').filter({
    has: page.getByText('ジョブ検索', { exact: true }),
  });
  await expect(form).toBeVisible({ timeout: WAIT_TIMEOUT_MS });

  await table.expectSettled(async () => {
    await expect(table.noData.or(table.dataRows.first())).toBeVisible();
  });

  return form;
}

/** Select `status` in the search form, submit it and check the applied query. */
async function applyStatusFilter(
  page: Page,
  form: Locator,
  status: JobStatus,
): Promise<void> {
  await form.locator('select').selectOption(status);
  await form.getByRole('button', { name: '検索' }).click();

  // The URL must reflect the applied filter.
  await expect(page).toHaveURL(new RegExp(`status=${status}`));
}

/** Assert every row of the filtered result carries `status`. */
async function expectOnlyStatusRows(
  table: JobTable,
  status: JobStatus,
): Promise<void> {
  await table.expectSettled(async () => {
    if (await table.noData.isVisible()) {
      // Zero results is a valid outcome for every status but "succeeded",
      // which the scenario-tests always supply.
      expect(
        status,
        'expected at least one succeeded job to exist',
      ).not.toBe('succeeded');
      return;
    }

    const rowTexts = await table.dataRows.allInnerTexts();
    expect(rowTexts.length).toBeGreaterThan(0);
    for (const text of rowTexts) {
      expect(text).toContain(status);
    }
  });
}
