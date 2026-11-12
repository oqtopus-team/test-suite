/**
 * Layer-2 benchmark: Bell pair fidelity measurement.
 *
 * For each specified qubit pair, prepares a Bell state |Φ+⟩ = (|00⟩+|11⟩)/√2
 * using H → CX and measures in the computational (Z) basis.
 * Fidelity = P(00) + P(11) — correlation fidelity of the Bell state.
 *
 * Before running any circuit, the test validates that the target device
 * has enough qubits to support the requested physical qubit indices.
 * If the device has insufficient qubits, Bell fidelity tests are skipped
 * (not failed) so CI stays green for incompatible device/pair combos.
 *
 * Environment variables:
 *   BELL_QUBIT_PAIRS  — comma-separated qubit pairs (e.g. "0-1,2-3"), or "auto"
 *                        to pick the single coupling with the highest calibrated
 *                        fidelity in device_info and measure only that pair
 *                        (always in physical mode)
 *   BELL_QUBIT_MODE   — "physical" (default) or "logical"
 *                        physical: gates target physical qubits directly (transpiler disabled)
 *                        logical:  transpiler maps logical → physical qubits
 *   BELL_SHOTS        — shots per measurement (default: 1000)
 *   DEVICE_ID         — target device (default: "qulacs")
 *
 * Pair selection:
 *   auto   — BELL_QUBIT_PAIRS=auto (see above).
 *   manual — BELL_QUBIT_PAIRS lists the pairs as `control-target`. Each entry
 *            must be `<int>-<int>` with control ≠ target, otherwise the run
 *            fails. In physical mode on a device whose device_info reports
 *            couplings, every pair must also be a directed coupling
 *            (`2-1` passes only if control=2 → target=1 exists; `1-2` does
 *            not), because `cx control, target` is sent to the hardware as is.
 *            A pair that is not a coupling fails the run and the summary lists
 *            the available pairs. Devices without couplings (e.g. qulacs) and
 *            logical mode skip this coupling check.
 */

import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import { runSamplingJob, fetchTranspileResult, type SubmitParams } from '../helpers/job-runner';
import { resolveDeviceInfo } from '../helpers/device-info';
import {
  AUTO_PAIR,
  bellCircuit,
  bellFidelity,
  bestCoupling,
  checkPairsAgainstCouplings,
  directedCouplings,
  extractTopology,
  formatPairs,
  parseManualPairs,
  type BestCoupling,
  type Topology,
  type QubitPair,
} from '../helpers/bell-fidelity';
import {
  recordBellResult,
  recordBellRun,
  type QubitMapping,
} from '../helpers/bell-results';

const API_BASE = process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL;
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN ?? '';
const DEVICE_ID = process.env.DEVICE_ID ?? 'qulacs';
const SHOTS = Number(process.env.BELL_SHOTS) || 1_000;
const QUBIT_PAIRS_RAW = process.env.BELL_QUBIT_PAIRS ?? '';
const AUTO = QUBIT_PAIRS_RAW.trim().toLowerCase() === AUTO_PAIR;
// The auto-selected coupling is a physical pair, so it must not be remapped
// by the transpiler.
const QUBIT_MODE = (AUTO ? 'physical' : process.env.BELL_QUBIT_MODE ?? 'physical') as
  | 'physical'
  | 'logical';
const USE_PHYSICAL = QUBIT_MODE === 'physical' && DEVICE_ID !== 'qulacs';
// Manual mode: pairs are listed explicitly rather than auto-selected.
const MANUAL = !AUTO && QUBIT_PAIRS_RAW.trim() !== '';
const MANUAL_PARSE = MANUAL ? parseManualPairs(QUBIT_PAIRS_RAW) : { pairs: [] as QubitPair[] };
const PAIR_SELECTION = AUTO ? 'auto' : `manual (${QUBIT_PAIRS_RAW.trim()})`;

// Shared state: set by beforeAll, checked by each test. A failed test
// restarts the worker and beforeAll runs again, so these are recomputed.
let skipReason = '';
// Why the device could not be inspected (fails the run, not a skip).
let setupError = '';
// Why the manually specified pairs were rejected (fails the run, not a skip).
let pairError = MANUAL_PARSE.error ?? '';
// Directed couplings from device_info, when the manual pair check ran.
let availablePairs: QubitPair[] = [];
// Coupling picked from device_info when BELL_QUBIT_PAIRS=auto.
let selected: BestCoupling | null = null;
// Qubit positions and couplings from device_info, used to draw the qubit map.
let topology: Topology | null = null;

/**
 * Extract the logical→physical mapping of the measured pair from a transpile
 * result. Returns exactly two entries, ordered control then target, so the
 * summary and the qubit map show the pair rather than every mapped qubit.
 * Returns `undefined` when the pair cannot be located.
 */
