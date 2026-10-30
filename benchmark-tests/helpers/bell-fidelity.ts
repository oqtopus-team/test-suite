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
 * In physical mode the circuit uses OpenQASM 3 hardware-qubit syntax (`$n`);
 * otherwise a virtual register sized to `max(q0, q1) + 1` is declared.
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
    `h ${ref(q0)};`,
    `cx ${ref(q0)}, ${ref(q1)};`,
    '',
    `c[0] = measure ${ref(q0)};`,
    `c[1] = measure ${ref(q1)};`,
    '',
  ];

  return lines.join('\n');
}

// ── Fidelity computation ───────────────────────────────────────────

/**
 * Compute Bell pair fidelity as P(00) + P(11) from measurement counts.
 *
 * |Φ+⟩ = (|00⟩ + |11⟩)/√2 — a perfect Bell state yields P(00) = P(11) = 0.5.
 * Fidelity = P(00) + P(11) measures how well the correlated outcomes are preserved.
 */
export function bellFidelity(counts: Record<string, number>): number {
  if (counts == null || typeof counts !== 'object') {
    throw new Error(
      `bellFidelity: expected counts object, got ${JSON.stringify(counts)}`,
    );
  }
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
