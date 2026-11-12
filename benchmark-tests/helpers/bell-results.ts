/**
 * Persistence for Layer-2 Bell pair fidelity results.
 *
 * A failing test makes Playwright restart its worker, so state held in the
 * spec module does not survive a run. The spec therefore writes the run
 * context (`_run.json`) and one entry per measured pair (`pair-<c>-<t>.json`)
 * to `results/bell/`; a retry overwrites the same file so the final attempt
 * wins. Global setup clears the directory and global teardown merges the
 * entries into `results/bell-fidelity.json` (read by `render-bell-map.mjs`)
 * and `results/bell-fidelity-summary.md` (appended to the Job Summary).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { BellBasis, BellExpectations, BestCoupling, QubitPair, Topology } from './bell-fidelity';

const RESULTS_DIR = join(__dirname, '..', 'results');
const ENTRY_DIR = join(RESULTS_DIR, 'bell');
const RUN_PATH = join(ENTRY_DIR, '_run.json');
const RESULT_JSON = join(RESULTS_DIR, 'bell-fidelity.json');
const RESULT_SUMMARY = join(RESULTS_DIR, 'bell-fidelity-summary.md');

export interface QubitMapping {
  logical: number;
  physical: number;
}

/** One measurement basis of a pair. */
export interface BellBasisResult {
  counts: unknown;
  /** ⟨PP⟩ = P(even) − P(odd); `null` when the counts were rejected. */
  expectation: number | null;
  job_id?: string;
}

/** One measured pair. `qubit_mapping` is ordered control, target. */
export interface BellResult {
  pair: string;
  /**
   * Physical qubits the pair ran on (`control-target`), or `null` when
   * unknown — a logical run whose transpile result had no usable mapping.
   */
  physical_pair: string | null;
  /** Shots per basis. */
  shots: number;
  /**
   * Fidelity with |Φ+⟩, F = (1 + ⟨XX⟩ − ⟨YY⟩ + ⟨ZZ⟩) / 4; `null` when the
   * result could not be evaluated (see `error`).
   */
  fidelity: number | null;
  /** Parity expectations of the three bases; `null` with `error`. */
  expectations: BellExpectations | null;
  threshold: number;
  pass: boolean;
  /** Counts and expectation per measured basis. */
  bases: Partial<Record<BellBasis, BellBasisResult>>;
  qubit_mapping?: QubitMapping[];
  /** Why the sampling result was rejected (e.g. malformed counts). */
  error?: string;
  /** Playwright retry index of the attempt that produced this entry. */
  retry: number;
}

/** Context of the run, written once the device has been inspected. */
export interface BellRun {
  device: string;
  qubit_mode: 'physical' | 'logical';
  pair_selection: string;
  /** Requested pairs (`control-target`), in the order they are measured. */
  pairs: string[];
  /** Shots per basis. */
  shots: number;
  selected: BestCoupling | null;
  /** Why the run could not start (device lookup failed); fails the run. */
  setup_error: string | null;
  /** Why the manually specified pairs were rejected; fails the run. */
  pair_error: string | null;
  /** Why the measurement is not possible on this device; a skip. */
  skip_reason: string | null;
  available_pairs: QubitPair[];
  topology: Topology | null;
}

/** Record (or replace) the run context. */
export function recordBellRun(run: BellRun): void {
  mkdirSync(ENTRY_DIR, { recursive: true });
  writeFileSync(RUN_PATH, `${JSON.stringify(run, null, 2)}\n`);
}

