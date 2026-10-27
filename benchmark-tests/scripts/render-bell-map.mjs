/**
 * Render a chip map of the qubits the Bell fidelity benchmark measured.
 *
 * Reads `results/bell-fidelity.json` (written by the bell-fidelity spec), which
 * carries the device topology (qubit positions and couplings from
 * `device_info`) next to the per-pair results, and emits:
 *   - `results/bell-qubit-map.svg` — every qubit at its on-chip position, all
 *     couplings in grey, and each measured pair highlighted in green (pass) or
 *     red (fail) with its fidelity (uploaded as a CI artifact).
 *   - a Markdown grid of the chip appended to `$GITHUB_STEP_SUMMARY` when
 *     running in GitHub Actions, so the measured qubits show on the run page.
 *
 * When `device_info` has no qubit positions, qubits are laid out row-major by
 * id on a square grid.
 *
 * Pure Node ESM with no external dependencies so it runs in CI without an extra
 * install step.
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, '..', 'results');
const RESULT_PATH = join(RESULTS_DIR, 'bell-fidelity.json');
const SVG_PATH = join(RESULTS_DIR, 'bell-qubit-map.svg');

const PASS = '#16a34a';
const FAIL = '#dc2626';
const PAIR_LABELS = 'abcdefghijklmnopqrstuvwxyz';

/** Read the result file, or exit cleanly when the run produced none. */
function loadResult() {
  try {
    return JSON.parse(readFileSync(RESULT_PATH, 'utf-8'));
  } catch {
    console.log(`[bell-map] no result at ${RESULT_PATH}; skipping qubit map`);
    return null;
  }
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The physical qubits a result ran on: the transpiler mapping, else the pair. */
function physicalPair(r) {
  if (Array.isArray(r.qubit_mapping) && r.qubit_mapping.length >= 2) {
    return [r.qubit_mapping[0].physical, r.qubit_mapping[1].physical];
  }
  return r.pair.split('-').map(Number);
}

/**
 * Place every qubit on the plane. Uses `device_info` positions when all qubits
 * have one (y grows upward there, so it is flipped for screen coordinates);
 * otherwise falls back to a row-major square grid by id. Qubits referenced by
 * a measured pair but missing from the topology are added so they still show.
 */
function layout(topology, measured) {
  const byId = new Map();
  for (const q of topology?.qubits ?? []) byId.set(q.id, { ...q });
  for (const id of measured) if (!byId.has(id)) byId.set(id, { id });

  const qubits = [...byId.values()].sort((a, b) => a.id - b.id);
  const positioned =
    qubits.length > 0 && qubits.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y));

  if (positioned) {
    const maxY = Math.max(...qubits.map((q) => q.y));
    return { positioned, qubits: qubits.map((q) => ({ ...q, px: q.x, py: maxY - q.y })) };
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(qubits.length)));
  return {
    positioned,
    qubits: qubits.map((q, i) => ({ ...q, px: i % cols, py: Math.floor(i / cols) })),
  };
}

