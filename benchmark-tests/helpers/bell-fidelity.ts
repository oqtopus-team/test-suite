/**
 * Bell pair fidelity measurement — circuit generation and analysis.
 *
 * Prepares a Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2 on two qubits and measures
 * in the computational (Z) basis.
 *
 * For a perfect Bell state, P(00) = P(11) = 0.5, so:
 *   Fidelity = P(00) + P(11)
 */

// ── Circuit generation ─────────────────────────────────────────────

/**
 * Generate an OpenQASM 3 circuit that prepares |Φ+⟩ on the given qubit pair
 * and measures in the computational (Z) basis.
 *
 * Circuit: H → CX → measure
 *
 * In physical mode the circuit uses OpenQASM 3 hardware-qubit syntax (`$n`)
 * and skips the transpiler, so it is written in native gates only: H is
 * emitted as `rz(pi/2); sx; rz(pi/2)` (equal to H up to a global phase) —
 * the same decomposition the device transpiler produces for `rz`/`sx`/`cx`
 * hardware such as A-II. Otherwise a virtual register sized to
 * `max(q0, q1) + 1` is declared and the transpiler handles `h` itself.
 */
export function bellCircuit(pair: QubitPair, physical = false): string {
  const [q0, q1] = pair;

  const decls = physical
    ? ['bit[2] c;']
    : [`qubit[${Math.max(q0, q1) + 1}] q;`, 'bit[2] c;'];
  const ref = (q: number) => (physical ? `$${q}` : `q[${q}]`);

  const lines = [
    'OPENQASM 3;',
    'include "stdgates.inc";',
    ...decls,
    '',
    ...(physical
      ? [`rz(pi/2) ${ref(q0)};`, `sx ${ref(q0)};`, `rz(pi/2) ${ref(q0)};`]
      : [`h ${ref(q0)};`]),
    `cx ${ref(q0)}, ${ref(q1)};`,
    '',
    `c[0] = measure ${ref(q0)};`,
    `c[1] = measure ${ref(q1)};`,
    '',
  ];

  return lines.join('\n');
}

// ── Fidelity computation ───────────────────────────────────────────

/** A measured outcome of the two-qubit circuit (leading zeros may be dropped). */
const OUTCOME_RE = /^[01]{1,2}$/;

/**
 * Why `counts` is not a valid two-qubit sampling result, or `null` when it is.
 * Every label must be a 2-bit binary outcome (`00`..`11`; a 1-bit label is
 * read with its leading zero dropped), every count a non-negative integer, and
 * the total positive — so a malformed API result fails the benchmark instead
 * of producing a fidelity such as 1 (`{foo: 1000}`) or 2 (negative counts).
 */
export function invalidCounts(counts: unknown): string | null {
  if (counts == null || typeof counts !== 'object' || Array.isArray(counts)) {
    return `expected a counts object, got ${JSON.stringify(counts)}`;
  }
  const entries = Object.entries(counts as Record<string, unknown>);
  if (entries.length === 0) return 'counts is empty';
  const badLabels = entries.filter(([k]) => !OUTCOME_RE.test(k)).map(([k]) => JSON.stringify(k));
  if (badLabels.length > 0) {
    return `outcome labels must be 2-bit binary strings (00, 01, 10, 11), got ${badLabels.join(', ')}`;
  }
  const badCounts = entries
    .filter(([, v]) => !Number.isInteger(v) || (v as number) < 0)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  if (badCounts.length > 0) {
    return `counts must be non-negative integers, got ${badCounts.join(', ')}`;
  }
  if (entries.reduce((sum, [, v]) => sum + (v as number), 0) === 0) return 'total count is 0';
  return null;
}

/**
 * Compute Bell pair fidelity as P(00) + P(11) from measurement counts.
 * Throws when the counts are malformed (see `invalidCounts`).
 *
 * |Φ+⟩ = (|00⟩ + |11⟩)/√2 — a perfect Bell state yields P(00) = P(11) = 0.5.
 * Fidelity = P(00) + P(11) measures how well the correlated outcomes are preserved.
 */
