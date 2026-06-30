import { Page, Locator, expect } from '@playwright/test';

/**
 * Counts read out of the sampling-result bar chart, keyed by computational
 * basis state label (e.g. "00", "11").
 */
export type SamplingDistribution = Record<string, number>;

/**
 * Locate the sampling-result chart card on the composer.
 */
export function samplingResultChart(page: Page): Locator {
  // Both the state-vector (amplitude) and sampling-result cards render a
  // Recharts surface. The sampling chart is the only one whose y-axis is
  // labelled "counts" (the amplitude chart says "Amplitude Value"), so we
  // disambiguate on the SVG's own text rather than the surrounding card.
  return page.locator('svg.recharts-surface', { hasText: 'counts' });
}

/**
 * Parse the Recharts sampling-result bar chart into a {label: count} map.
 *
 * Recharts renders the chart as an SVG: each populated outcome is a `<path>`
 * inside `.recharts-bar-rectangle`, and the x/y axes expose their tick values
 * as `<text class="recharts-cartesian-axis-tick-value">`. We map every bar's
 * horizontal centre to the nearest x-axis tick (the basis-state label) and
 * convert its pixel height to a count via a linear fit of the numeric y-axis
 * ticks. Reading the axes (rather than hard-coding pixel math) keeps this
 * robust to chart resizing.
 */
export async function readSamplingDistribution(
  page: Page,
): Promise<SamplingDistribution> {
  const chart = samplingResultChart(page);
  await expect(chart.locator('.recharts-bar-rectangle path').first()).toBeVisible({
    timeout: 30_000,
  });

  // Recharts grows each bar from zero on render (~1.5s animation), so a single
  // read can catch partial heights. Poll until two consecutive reads agree,
  // i.e. the bars have settled at their final values.
  let prev = '';
  let dist: SamplingDistribution = {};
  for (let i = 0; i < 20; i++) {
    dist = await parseChart(chart);
    const key = JSON.stringify(dist);
    if (key === prev) return dist;
    prev = key;
    await page.waitForTimeout(300);
  }
  return dist;
}

function parseChart(chart: Locator): Promise<SamplingDistribution> {
  return chart.evaluate((svg) => {
    const num = (el: Element, attr: string) => parseFloat(el.getAttribute(attr) || 'NaN');

    // Collect every axis tick value with its pixel position, then split the
    // two axes by geometry: x-axis ticks share the bottom row (max y), y-axis
    // ticks share the left column (min x). This avoids misclassifying numeric
    // count ticks like "0" / "1000" as basis-state labels (both are all-[01]).
    const ticks = Array.from(
      svg.querySelectorAll('text.recharts-cartesian-axis-tick-value'),
    ).map((t) => ({ txt: (t.textContent || '').trim(), x: num(t, 'x'), y: num(t, 'y') }));
    const maxY = Math.max(...ticks.map((t) => t.y));
    const minX = Math.min(...ticks.map((t) => t.x));

    // X-axis ticks: basis-state labels and their pixel centre.
    const xTicks = ticks
      .filter((t) => Math.abs(t.y - maxY) < 5 && /^[01]+$/.test(t.txt))
      .map((t) => ({ label: t.txt, x: t.x }));
    // Y-axis ticks: numeric counts and their pixel y, for the linear scale.
    const yTicks = ticks
      .filter((t) => Math.abs(t.x - minX) < 5 && /^\d+$/.test(t.txt))
      .map((t) => ({ value: parseInt(t.txt, 10), y: t.y }));

    // Linear fit y(px) -> count from the two extreme y-axis ticks.
    yTicks.sort((a, b) => a.value - b.value);
    const lo = yTicks[0];
    const hi = yTicks[yTicks.length - 1];
    const countAt = (yPx: number) =>
      lo.value + ((yPx - lo.y) * (hi.value - lo.value)) / (hi.y - lo.y);

    const dist: Record<string, number> = {};
    for (const t of xTicks) dist[t.label] = 0;

    svg.querySelectorAll('.recharts-bar-rectangle path').forEach((p) => {
      const x = num(p, 'x');
      const width = num(p, 'width');
      const yTop = num(p, 'y');
      if ([x, width, yTop].some(Number.isNaN)) return;
      const centre = x + width / 2;
      // Nearest x-axis tick to this bar's centre.
      let best = xTicks[0];
      for (const t of xTicks) {
        if (Math.abs(t.x - centre) < Math.abs(best.x - centre)) best = t;
      }
      const count = Math.round(countAt(yTop));
      // Recharts may emit duplicate path layers; keep the largest per label.
      dist[best.label] = Math.max(dist[best.label] ?? 0, count);
    });

    return dist;
  });
}
