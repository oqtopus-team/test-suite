/**
 * Render the "measured vs threshold" chart from a real benchmark run.
 *
 * Reads `results/error-rate.json` (written by the device-error-rate spec) and
 * emits:
 *   - `results/error-rate-chart.svg` — a per-gate bar chart with the threshold
 *     and average drawn as reference lines (uploaded as a CI artifact).
 *   - a Markdown summary appended to `$GITHUB_STEP_SUMMARY` when running in
 *     GitHub Actions, so the numbers and a compact chart show on the run page.
 *
 * Pure Node ESM with no external dependencies so it runs in CI without an extra
 * install step.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, '..', 'results');
const RESULT_PATH = join(RESULTS_DIR, 'error-rate.json');
const SVG_PATH = join(RESULTS_DIR, 'error-rate-chart.svg');

/** Read the result file, or exit cleanly when the run produced none. */
function loadResult() {
  try {
    return JSON.parse(readFileSync(RESULT_PATH, 'utf-8'));
  } catch {
    console.log(`[chart] no result at ${RESULT_PATH}; skipping chart`);
    return null;
  }
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Build the per-gate bar chart as a self-contained SVG string. */
function renderSvg({ device, threshold, average, gates }) {
  const W = Math.max(720, 80 + gates.length * 34);
  const H = 420;
  const m = { top: 56, right: 24, bottom: 96, left: 64 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;

  const values = gates.map((g) => g.value);
  const yMax = Math.max(threshold, ...(values.length ? values : [0])) * 1.15 || 1;
  const x = (i) => m.left + (plotW / Math.max(gates.length, 1)) * (i + 0.5);
  const y = (v) => m.top + plotH - (v / yMax) * plotH;
  const bw = Math.min(24, (plotW / Math.max(gates.length, 1)) * 0.6);

  const ticks = 5;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (yMax / ticks) * i;
    return `<line x1="${m.left}" y1="${y(v)}" x2="${W - m.right}" y2="${y(v)}" stroke="#e5e7eb" />
      <text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${v.toFixed(3)}</text>`;
  }).join('');

  const bars = gates
    .map((g, i) => {
      const over = g.value > threshold;
      const yy = y(g.value);
      const label =
        gates.length <= 40
          ? `<text x="${x(i)}" y="${H - m.bottom + 14}" transform="rotate(60 ${x(i)} ${H - m.bottom + 14})" font-size="10" fill="#6b7280" text-anchor="start">${esc(g.name)}</text>`
          : '';
      return `<rect x="${x(i) - bw / 2}" y="${yy}" width="${bw}" height="${m.top + plotH - yy}" fill="${over ? '#dc2626' : '#2563eb'}"><title>${esc(g.name)}: ${g.value.toFixed(6)}</title></rect>${label}`;
    })
    .join('');

  const thresholdLine = `<line x1="${m.left}" y1="${y(threshold)}" x2="${W - m.right}" y2="${y(threshold)}" stroke="#dc2626" stroke-width="2" />
    <text x="${W - m.right}" y="${y(threshold) - 6}" text-anchor="end" font-size="11" fill="#dc2626">threshold ${threshold}</text>`;

  const avgLine =
    average == null
      ? ''
      : `<line x1="${m.left}" y1="${y(average)}" x2="${W - m.right}" y2="${y(average)}" stroke="#16a34a" stroke-width="2" stroke-dasharray="6 4" />
    <text x="${m.left}" y="${y(average) - 6}" font-size="11" fill="#16a34a">average ${average.toFixed(6)}</text>`;

  const subtitle =
    average == null
      ? 'no calibration data'
      : `average ${average.toFixed(6)} vs threshold ${threshold} (Δ ${(threshold - average).toFixed(6)})`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff" />
  <text x="${m.left}" y="26" font-size="16" font-weight="600" fill="#111827">2Q gate error: measured vs threshold — ${esc(device)}</text>
  <text x="${m.left}" y="44" font-size="12" fill="#6b7280">${esc(subtitle)}</text>
  ${gridY}
  ${bars}
  ${thresholdLine}
  ${avgLine}
  <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + plotH}" stroke="#9ca3af" />
  <line x1="${m.left}" y1="${m.top + plotH}" x2="${W - m.right}" y2="${m.top + plotH}" stroke="#9ca3af" />
</svg>
`;
}

/** Append a Markdown summary (table + mermaid chart) to the CI run page. */
function writeStepSummary({ device, threshold, average, gates }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const measured = average == null ? 'n/a' : average.toFixed(6);
  const diff = average == null ? 'n/a' : (threshold - average).toFixed(6);
  const verdict =
    average == null ? '⚪ not measurable' : average <= threshold ? '✅ pass' : '❌ fail';

  const mermaid =
    average == null
      ? ''
      : `\n\`\`\`mermaid
xychart-beta
    title "avg 2Q gate error vs threshold — ${device}"
    x-axis ["measured", "threshold"]
    y-axis "gate error"
    bar [${average.toFixed(6)}, ${threshold}]
\`\`\`\n`;

  const md = `## Benchmark: 2Q gate error rate

| device | gates | measured avg | threshold | Δ (threshold − measured) | verdict |
| --- | ---: | ---: | ---: | ---: | :---: |
| \`${device}\` | ${gates.length} | ${measured} | ${threshold} | ${diff} | ${verdict} |
${mermaid}
> Full per-gate chart is attached as the \`benchmark-error-rate-chart\` artifact (\`error-rate-chart.svg\`).
`;
  appendFileSync(summaryPath, md);
}

function main() {
  const result = loadResult();
  if (!result) return;

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(SVG_PATH, renderSvg(result));
  console.log(`[chart] wrote ${SVG_PATH}`);
  writeStepSummary(result);
}

main();