export function bellFidelity(counts: Record<string, number>): number {
  const invalid = invalidCounts(counts);
  if (invalid) throw new Error(`bellFidelity: invalid sampling counts: ${invalid}`);
  let total = 0;
  let countCorrelated = 0;

  for (const [bitstring, count] of Object.entries(counts)) {
    total += count;
    const bits = bitstring.padStart(2, '0');
    const b0 = bits[bits.length - 2];
    const b1 = bits[bits.length - 1];
    if (b0 === b1) {
      countCorrelated += count;
    }
  }

  if (total === 0) return 0;
  return countCorrelated / total;
}

// ── Configuration parsing ──────────────────────────────────────────

export type QubitPair = [number, number];

/**
 * Parse a comma-separated list of qubit pairs from an environment variable.
 *
 * Format: "0-1" or "0-1,2-3,4-5"
 * Each pair specifies two qubit numbers separated by a hyphen.
 */
export function parseQubitPairs(value: string): QubitPair[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const parts = s.split('-').map(Number);
      if (
        parts.length !== 2 ||
        !Number.isInteger(parts[0]) ||
        !Number.isInteger(parts[1])
      ) {
        throw new Error(
          `Invalid qubit pair "${s}": expected format "q0-q1" (e.g. "0-1")`,
        );
      }
      return parts as QubitPair;
    });
}

/** Value of `BELL_QUBIT_PAIRS` that selects the best-calibrated coupling. */
export const AUTO_PAIR = 'auto';

/** A coupling chosen from `device_info.couplings`. */
export interface BestCoupling {
  pair: QubitPair;
  /** Calibrated two-qubit gate fidelity reported in `device_info`. */
  fidelity: number;
}

/**
 * Pick the coupling with the highest calibrated fidelity from
 * `device_info.couplings` (an array, as the User-API returns, or a keyed
 * object). Each entry is `{ control, target, fidelity }`.
 *
 * Entries without a finite `fidelity` in [0, 1] or without integer
 * `control` / `target` are ignored. Ties keep the first entry. Returns `null`
 * when no usable coupling exists.
 */
export function bestCoupling(deviceInfo: unknown): BestCoupling | null {
  if (deviceInfo == null || typeof deviceInfo !== 'object') return null;
  const couplings = (deviceInfo as { couplings?: unknown }).couplings;
  if (couplings == null || typeof couplings !== 'object') return null;

  let best: BestCoupling | null = null;
  for (const entry of Object.values(couplings)) {
    if (entry == null || typeof entry !== 'object') continue;
    const { control, target, fidelity } = entry as Record<string, unknown>;
    if (!Number.isInteger(control) || !Number.isInteger(target)) continue;
    if (typeof fidelity !== 'number' || !Number.isFinite(fidelity)) continue;
    if (fidelity < 0 || fidelity > 1) continue;
    if (best === null || fidelity > best.fidelity) {
      best = { pair: [control as number, target as number], fidelity };
    }
  }
  return best;
}

// ── Manual pair validation ─────────────────────────────────────────

const MANUAL_PAIR_RE = /^\d+-\d+$/;

/** Format a pair list as `` `0-1`, `2-3` `` for messages and summaries. */
export function formatPairs(pairs: QubitPair[]): string {
  return pairs.map(([c, t]) => `\`${c}-${t}\``).join(', ');
}

/**
 * Strictly parse a manually specified `BELL_QUBIT_PAIRS` value
 * (`control-target`, comma-separated). Returns the pairs, or the reason the
 * value is rejected: empty, malformed entries, or control equal to target.
 */