/** Record (or replace on retry) the result for a single pair. */
export function recordBellResult(result: BellResult): void {
  mkdirSync(ENTRY_DIR, { recursive: true });
  writeFileSync(
    join(ENTRY_DIR, `pair-${result.pair}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

/** Drop entries and outputs left over from a previous run. */
export function clearBellResults(): void {
  rmSync(ENTRY_DIR, { recursive: true, force: true });
  rmSync(RESULT_JSON, { force: true });
  rmSync(RESULT_SUMMARY, { force: true });
}

/** Read the per-pair entries in the order they were requested. */
function readResults(order: string[]): BellResult[] {
  const files = readdirSync(ENTRY_DIR).filter((f) => f.startsWith('pair-') && f.endsWith('.json'));
  const results = files.map(
    (f) => JSON.parse(readFileSync(join(ENTRY_DIR, f), 'utf-8')) as BellResult,
  );
  const rank = (pair: string) => {
    const i = order.indexOf(pair);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return results.sort((a, b) => rank(a.pair) - rank(b.pair) || a.pair.localeCompare(b.pair));
}

/** Markdown summary for GITHUB_STEP_SUMMARY. */
function renderSummary(run: BellRun, results: BellResult[]): string {
  const lines: string[] = [];
  lines.push('## Bell Pair Fidelity Results');
  lines.push('');
  lines.push(
    `**Device**: \`${run.device}\` | **Qubit mode**: ${run.qubit_mode} | **Shots**: ${run.shots} per basis (ZZ, XX, YY)`,
  );
  lines.push('');
  lines.push(`**Pair selection**: ${run.pair_selection}`);
  lines.push('');

  if (run.selected) {
    lines.push(
      `**Auto-selected pair**: \`${run.selected.pair.join('-')}\` ` +
        `(highest calibrated 2Q fidelity: ${run.selected.fidelity.toFixed(4)})`,
    );
    lines.push('');
  }

  if (run.setup_error) {
    lines.push(`> **Failed**: ${run.setup_error}`);
  } else if (run.pair_error) {
    lines.push(`> **Qubit pair check failed**: ${run.pair_error}`);
  } else if (run.skip_reason) {
    lines.push(`> **Skipped**: ${run.skip_reason}`);
  } else if (results.length === 0) {
    lines.push('> No results collected.');
  } else {
    const num = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(4));
    lines.push(
      '| Logical Qubit Pair | Physical Qubit Pair | Fidelity F | ⟨ZZ⟩ | ⟨XX⟩ | ⟨YY⟩ | Threshold | Result |',
    );
    lines.push(
      '|:------------------:|:-------------------:|:----------:|:----:|:----:|:----:|:---------:|:------:|',
    );
    for (const r of results) {
      const icon = r.error ? `❌ ${r.error}` : r.pass ? '✅' : '❌';
      const e = r.expectations;
      lines.push(
        `| ${r.pair} | ${r.physical_pair ?? 'unknown'} | ${num(r.fidelity)} | ` +
          `${num(e?.zz ?? r.bases.ZZ?.expectation)} | ${num(e?.xx ?? r.bases.XX?.expectation)} | ` +
          `${num(e?.yy ?? r.bases.YY?.expectation)} | ${r.threshold} | ${icon} |`,
      );
    }
    lines.push('');
    lines.push('F = (1 + ⟨XX⟩ − ⟨YY⟩ + ⟨ZZ⟩) / 4 is the fidelity with |Φ+⟩; F > 0.5 means the pair is entangled.');
    lines.push('');
    lines.push('<details><summary>Counts per basis</summary>');
    lines.push('');
    lines.push('| Logical Qubit Pair | ZZ | XX | YY |');
    lines.push('|:------------------:|:--:|:--:|:--:|');
    const fmt = (c: unknown) =>
      c != null && typeof c === 'object' && !Array.isArray(c)
        ? Object.entries(c as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : c === undefined
          ? '—'
          : JSON.stringify(c);
    for (const r of results) {
      lines.push(
        `| ${r.pair} | ${fmt(r.bases.ZZ?.counts)} | ${fmt(r.bases.XX?.counts)} | ${fmt(r.bases.YY?.counts)} |`,
      );
    }
    lines.push('');
    lines.push('</details>');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Merge the run context and per-pair entries into `bell-fidelity.json` and
 * `bell-fidelity-summary.md`; no-op when the Bell spec did not run.
 */
export function aggregateBellResults(): void {
  if (!existsSync(RUN_PATH)) return;
  const run = JSON.parse(readFileSync(RUN_PATH, 'utf-8')) as BellRun;
  const results = readResults(run.pairs);
  writeFileSync(RESULT_JSON, `${JSON.stringify({ ...run, results }, null, 2)}\n`);
  writeFileSync(RESULT_SUMMARY, renderSummary(run, results));
}

