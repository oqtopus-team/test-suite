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
 *   BELL_QUBIT_PAIRS  — comma-separated qubit pairs (e.g. "0-1,2-3")
 *   BELL_QUBIT_MODE   — "physical" (default) or "logical"
 *                        physical: gates target physical qubits directly (transpiler disabled)
 *                        logical:  transpiler maps logical → physical qubits
 *   BELL_SHOTS        — shots per measurement (default: 1000)
 *   DEVICE_ID         — target device (default: "qulacs")
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, request } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import { runSamplingJob, fetchTranspileResult, type SubmitParams } from '../helpers/job-runner';
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
const QUBIT_MODE = (process.env.BELL_QUBIT_MODE ?? 'physical') as
  | 'physical'
  | 'logical';
const USE_PHYSICAL = QUBIT_MODE === 'physical' && DEVICE_ID !== 'qulacs';

const RESULTS_DIR = join(__dirname, '..', 'results');
const RESULT_JSON = join(RESULTS_DIR, 'bell-fidelity.json');
const RESULT_SUMMARY = join(RESULTS_DIR, 'bell-fidelity-summary.md');

// Shared state: set by beforeAll, checked by each test.
let skipReason = '';

// Accumulated results for summary table.
interface QubitMapping {
  logical: number;
  physical: number;
}

interface BellResult {
  pair: string;
  shots: number;
  fidelity: number;
  threshold: number;
  pass: boolean;
  counts: Record<string, number>;
  qubit_mapping?: QubitMapping[];
}
const allResults: BellResult[] = [];

/**
 * Extract logical→physical qubit mapping from a transpile result.
 * Tries multiple known formats (Qiskit layout, OQTOPUS mapping).
 */
function extractQubitMapping(
  transpileResult: Record<string, unknown>,
  pair: QubitPair,
): QubitMapping[] | undefined {
  console.log(`[bell] transpile result keys: ${JSON.stringify(Object.keys(transpileResult))}`);
  console.log(`[bell] transpile result: ${JSON.stringify(transpileResult, null, 2).slice(0, 2000)}`);

  // OQTOPUS returns { virtual_physical_mapping: { qubit_mapping: {...}, bit_mapping: {...} } },
  // so unwrap one level before falling back to a top-level qubit_mapping.
  const vpm = transpileResult.virtual_physical_mapping as
    | { qubit_mapping?: unknown }
    | undefined;
  const qm = transpileResult.qubit_mapping ?? vpm?.qubit_mapping ?? vpm;
  if (qm && typeof qm === 'object') {
    if (Array.isArray(qm)) {
      return qm.map((entry: unknown) => {
        const arr = entry as number[];
        return { logical: arr[0], physical: arr[1] };
      });
    }
    return Object.entries(qm as Record<string, number>).map(([l, p]) => ({
      logical: Number(l),
      physical: p,
    }));
  }

  // Try: { layout: { initial_layout: [5, 3, ...] } } — index = logical, value = physical
  const layout = transpileResult.layout as Record<string, unknown> | undefined;
  const initialLayout = (layout?.initial_layout ?? transpileResult.initial_layout) as number[] | undefined;
  if (Array.isArray(initialLayout)) {
    return pair.map((logicalIdx) => ({
      logical: logicalIdx,
      physical: initialLayout[logicalIdx] ?? logicalIdx,
    }));
  }

  // Try: embedded in transpiled QASM — parse physical qubit indices from the circuit
  const transpiledQasm = (transpileResult.transpiled_program ?? transpileResult.transpiled_qasm
    ?? transpileResult.program ?? transpileResult.qasm) as string | undefined;
  if (typeof transpiledQasm === 'string') {
    console.log(`[bell] transpiled circuit:\n${transpiledQasm.slice(0, 1000)}`);
    const physicalQubits = extractPhysicalQubitsFromQasm(transpiledQasm);
    if (physicalQubits.length >= 2) {
      return pair.map((logicalIdx, i) => ({
        logical: logicalIdx,
        physical: physicalQubits[i] ?? logicalIdx,
      }));
    }
  }

  return undefined;
}

/**
 * Extract the physical qubit indices used in a transpiled QASM circuit
 * by looking for CX/cx gate operations.
 */
function extractPhysicalQubitsFromQasm(qasm: string): number[] {
  const qubits = new Set<number>();
  const cxPattern = /cx\s+q\[(\d+)\]\s*,\s*q\[(\d+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = cxPattern.exec(qasm)) !== null) {
    qubits.add(Number(match[1]));
    qubits.add(Number(match[2]));
  }
  return [...qubits].sort((a, b) => a - b);
}

