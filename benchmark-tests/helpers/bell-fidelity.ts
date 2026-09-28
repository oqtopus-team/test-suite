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