/** Smallest distance between two qubits, used to scale the map. */
function minSpacing(qubits) {
  let min = Infinity;
  for (let i = 0; i < qubits.length; i++) {
    for (let j = i + 1; j < qubits.length; j++) {
      const d = Math.hypot(qubits[i].px - qubits[j].px, qubits[i].py - qubits[j].py);
      if (d > 1e-9 && d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 1;
}

/** Build the chip map as a self-contained SVG string. */
function renderSvg(result, placed, pairs) {
  const { qubits, positioned } = placed;
  const SPACING = 64;
  const R = 15;
  const scale = SPACING / minSpacing(qubits);
  const m = { top: 72, right: 40, bottom: 40, left: 40 };
  const minX = Math.min(...qubits.map((q) => q.px));
  const minY = Math.min(...qubits.map((q) => q.py));
  const sx = (q) => m.left + (q.px - minX) * scale;
  const sy = (q) => m.top + (q.py - minY) * scale;
  const W = Math.max(480, Math.max(...qubits.map(sx)) + m.right);
  const H = Math.max(...qubits.map(sy)) + m.bottom + 24 * pairs.length;

  const byId = new Map(qubits.map((q) => [q.id, q]));
  const edge = ([a, b], attrs) => {
    const qa = byId.get(a);
    const qb = byId.get(b);
    if (!qa || !qb) return '';
    return `<line x1="${sx(qa)}" y1="${sy(qa)}" x2="${sx(qb)}" y2="${sy(qb)}" ${attrs} />`;
  };

  const couplings = (result.topology?.couplings ?? [])
    .map((c) => edge(c, 'stroke="#d1d5db" stroke-width="3"'))
    .join('');

  const coupled = new Set(
    (result.topology?.couplings ?? []).flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]),
  );
  const measuredEdges = pairs
    .map((p) => {
      const dash = coupled.has(`${p.qubits[0]}-${p.qubits[1]}`) ? '' : ' stroke-dasharray="6 4"';
      return edge(p.qubits, `stroke="${p.color}" stroke-width="7" stroke-linecap="round"${dash}`);
    })
    .join('');

  const pairOf = new Map();
  for (const p of pairs) for (const id of p.qubits) pairOf.set(id, p);

  const nodes = qubits
    .map((q) => {
      const p = pairOf.get(q.id);
      const fill = p ? p.color : '#ffffff';
      const stroke = p ? p.color : '#9ca3af';
      const text = p ? '#ffffff' : '#374151';
      const title = q.physical_id == null ? `Q${q.id}` : `Q${q.id} (physical_id ${q.physical_id})`;
      return `<circle cx="${sx(q)}" cy="${sy(q)}" r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="2"><title>${esc(title)}</title></circle>
    <text x="${sx(q)}" y="${sy(q) + 4}" text-anchor="middle" font-size="11" font-weight="${p ? 700 : 400}" fill="${text}">${q.id}</text>`;
    })
    .join('');

  const legendTop = Math.max(...qubits.map(sy)) + m.bottom;
  const legend = pairs
    .map(
      (p, i) =>
        `<rect x="${m.left}" y="${legendTop + 24 * i - 10}" width="14" height="14" rx="3" fill="${p.color}" />
    <text x="${m.left + 22}" y="${legendTop + 24 * i + 2}" font-size="12" fill="#111827">${esc(p.label)}: Q${p.qubits[0]}–Q${p.qubits[1]}  fidelity ${p.fidelity.toFixed(4)} (threshold ${p.threshold}) ${p.pass ? 'pass' : 'FAIL'}</text>`,
    )
    .join('');

  const subtitle = [
    `mode ${result.qubit_mode}`,
    `${result.shots} shots`,
    positioned ? 'positions from device_info' : 'no positions in device_info — laid out by qubit id',
  ].join(' · ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff" />
  <text x="${m.left}" y="26" font-size="16" font-weight="600" fill="#111827">Bell pair qubits — ${esc(result.device)}</text>
  <text x="${m.left}" y="44" font-size="12" fill="#6b7280">${esc(subtitle)}</text>
  ${couplings}
  ${measuredEdges}
  ${nodes}
  ${legend}
</svg>
`;
}

/**
 * Render the chip as a Markdown table: one cell per grid position, measured
 * qubits marked 🟢 (pass) / 🔴 (fail) with their pair label. Returns `null`
 * when the positions do not fit a reasonably sized grid.
 */
function renderGrid(placed, pairs) {
  const key = (v) => Math.round(v * 1000) / 1000;
  const xs = [...new Set(placed.qubits.map((q) => key(q.px)))].sort((a, b) => a - b);
  const ys = [...new Set(placed.qubits.map((q) => key(q.py)))].sort((a, b) => a - b);
  if (xs.length > 32 || ys.length > 32) return null;

  const pairOf = new Map();
  for (const p of pairs) for (const id of p.qubits) pairOf.set(id, p);

  const cells = ys.map(() => xs.map(() => ''));
  for (const q of placed.qubits) {
    const p = pairOf.get(q.id);
    cells[ys.indexOf(key(q.py))][xs.indexOf(key(q.px))] = p
      ? `${p.pass ? '🟢' : '🔴'} **${q.id}**<sub>${p.label}</sub>`
      : `${q.id}`;
  }
  const header = `| ${xs.map(() => ' ').join(' | ')} |`;
  const sep = `| ${xs.map(() => ':-:').join(' | ')} |`;
  return [header, sep, ...cells.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

/** Append the qubit map to the CI run page. */
function writeStepSummary(placed, pairs) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const grid = renderGrid(placed, pairs);
  const legend = pairs
    .map(
      (p) =>
        `- ${p.pass ? '🟢' : '🔴'} **${p.label}**: Q${p.qubits[0]}–Q${p.qubits[1]} — fidelity ${p.fidelity.toFixed(4)} (threshold ${p.threshold})`,
    )
    .join('\n');
  const note = placed.positioned
    ? ''
    : '\n> `device_info` has no qubit positions; qubits are laid out by id.\n';

  const md = `### Bell pair qubit map
${note}
${grid ?? '> Chip layout is too large for an inline grid; see the SVG artifact.'}

${legend}

> Full chip map with couplings is attached as \`bell-qubit-map.svg\` in the \`benchmark-bell-fidelity\` artifact.
`;
  appendFileSync(summaryPath, md);
}

function main() {
  const result = loadResult();
  if (!result || !Array.isArray(result.results) || result.results.length === 0) return;

  const pairs = result.results.map((r, i) => ({
    label: PAIR_LABELS[i % PAIR_LABELS.length],
    qubits: physicalPair(r),
    fidelity: r.fidelity,
    threshold: r.threshold,
    pass: r.pass,
    color: r.pass ? PASS : FAIL,
  }));
  const placed = layout(result.topology, pairs.flatMap((p) => p.qubits));

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(SVG_PATH, renderSvg(result, placed, pairs));
  console.log(`[bell-map] wrote ${SVG_PATH}`);
  writeStepSummary(placed, pairs);
}

main();
