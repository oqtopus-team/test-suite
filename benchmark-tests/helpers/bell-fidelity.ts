/**
 * Bell pair fidelity measurement — circuit generation and analysis.
 *
 * Prepares the Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2 on two qubits and measures
 * it in three bases: ZZ, XX and YY. Each basis gives a parity expectation
 * ⟨PP⟩ = P(even) − P(odd), and the state fidelity with |Φ+⟩ is
 *
 *   F = (1 + ⟨XX⟩ − ⟨YY⟩ + ⟨ZZ⟩) / 4
 *
 * since |Φ+⟩⟨Φ+| = (II + XX − YY + ZZ) / 4. An ideal |Φ+⟩ gives ⟨XX⟩ = +1,
 * ⟨YY⟩ = −1, ⟨ZZ⟩ = +1 and F = 1; |Φ−⟩ gives F = 0. F > 0.5 certifies that
 * the pair is entangled.
 */

// ── Circuit generation ─────────────────────────────────────────────

/** Measurement basis applied to both qubits of the pair. */
export type BellBasis = 'ZZ' | 'XX' | 'YY';

/** The three bases measured per pair, in the order the jobs are submitted. */
export const BELL_BASES: readonly BellBasis[] = ['ZZ', 'XX', 'YY'];

/**
 * H in native gates: `rz(pi/2); sx; rz(pi/2)` equals H up to a global phase.
 * It is the decomposition the device transpiler produces for `rz`/`sx`/`cx`
 * hardware such as A-II.
 */
const nativeH = (q: string): string[] => [`rz(pi/2) ${q};`, `sx ${q};`, `rz(pi/2) ${q};`];

/**
 * Gates that rotate one qubit so that the Z-basis measurement after them
 * measures X (H) or Y (S† then H). In physical mode they are written in native
 * gates; S† is `rz(-pi/2)` up to a global phase.
 */
function basisChange(basis: BellBasis, q: string, physical: boolean): string[] {
  if (basis === 'ZZ') return [];
  if (basis === 'XX') return physical ? nativeH(q) : [`h ${q};`];
  return physical ? [`rz(-pi/2) ${q};`, ...nativeH(q)] : [`sdg ${q};`, `h ${q};`];
}

/**
 * Generate an OpenQASM 3 circuit that prepares |Φ+⟩ on the given qubit pair
 * (H on the control, then CX control → target) and measures both qubits in
 * `basis`: control into c[0], target into c[1].
 *
 * In physical mode the circuit uses OpenQASM 3 hardware-qubit syntax (`$n`)
 * and skips the transpiler, so it is written in native gates only (`rz`,
 * `sx`, `cx`). Otherwise a virtual register sized to `max(q0, q1) + 1` is
 * declared and the transpiler handles the standard gates (`h`, `sdg`).
 */
export function bellCircuit(
  pair: QubitPair,
  physical = false,
  basis: BellBasis = 'ZZ',
): string {
  const [q0, q1] = pair;

  const decls = physical
    ? ['bit[2] c;']
    : [`qubit[${Math.max(q0, q1) + 1}] q;`, 'bit[2] c;'];
  const ref = (q: number) => (physical ? `$${q}` : `q[${q}]`);
  const change = [
    ...basisChange(basis, ref(q0), physical),
    ...basisChange(basis, ref(q1), physical),
  ];

  const lines = [
    'OPENQASM 3;',
    'include "stdgates.inc";',
    ...decls,
    '',
    ...(physical ? nativeH(ref(q0)) : [`h ${ref(q0)};`]),
    `cx ${ref(q0)}, ${ref(q1)};`,
    '',
    // No comments: physical-mode circuits go to the device untranspiled.
    ...(change.length > 0 ? [...change, ''] : []),
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
 * of producing an out-of-range expectation (e.g. from `{foo: 1000}` or
 * negative counts).
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

/** Sum of the counts of a sampling result (validate with `invalidCounts` first). */
export function countsTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, v) => sum + v, 0);
}

/**
 * Why the counts do not add up to the requested shots, or `null` when they
 * do. An incomplete (or inflated) result fails the pair rather than producing
 * a fidelity from fewer — or more — shots than the job asked for.
 */
export function shotsMismatch(counts: Record<string, number>, requested: number): string | null {
  const total = countsTotal(counts);
  return total === requested ? null : `counts total ${total} != requested shots ${requested}`;
}

/**
 * Parity expectation ⟨PP⟩ = P(even) − P(odd) of a two-qubit measurement:
 * outcomes 00 / 11 count +1 and 01 / 10 count −1, so the bit order does not
 * matter. Throws when the counts are malformed (see `invalidCounts`).
 */
export function parityExpectation(counts: Record<string, number>): number {
  const invalid = invalidCounts(counts);
  if (invalid) throw new Error(`parityExpectation: invalid sampling counts: ${invalid}`);

  let total = 0;
  let even = 0;
  for (const [bitstring, count] of Object.entries(counts)) {
    total += count;
    const bits = bitstring.padStart(2, '0');
    if (bits[0] === bits[1]) even += count;
  }
  return (2 * even - total) / total;
}

/** Parity expectations of the three measured bases. */
export interface BellExpectations {
  zz: number;
  xx: number;
  yy: number;
}

/** Fidelity with |Φ+⟩: F = (1 + ⟨XX⟩ − ⟨YY⟩ + ⟨ZZ⟩) / 4. */
export function bellStateFidelity({ zz, xx, yy }: BellExpectations): number {
  return (1 + xx - yy + zz) / 4;
}

// ── Mapping consistency across bases (logical mode) ─────────────────

/** Logical → physical placement of one qubit of the pair. */
export interface PairMapping {
  logical: number;
  physical: number;
}

/**
 * Outcome of combining the transpiled placement of the three basis jobs.
 * - `mapping`: all bases report the same physical pair.
 * - `mismatch`: at least two bases report different physical pairs, so the
 *   three expectations were measured on different hardware and F describes
 *   no single pair — the caller fails the pair with this reason.
 * - neither: some bases have no usable mapping and the known ones agree; the
 *   physical pair is unknown but not contradictory.
 * `perBasis` gives each basis's physical pair (`control-target`) or `null`.
 */
export interface CombinedMapping {
  mapping?: PairMapping[];
  mismatch?: string;
  perBasis: Record<BellBasis, string | null>;
}

export function combineBasisMappings(
  mappings: Partial<Record<BellBasis, PairMapping[] | undefined>>,
): CombinedMapping {
  const perBasis = Object.fromEntries(
    BELL_BASES.map((b) => [b, mappings[b] ? mappings[b]!.map((m) => m.physical).join('-') : null]),
  ) as Record<BellBasis, string | null>;
  const known = BELL_BASES.map((b) => perBasis[b]).filter((k): k is string => k !== null);
  if (new Set(known).size > 1) {
    return {
      perBasis,
      mismatch:
        'qubit mapping differs between bases ' +
        `(${BELL_BASES.map((b) => `${b}: ${perBasis[b] ?? 'unknown'}`).join(', ')}) — ` +
        'the bases did not measure the same physical pair, so F is not computed',
    };
  }
  if (known.length === BELL_BASES.length) return { perBasis, mapping: mappings.ZZ };
  return { perBasis };
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