/** Build submission params for a Bell fidelity measurement. */
function submitParams(pair: QubitPair): SubmitParams {
  const transpiler_info = USE_PHYSICAL ? { transpiler_lib: null } : {};

  return {
    name: `bell-fidelity-${pair[0]}-${pair[1]}`,
    description: `Bell fidelity for ${QUBIT_MODE} qubits ${pair[0]}-${pair[1]}`,
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
    `${JSON.stringify({ device: DEVICE_ID, qubit_mode: QUBIT_MODE, shots: SHOTS, results: allResults }, null, 2)}\n`,
  );

  // Markdown summary table (for GITHUB_STEP_SUMMARY).
  const lines: string[] = [];
  lines.push('## Bell Pair Fidelity Results');
  lines.push('');
  lines.push(
    `**Device**: \`${DEVICE_ID}\` | **Qubit mode**: ${QUBIT_MODE} | **Shots**: ${SHOTS}`,
  );
  lines.push('');

  if (skipReason) {
    lines.push(`> **Skipped**: ${skipReason}`);
  } else if (allResults.length === 0) {
    lines.push('> No results collected.');
  } else {
    lines.push('| Logical Qubit Pair | Physical Qubit Pair | Fidelity | Threshold | Counts | Result |');
    lines.push('|:------------------:|:-------------------:|:--------:|:---------:|:------:|:------:|');
    for (const r of allResults) {
      const icon = r.pass ? '✅' : '❌';
      const counts = Object.entries(r.counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const physicalPair = r.qubit_mapping
        ? r.qubit_mapping.map((m) => `${m.physical}`).join('-')
        : r.pair;
      lines.push(
        `| ${r.pair} | ${physicalPair} | ${r.fidelity.toFixed(4)} | ${r.threshold} | ${counts} | ${icon} |`,
      );
    }
  }
  lines.push('');

  writeFileSync(RESULT_SUMMARY, lines.join('\n'));
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

    test(`Bell fidelity for ${QUBIT_MODE} qubits ${label}`, async () => {
      test.skip(!!skipReason, skipReason);

      const threshold = loadThresholds().bellFidelity.minFidelity;
      const ctx = await request.newContext();

      try {
        const program = bellCircuit(pair, USE_PHYSICAL);
        const params = submitParams(pair);

        console.log(`[bell] submitting job for ${QUBIT_MODE} qubits ${label}...`);
        console.log(`[bell] circuit:\n${program}`);
        const { result, job } = await runSamplingJob(ctx, [program], params);
        const fidelity = bellFidelity(result.counts);
        const pass = fidelity >= threshold;

        // Fetch transpile result to extract logical→physical qubit mapping.
        let qubit_mapping: QubitMapping[] | undefined;
        if (QUBIT_MODE === 'logical') {
          const transpileResult = await fetchTranspileResult(ctx, job);
          if (transpileResult) {
            qubit_mapping = extractQubitMapping(transpileResult, pair);
            if (qubit_mapping) {
              const mappingStr = qubit_mapping
                .map((m) => `L${m.logical}→P${m.physical}`)
                .join(', ');
              console.log(`[bell] qubit mapping: ${mappingStr}`);
            } else {
              console.warn(`[bell] Could not extract qubit mapping from transpile result`);
            }
          } else {
            console.log(`[bell] No transpile result available`);
          }
        } else if (USE_PHYSICAL) {
          qubit_mapping = pair.map((q) => ({ logical: q, physical: q }));
          console.log(`[bell] physical mode: qubits ${label} target hardware directly`);
        }

        // Accumulate for summary.
        allResults.push({
          pair: label,
          shots: SHOTS,
          fidelity,
          threshold,
          pass,
          counts: result.counts,
          qubit_mapping,
        });

        // Report.
        const mappingInfo = qubit_mapping
          ? ` mapping=${qubit_mapping.map((m) => `L${m.logical}→P${m.physical}`).join(',')}`
          : '';
        const line = [
          `device=${DEVICE_ID}`,
          `mode=${QUBIT_MODE}`,
          `pair=${label}`,
          `shots=${SHOTS}`,
          `fidelity=${fidelity.toFixed(4)}`,
          `threshold=${threshold}`,
        ].join(' ') + mappingInfo;
        console.log(`[bell] ${line}`);
        await test.info().attach('bell-fidelity', {
          body: line,
          contentType: 'text/plain',
        });

        expect(
          fidelity,
          `Bell fidelity ${fidelity.toFixed(4)} for ${QUBIT_MODE} qubits ${label} is below threshold ${threshold}`,
        ).toBeGreaterThanOrEqual(threshold);
      } finally {
        await ctx.dispose();
      }
    });
  }
});
