/**
 * Bell pair fidelity measurement — circuit generation and analysis.
 *
 * Creates a Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2 on two qubits, then applies
 * the inverse Bell circuit (CX → H) to measure in the Bell basis.
 *
 * For a perfect Bell state the inverse maps back to |00⟩, so:
 *   Fidelity = P(00)
 */

// ── Circuit generation ─────────────────────────────────────────────

/**
 * Generate an OpenQASM 3 circuit that prepares |Φ+⟩ on the given qubit pair
 * and then applies the inverse Bell circuit for Bell-basis measurement.
 *
 * Circuit: H → CX → CX → H → measure
 *
 * The qubit indices can represent either physical or logical qubits depending
 * on the BELL_QUBIT_MODE setting. In physical mode (`transpiler_lib: null`),
 * gates target hardware qubits directly. In logical mode, the transpiler
 * maps logical indices to physical qubits.
 *
 * The qubit register is sized to `max(q0, q1) + 1` so the indices are valid.
 * Only the two target qubits are measured into a 2-bit register.
 */
export function bellCircuit(pair: QubitPair): string {
  const [q0, q1] = pair;
  const nQubits = Math.max(q0, q1) + 1;

  const lines = [
    'OPENQASM 3;',
    'include "stdgates.inc";',
    `qubit[${nQubits}] q;`,
    'bit[2] c;',
    '',
    `// Prepare Bell state |Φ+⟩ on qubits ${q0}, ${q1}`,
    `h q[${q0}];`,
    `cx q[${q0}], q[${q1}];`,
    '',
    `// Inverse Bell circuit (Bell-basis measurement)`,
    `cx q[${q0}], q[${q1}];`,
    `h q[${q0}];`,
    '',
    `c[0] = measure q[${q0}];`,
    `c[1] = measure q[${q1}];`,
    '',
  ];

  return lines.join('\n');
}

// ── Fidelity computation ───────────────────────────────────────────

/**
 * Compute Bell pair fidelity as P(00) from measurement counts.
 *
 * After the inverse Bell circuit, a perfect |Φ+⟩ state maps to |00⟩.
 * Fidelity = (number of "00" outcomes) / (total shots).
 */
export function bellFidelity(counts: Record<string, number>): number {
  if (counts == null || typeof counts !== 'object') {
    throw new Error(
      `bellFidelity: expected counts object, got ${JSON.stringify(counts)}`,
    );
  }
  let total = 0;
  let count00 = 0;

  for (const [bitstring, count] of Object.entries(counts)) {
    total += count;
    const bits = bitstring.padStart(2, '0');
    const b0 = bits[bits.length - 2];
    const b1 = bits[bits.length - 1];
    if (b0 === '0' && b1 === '0') {
      count00 += count;
    }
  }

  if (total === 0) return 0;
  return count00 / total;
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
