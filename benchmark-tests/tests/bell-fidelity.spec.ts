/**
 * Layer-2 benchmark: Bell pair fidelity measurement.
 *
 * For each specified physical qubit pair, creates a Bell state |Φ+⟩ and
 * applies the inverse Bell circuit (CX → H) for Bell-basis measurement.
 * Fidelity = P(00) — the probability of measuring |00⟩ after the round-trip.
 *
 * Before running any circuit, the test validates that the target device
 * has enough qubits to support the requested physical qubit indices.
 * If the device has insufficient qubits, Bell fidelity tests are skipped
 * (not failed) so CI stays green for incompatible device/pair combos.
 *
 * Environment variables:
 *   BELL_QUBIT_PAIRS  — comma-separated physical qubit pairs (e.g. "0-1,2-3")
 *   BELL_SHOTS        — shots per measurement (default: 1000)
 *   DEVICE_ID         — target device (default: "qulacs")
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, request } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import { runSamplingJob, type SubmitParams } from '../helpers/job-runner';
import {
  bellCircuit,
  bellFidelity,
  parseQubitPairs,
  type QubitPair,
} from '../helpers/bell-fidelity';

const API_BASE = process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL;
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN ?? '';
const DEVICE_ID = process.env.DEVICE_ID ?? 'qulacs';
const SHOTS = Number(process.env.BELL_SHOTS) || 1_000;
const QUBIT_PAIRS_RAW = process.env.BELL_QUBIT_PAIRS ?? '';

const RESULTS_DIR = join(__dirname, '..', 'results');
const RESULT_JSON = join(RESULTS_DIR, 'bell-fidelity.json');
const RESULT_SUMMARY = join(RESULTS_DIR, 'bell-fidelity-summary.md');

// Shared state: set by beforeAll, checked by each test.
let skipReason = '';

// Accumulated results for summary table.
interface BellResult {
  pair: string;
  shots: number;
  fidelity: number;
  threshold: number;
  pass: boolean;
  counts: Record<string, number>;
}
const allResults: BellResult[] = [];

/** Build submission params for a Bell fidelity measurement. */
function submitParams(pair: QubitPair): SubmitParams {
  // On real hardware, disable the transpiler so gates target physical qubits
  // directly. On simulators (e.g. qulacs), use the default transpiler.
  const transpiler_info =
    DEVICE_ID === 'qulacs' ? {} : { transpiler_lib: null };

  return {
    name: `bell-fidelity-${pair[0]}-${pair[1]}`,
    description: `Bell fidelity for physical qubits ${pair[0]}-${pair[1]}`,
    device_id: DEVICE_ID,
    job_type: 'sampling',
    shots: SHOTS,
    transpiler_info,
    mitigation_info: {},
    simulator_info: {},
  };
}

/** Write all accumulated results to JSON and Markdown summary. */
function writeResults(): void {
  mkdirSync(RESULTS_DIR, { recursive: true });

  // JSON (for artifact download).
  writeFileSync(
    RESULT_JSON,
    `${JSON.stringify({ device: DEVICE_ID, shots: SHOTS, results: allResults }, null, 2)}\n`,
  );

  // Markdown summary table (for GITHUB_STEP_SUMMARY).
  const lines: string[] = [];
  lines.push('## Bell Pair Fidelity Results');
  lines.push('');
  lines.push(`**Device**: \`${DEVICE_ID}\` | **Shots**: ${SHOTS}`);
  lines.push('');

  if (skipReason) {
    lines.push(`> **Skipped**: ${skipReason}`);
  } else if (allResults.length === 0) {
    lines.push('> No results collected.');
  } else {
    lines.push('| Qubit Pair | Fidelity | Threshold | Result |');
    lines.push('|:----------:|:--------:|:---------:|:------:|');
    for (const r of allResults) {
      const icon = r.pass ? '✅' : '❌';
      lines.push(
        `| ${r.pair} | ${r.fidelity.toFixed(4)} | ${r.threshold} | ${icon} |`,
      );
    }
  }
  lines.push('');

  writeFileSync(RESULT_SUMMARY, lines.join('\n'));

  // Also append to GITHUB_STEP_SUMMARY if available.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, lines.join('\n'));
  }
}