function extractQubitMapping(
  transpileResult: Record<string, unknown>,
  pair: QubitPair,
): QubitMapping[] | undefined {
  console.log(`[bell] transpile result keys: ${JSON.stringify(Object.keys(transpileResult))}`);
  console.log(`[bell] transpile result: ${JSON.stringify(transpileResult, null, 2).slice(0, 2000)}`);

  const fromLookup = (lookup: Map<number, number>): QubitMapping[] | undefined => {
    const mapped = pair.map((l) => ({ logical: l, physical: lookup.get(l) }));
    return mapped.every((m) => Number.isInteger(m.physical))
      ? (mapped as QubitMapping[])
      : undefined;
  };

  // OQTOPUS returns { virtual_physical_mapping: { qubit_mapping: {...}, bit_mapping: {...} } },
  // so unwrap one level before falling back to a top-level qubit_mapping.
  const vpm = transpileResult.virtual_physical_mapping as
    | { qubit_mapping?: unknown }
    | undefined;
  const qm = transpileResult.qubit_mapping ?? vpm?.qubit_mapping ?? vpm;
  if (qm && typeof qm === 'object') {
    const entries: [unknown, unknown][] = Array.isArray(qm)
      ? qm.map((entry: unknown) => (entry as unknown[]).slice(0, 2) as [unknown, unknown])
      : Object.entries(qm as Record<string, unknown>);
    const lookup = new Map<number, number>();
    for (const [l, p] of entries) {
      if (Number.isInteger(Number(l)) && Number.isInteger(p)) lookup.set(Number(l), p as number);
    }
    const mapping = fromLookup(lookup);
    if (mapping) return mapping;
  }

  // Try: { layout: { initial_layout: [5, 3, ...] } } — index = logical, value = physical
  const layout = transpileResult.layout as Record<string, unknown> | undefined;
  const initialLayout = (layout?.initial_layout ?? transpileResult.initial_layout) as number[] | undefined;
  if (Array.isArray(initialLayout)) {
    const mapping = fromLookup(new Map(initialLayout.map((p, l) => [l, p])));
    if (mapping) return mapping;
  }

  // Try: the transpiled QASM. The source circuit measures control into c[0]
  // and target into c[1], so `c[i] = measure $n` gives the physical qubit of
  // pair[i].
  const transpiledQasm = (transpileResult.transpiled_program ?? transpileResult.transpiled_qasm
    ?? transpileResult.program ?? transpileResult.qasm) as string | undefined;
  if (typeof transpiledQasm === 'string') {
    console.log(`[bell] transpiled circuit:\n${transpiledQasm.slice(0, 1000)}`);
    const physical = measuredPhysicalQubits(transpiledQasm);
    if (physical[0] !== undefined && physical[1] !== undefined) {
      return pair.map((l, i) => ({ logical: l, physical: physical[i] as number }));
    }
  }

  return undefined;
}

