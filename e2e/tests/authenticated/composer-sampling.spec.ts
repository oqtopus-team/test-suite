import { test, expect } from '@playwright/test';
import { readSamplingDistribution } from '../../helpers/composer';

/**
 * Exercises the composer's local-simulation sampling on a Bell circuit.
 *
 * The composer initialises with a Bell circuit by default (H on q0 + CNOT
 * q0->q1), which we sample here. The sampling histogram is the assertion that
 * the circuit really is a Bell state: an ideal simulator only ever returns the
 * entangled outcomes |00> and |11>, each with ~50% probability, and never the
 * separable |01> / |10>. If the default circuit ever stops being a Bell state
 * this distribution check fails loudly.
 */
// Pass/fail thresholds for "is this really a Bell state?", expressed as a
// fraction of the shot count. Deliberately loose so the check only fires on a
// genuinely broken Bell state (e.g. a missing H or CNOT), not on the normal
// statistical jitter of sampling (3σ ≈ ±4.7% at 1000 shots):
//   - each entangled outcome |00>/|11> must carry > 30% of the shots, and
//   - the separable leakage |01>+|10> must stay ≤ 10% of the shots.
const MIN_ENTANGLED_FRACTION = 0.3;
const MAX_LEAKAGE_FRACTION = 0.1;

test('sampling a Bell circuit yields only |00> and |11>', async ({ page }) => {
  const SHOTS = 1000;

  await page.goto('/composer');
  await expect(page).not.toHaveURL(/login/i);

  // The Bell circuit should be on the grid: an H gate placed on a wire.
  await expect(
    page.getByRole('heading', { name: '量子回路コンポーザ' }),
  ).toBeVisible({ timeout: 30_000 });

  // Ensure the shot count is the value we assert against.
  const shots = page.getByRole('spinbutton').first();
  await shots.fill(String(SHOTS));
  await expect(shots).toHaveValue(String(SHOTS));

  // Run the local-simulation sampling.
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const dist = await readSamplingDistribution(page);
  console.log('sampling distribution:', JSON.stringify(dist));

  // Bell signature: both |00> and |11> are populated (entanglement present),
  // while the separable |01>/|10> leakage stays negligible. A missing H leaves
  // ~100% on |00> (|11> never fires); a missing CNOT pushes ~50% into |10>.
  expect(dist['00'] ?? 0).toBeGreaterThan(SHOTS * MIN_ENTANGLED_FRACTION);
  expect(dist['11'] ?? 0).toBeGreaterThan(SHOTS * MIN_ENTANGLED_FRACTION);

  const leakage = (dist['01'] ?? 0) + (dist['10'] ?? 0);
  expect(leakage).toBeLessThanOrEqual(SHOTS * MAX_LEAKAGE_FRACTION);
});