test.describe('Bell pair fidelity (Layer 2)', () => {
  test.skip(
    !API_BASE,
    'USER_API_ENDPOINT (or E2E_API_BASE_URL) is not set',
  );
  test.skip(
    QUBIT_PAIRS_RAW === '',
    'BELL_QUBIT_PAIRS is not set (e.g. "0-1" or "0-1,2-3")',
  );

  // Extend timeout — job polling can take a while.
  test.setTimeout(600_000);

  const pairs = QUBIT_PAIRS_RAW ? parseQubitPairs(QUBIT_PAIRS_RAW) : [];

  // Validate qubit availability before any Bell fidelity test runs.
  test.beforeAll(async () => {
    const ctx = await request.newContext();
    try {
      const res = await ctx.get(`${API_BASE}/devices/${DEVICE_ID}`, {
        headers: { 'q-api-token': API_TOKEN },
      });
      if (res.status() !== 200) {
        skipReason =
          `GET /devices/${DEVICE_ID} returned ${res.status()} — cannot validate qubit capacity`;
        console.warn(`[bell] ${skipReason}`);
        return;
      }

      const body = await res.json();
      const nQubits = body?.n_qubits ?? body?.qubit_count ?? null;
      const maxIndex = Math.max(...pairs.flat());

      console.log(
        `[bell] device=${DEVICE_ID} n_qubits=${nQubits ?? 'unknown'} max_requested_index=${maxIndex}`,
      );

      if (nQubits != null && maxIndex >= nQubits) {
        skipReason =
          `Qubit index ${maxIndex} exceeds device capacity (n_qubits=${nQubits}). ` +
          `The device "${DEVICE_ID}" only has qubits 0..${nQubits - 1}. ` +
          `Use a device with more qubits or adjust BELL_QUBIT_PAIRS.`;
        console.warn(`[bell] SKIP: ${skipReason}`);
      }
    } finally {
      await ctx.dispose();
    }
  });

  // Write summary after all tests complete.
  test.afterAll(() => {
    writeResults();
  });

  for (const pair of pairs) {
    const label = `${pair[0]}-${pair[1]}`;

    test(`Bell fidelity for qubits ${label}`, async () => {
      test.skip(!!skipReason, skipReason);

      const threshold = loadThresholds().bellFidelity.minFidelity;
      const ctx = await request.newContext();

      try {
        const program = bellCircuit(pair);
        const params = submitParams(pair);

        console.log(`[bell] submitting job for qubits ${label}...`);
        console.log(`[bell] circuit:\n${program}`);
        const result = await runSamplingJob(ctx, [program], params);
        const fidelity = bellFidelity(result.counts);
        const pass = fidelity >= threshold;

        // Accumulate for summary.
        allResults.push({
          pair: label,
          shots: SHOTS,
          fidelity,
          threshold,
          pass,
          counts: result.counts,
        });

        // Report.
        const line = [
          `device=${DEVICE_ID}`,
          `pair=${label}`,
          `shots=${SHOTS}`,
          `fidelity=${fidelity.toFixed(4)}`,
          `threshold=${threshold}`,
        ].join(' ');
        console.log(`[bell] ${line}`);
        await test.info().attach('bell-fidelity', {
          body: line,
          contentType: 'text/plain',
        });

        expect(
          fidelity,
          `Bell fidelity ${fidelity.toFixed(4)} for qubits ${label} is below threshold ${threshold}`,
        ).toBeGreaterThanOrEqual(threshold);
      } finally {
        await ctx.dispose();
      }
    });
  }
});
