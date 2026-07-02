import { test, expect } from '@playwright/test';

/**
 * Job detail, sampling success.
 *
 * Verifies the result rendering on the job-detail page:
 *   - the sampling histogram is rendered,
 *   - the total count equals shots,
 *   - the top (most frequent) bitstring also appears in the histogram.
 *
 * How the job is arranged (to keep submission and result rendering separate):
 *   This test does not submit via the GUI; submission is covered elsewhere.
 *   It opens an already-succeeded sampling job from the list and only checks the
 *   result rendering. Assumes the continuously running scenario-tests supply a
 *   succeeded sampling job.
 *
 * Implementation notes (based on the live DOM):
 *   - The detail page "Histogram" is not Recharts but a role=application bar
 *     chart ("bar chart with 1 data series: Frequency") whose x-axis carries the
 *     basis-state labels. Reading counts from pixels is brittle, so we only check
 *     that the histogram is rendered and that its labels match the counts.
 *   - The exact counts come from the "Result" section JSON
 *     ({"counts": {"11": 507, "00": 493}}); total == shots is verified against it.
 */

test('succeeded sampling job detail histogram is consistent with shots', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/login/i);

  // Go to the job list. Navigate by accessible name, same as device-list.
  await page.getByRole('link', { name: 'ジョブ' }).click();

  // Open one succeeded sampling job from the list: follow the link of the first
  // row whose text contains both 'succeeded' and 'sampling' (no dependency on a
  // filter UI).
  const succeededSamplingRow = page
    .getByRole('row')
    .filter({ hasText: /succeeded/i })
    .filter({ hasText: /sampling/i })
    .first();
  await expect(succeededSamplingRow).toBeVisible({ timeout: 60_000 });
  await succeededSamplingRow.getByRole('link').first().click();

  // Detail page: status is rendered as succeeded.
  await expect(page.getByText(/succeeded/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // Read shots from the "ショット数 <n>" table row (rowheader + value cell).
  const shotsRow = page.getByRole('row').filter({ hasText: 'ショット数' }).first();
  const shotsText = await shotsRow.innerText();
  const shotsMatch = shotsText.match(/\d[\d,]*/);
  expect(shotsMatch, `shots value must be readable from detail: "${shotsText}"`).not.toBeNull();
  const shots = parseInt(shotsMatch![0].replace(/,/g, ''), 10);
  expect(shots).toBeGreaterThan(0);

  // Read the exact counts from the "Result" JSON (exact name so it does not
  // match "Transpile Result"). A spacer div sits between the heading and its
  // body, so don't rely on sibling index — read the whole parent section. The
  // result JSON renders asynchronously, so wait until counts appears.
  const resultSection = page
    .getByRole('heading', { name: 'Result', exact: true })
    .locator('xpath=..');
  await expect(resultSection).toContainText('counts', { timeout: 30_000 });
  const resultText = await resultSection.innerText();
  const counts = parseCounts(resultText);
  console.log('job-detail counts:', JSON.stringify(counts));

  const labels = Object.keys(counts);
  // Bitstring labels must be computational-basis states ([01]+).
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toMatch(/^[01]+$/);

  // 1) The total count matches shots exactly.
  const total = labels.reduce((sum, k) => sum + counts[k], 0);
  expect(total).toBe(shots);

  // 2) The histogram is rendered and its x-axis labels match the counts.
  const histogram = page
    .getByRole('heading', { name: 'Histogram', exact: true })
    .locator('xpath=..');
  await expect(
    histogram.getByRole('application', { name: /bar chart/i }),
  ).toBeVisible({ timeout: 30_000 });
  for (const label of labels) {
    await expect(histogram.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // 3) The top (most frequent) bitstring is readable and appears in the histogram.
  const top = labels.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  expect(counts[top]).toBeGreaterThan(0);
  console.log(`top bitstring: ${top} (${counts[top]}/${shots})`);
});

/**
 * Extract counts as {bitstring: count} from the "Result" section JSON text.
 * innerText splits across nodes so a plain JSON.parse may fail; instead extract
 * the counts block with a regex and parse it.
 */
function parseCounts(text: string): Record<string, number> {
  const block = text.match(/"counts"\s*:\s*\{([^}]*)\}/);
  if (!block) return {};
  const counts: Record<string, number> = {};
  for (const m of block[1].matchAll(/"([01]+)"\s*:\s*(\d+)/g)) {
    counts[m[1]] = parseInt(m[2], 10);
  }
  return counts;
}