export function parseManualPairs(
  value: string,
): { pairs: QubitPair[]; error?: undefined } | { pairs?: undefined; error: string } {
  if (value.trim() === '') {
    return { error: 'BELL_QUBIT_PAIRS is empty. Set `control-target` qubit numbers, e.g. `0-1` or `0-1,2-3`.' };
  }
  const tokens = value.split(',').map((s) => s.trim());
  const bad = tokens.filter((s) => !MANUAL_PAIR_RE.test(s));
  if (bad.length > 0) {
    return {
      error:
        `BELL_QUBIT_PAIRS has invalid entries: ${bad.map((s) => `\`${s}\``).join(', ')}. ` +
        'Use `control-target` with qubit numbers, comma-separated, e.g. `0-1,2-3`.',
    };
  }
  const pairs = tokens.map((s) => s.split('-').map(Number) as QubitPair);
  const same = pairs.filter(([c, t]) => c === t);
  if (same.length > 0) {
    return { error: `control and target must differ: ${formatPairs(same)}.` };
  }
  return { pairs };
}

/**
 * Directed `control → target` couplings in `device_info.couplings` (an array
 * or a keyed object). Entries without integer `control` / `target` are
 * skipped; the calibrated fidelity is not required here.
 */
export function directedCouplings(deviceInfo: unknown): QubitPair[] {
  if (deviceInfo == null || typeof deviceInfo !== 'object') return [];
  const couplings = (deviceInfo as { couplings?: unknown }).couplings;
  if (couplings == null || typeof couplings !== 'object') return [];
  const out: QubitPair[] = [];
  for (const entry of Object.values(couplings)) {
    if (entry == null || typeof entry !== 'object') continue;
    const { control, target } = entry as Record<string, unknown>;
    if (Number.isInteger(control) && Number.isInteger(target)) {
      out.push([control as number, target as number]);
    }
  }
  return out;
}

/**
 * Check manually specified pairs against the device's directed couplings.
 * Physical mode sends `cx control, target` to the hardware as is, so `2-1`
 * passes only when a coupling with control 2 and target 1 exists — `1-2`
 * does not. Returns `null` when every pair is a coupling, or the reason
 * (including the list of valid pairs) otherwise. Callers skip the check when
 * the device reports no couplings at all.
 */
export function checkPairsAgainstCouplings(
  pairs: QubitPair[],
  couplings: QubitPair[],
): string | null {
  const known = new Set(couplings.map(([c, t]) => `${c}-${t}`));
  const missing = pairs.filter(([c, t]) => !known.has(`${c}-${t}`));
  if (missing.length === 0) return null;
  return (
    `${formatPairs(missing)} ${missing.length === 1 ? 'is' : 'are'} not in device_info.couplings ` +
    '(couplings are directed: `control-target`). ' +
    `Available pairs: ${formatPairs(couplings)}`
  );
}

// ── Device topology (for the qubit map) ────────────────────────────

/** A qubit and its on-chip position, as reported in `device_info.qubits`. */
export interface TopologyQubit {
  id: number;
  physical_id?: number;
  x?: number;
  y?: number;
}

/** Qubits and couplings of a device, reduced to what the qubit map draws. */
export interface Topology {
  qubits: TopologyQubit[];
  couplings: QubitPair[];
}

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Extract qubit ids, positions (`position: { x, y }`) and coupling edges from
 * `device_info`. Malformed entries are skipped rather than thrown on, because
 * the map is informational. Returns `null` when there are no qubits.
 */
export function extractTopology(deviceInfo: unknown): Topology | null {
  if (deviceInfo == null || typeof deviceInfo !== 'object') return null;
  const { qubits, couplings } = deviceInfo as { qubits?: unknown; couplings?: unknown };

  const outQubits: TopologyQubit[] = [];
  if (qubits != null && typeof qubits === 'object') {
    for (const entry of Object.values(qubits)) {
      if (entry == null || typeof entry !== 'object') continue;
      const { id, physical_id, position } = entry as Record<string, unknown>;
      if (!isInt(id)) continue;
      const q: TopologyQubit = { id };
      if (isInt(physical_id)) q.physical_id = physical_id;
      if (position != null && typeof position === 'object') {
        const { x, y } = position as Record<string, unknown>;
        if (isNum(x) && isNum(y)) {
          q.x = x;
          q.y = y;
        }
      }
      outQubits.push(q);
    }
  }
  if (outQubits.length === 0) return null;

  const outCouplings: QubitPair[] = [];
  if (couplings != null && typeof couplings === 'object') {
    for (const entry of Object.values(couplings)) {
      if (entry == null || typeof entry !== 'object') continue;
      const { control, target } = entry as Record<string, unknown>;
      if (isInt(control) && isInt(target)) outCouplings.push([control, target]);
    }
  }
  return { qubits: outQubits, couplings: outCouplings };
}