/** Physical qubit measured into each classical bit, from `c[i] = measure $n`. */
function measuredPhysicalQubits(qasm: string): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  const pattern = /c\[(\d+)\]\s*=\s*measure\s+\$(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(qasm)) !== null) {
    out[Number(match[1])] = Number(match[2]);
  }
  return out;
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

  const pairs = MANUAL_PARSE.pairs ?? [];

  // Inspect the device before any Bell fidelity test runs. Failing to read it
  // fails the run; a skip is reserved for a device that was read and cannot
  // run the requested measurement.
  test.beforeAll(async () => {
    console.log(`[bell] Pair selection: ${PAIR_SELECTION}`);
    if (pairError) console.error(`[bell] qubit pair check failed: ${pairError}`);
    const ctx = await request.newContext();
    try {
      await inspectDevice(ctx);
    } catch (e) {
      setupError = e instanceof Error ? e.message : String(e);
      console.error(`[bell] ${setupError}`);
      throw e;
    } finally {
      await ctx.dispose();
      recordBellRun({
        device: DEVICE_ID,
        qubit_mode: QUBIT_MODE,
        pair_selection: PAIR_SELECTION,
        pairs: (selected ? [selected.pair] : pairs).map(([c, t]) => `${c}-${t}`),
        shots: SHOTS,
        selected,
        setup_error: setupError || null,
        pair_error: pairError || null,
        skip_reason: skipReason || null,
        available_pairs: availablePairs,
        topology,
      });
    }
  });

  async function inspectDevice(ctx: APIRequestContext): Promise<void> {
    const res = await ctx.get(`${API_BASE}/devices/${DEVICE_ID}`, {
      headers: { 'q-api-token': API_TOKEN, Authorization: API_TOKEN },
    });
    if (!res.ok()) {
      throw new Error(
        `GET /devices/${DEVICE_ID} returned ${res.status()}: ${(await res.text()).slice(0, 500)}`,
      );
    }

    const body = await res.json();
    // Physical mode skips the transpiler, so the circuit must use gates the
    // device accepts natively — log what the device reports for reference.
    console.log(
      `[bell] device basis_gates=${JSON.stringify(body?.basis_gates ?? null)} ` +
        `instructions=${JSON.stringify(body?.instructions ?? null)}`,
    );

    // device_info selects the pair (auto) and guards untranspiled CX gates
    // (manual physical), so a retrieval or decoding error fails those runs.
    // Otherwise it only feeds the qubit map and is best effort. Absent
    // device_info (null) is not an error: it takes the no-couplings path.
    let deviceInfo: unknown = null;
    try {
      deviceInfo = await resolveDeviceInfo(body?.device_info);
    } catch (e) {
      if (AUTO || (MANUAL && USE_PHYSICAL)) {
        throw new Error(`could not resolve device_info of "${DEVICE_ID}": ${e}`);
      }
      console.warn(`[bell] could not resolve device_info for the qubit map: ${e}`);
    }
    topology = extractTopology(deviceInfo);

    // Manual physical mode: `cx control, target` goes to the hardware as is,
    // so each pair must be a directed coupling of the device.
    if (MANUAL && USE_PHYSICAL) {
      const couplings = directedCouplings(deviceInfo);
      if (couplings.length === 0) {
        console.warn(
          `[bell] device_info of "${DEVICE_ID}" has no couplings — skipping the qubit pair check`,
        );
      } else {
        availablePairs = couplings;
        if (pairError) {
          pairError += ` Available pairs: ${formatPairs(couplings)}`;
        } else {
          pairError = checkPairsAgainstCouplings(pairs, couplings) ?? '';
          if (pairError) {
            console.error(`[bell] qubit pair check failed: ${pairError}`);
          } else {
            console.log(
              `[bell] qubit pair check passed: ${formatPairs(pairs)} are couplings of ${DEVICE_ID}`,
            );
          }
        }
      }
    }

    if (AUTO) {
      if (process.env.BELL_QUBIT_MODE === 'logical') {
        console.warn('[bell] BELL_QUBIT_PAIRS=auto always runs in physical mode');
      }
      selected = bestCoupling(deviceInfo);
      if (!selected) {
        skipReason =
          `device_info of "${DEVICE_ID}" has no coupling with a calibrated fidelity — ` +
          `cannot auto-select a qubit pair`;
        console.warn(`[bell] SKIP: ${skipReason}`);
        return;
      }
      console.log(
        `[bell] auto-selected pair ${selected.pair.join('-')} ` +
          `(calibrated 2Q fidelity ${selected.fidelity})`,
      );
    }

    const requested = (selected ? selected.pair : pairs.flat());
    if (requested.length === 0) return;
    const nQubits = body?.n_qubits ?? body?.qubit_count ?? null;

    // Physical qubits are addressed by the ids in device_info.qubits, which
    // need not be 0..n_qubits-1; fall back to that contiguous range only
    // when the device reports no qubit metadata. Logical qubits index a
    // virtual register, so only its size has to fit within n_qubits.
    if (USE_PHYSICAL) {
      const ids = topology?.qubits.map((q) => q.id) ?? null;
      const known = ids ?? (nQubits != null ? [...Array(nQubits).keys()] : null);
      console.log(
        `[bell] device=${DEVICE_ID} qubit ids=${ids ? 'device_info.qubits' : `0..${nQubits == null ? '?' : nQubits - 1} (n_qubits)`} requested=${[...new Set(requested)].join(',')}`,
      );
      const missing = known ? [...new Set(requested)].filter((q) => !known.includes(q)) : [];
      if (missing.length > 0) {
        skipReason =
          `Qubit ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not a qubit of ` +
          `"${DEVICE_ID}" (${ids ? 'device_info.qubits ids' : `n_qubits=${nQubits}`}: ` +
          `${known!.join(', ')}). Use a device with these qubits or adjust BELL_QUBIT_PAIRS.`;
        console.warn(`[bell] SKIP: ${skipReason}`);
      }
      return;
    }

    const maxIndex = Math.max(...requested);
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
  }

  async function measure(pair: QubitPair): Promise<void> {
    const label = `${pair[0]}-${pair[1]}`;
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
          // Detect transpiler folding the identity circuit.
          const stats = transpileResult.stats as
            | { after?: { n_gates_2q?: number } }
            | undefined;
          if (stats?.after?.n_gates_2q === 0) {
            console.warn(
              `[bell] WARNING: transpiled circuit has 0 two-qubit gates. ` +
              `The transpiler likely folded the round-trip (identity) circuit. ` +
              `Fidelity measures readout error, not Bell pair entanglement.`,
            );
          }
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

      // Persist per pair (a retry replaces it); global teardown aggregates.
      recordBellResult({
        pair: label,
        shots: SHOTS,
        fidelity,
        threshold,
        pass,
        counts: result.counts,
        qubit_mapping,
        retry: test.info().retry,
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
  }

  if (AUTO) {
    test('Bell fidelity for the best-calibrated physical coupling', async () => {
      test.skip(!!skipReason, skipReason);
      await measure(selected!.pair);
    });
  }

  if (MANUAL) {
    test('Bell qubit pair check (manual)', async () => {
      if (pairError) throw new Error(`Qubit pair check failed: ${pairError}`);
      test.skip(!!skipReason, skipReason);
    });
  }

  for (const pair of pairs) {
    test(`Bell fidelity for ${QUBIT_MODE} qubits ${pair[0]}-${pair[1]}`, async () => {
      test.skip(!!pairError, 'qubit pair check failed');
      test.skip(!!skipReason, skipReason);
      await measure(pair);
    });
  }
});
