/**
 * Unit tests for the Bell fidelity math and circuits — no API or device needed,
 * so they run on every benchmark job (unlike the opt-in bell-fidelity.spec.ts).
 *
 * A small state-vector simulator executes the generated OpenQASM and checks
 * that the ZZ / XX / YY circuits give ⟨ZZ⟩ = +1, ⟨XX⟩ = +1, ⟨YY⟩ = −1 and F = 1
 * for |Φ+⟩, F = 0 for |Φ−⟩, and that the native-gate (physical mode) circuits
 * produce the same outcome distributions as the standard-gate ones.
 */

import { test, expect } from '@playwright/test';
import {
  BELL_BASES,
  bellCircuit,
  bellStateFidelity,
  invalidCounts,
  parityExpectation,
  type BellBasis,
  type QubitPair,
} from '../helpers/bell-fidelity';

// ── Minimal state-vector simulator for the gates the circuits use ──

type C = [number, number]; // [re, im]
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const expi = (t: number): C => [Math.cos(t), Math.sin(t)];
type M2 = [C, C, C, C]; // row-major 2x2

const R = Math.SQRT1_2;
const GATES: Record<string, (theta?: number) => M2> = {
  h: () => [[R, 0], [R, 0], [R, 0], [-R, 0]],
  x: () => [[0, 0], [1, 0], [1, 0], [0, 0]],
  z: () => [[1, 0], [0, 0], [0, 0], [-1, 0]],
  s: () => [[1, 0], [0, 0], [0, 0], [0, 1]],
  sdg: () => [[1, 0], [0, 0], [0, 0], [0, -1]],
  sx: () => [[0.5, 0.5], [0.5, -0.5], [0.5, -0.5], [0.5, 0.5]],
  rz: (t = 0) => [expi(-t / 2), [0, 0], [0, 0], expi(t / 2)],
};

function angle(expr: string): number {
  const m = expr.trim().match(/^(-)?pi(?:\/(\d+))?$/);
  if (!m) throw new Error(`unsupported angle ${expr}`);
  return (m[1] ? -1 : 1) * Math.PI / (m[2] ? Number(m[2]) : 1);
}

const qubitIndex = (ref: string) => Number(ref.trim().replace(/^\$|^q\[|\]$/g, ''));

/** Execute the circuit and return the outcome probabilities keyed `c[1]c[0]`. */
function simulate(qasm: string): Record<string, number> {
  const ops = qasm
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l && !/^(OPENQASM|include|qubit|bit)\b/.test(l));
  const indices = [...qasm.matchAll(/\$(\d+)|q\[(\d+)\]/g)].map((m) => Number(m[1] ?? m[2]));
  const n = Math.max(...indices) + 1;
  let state: C[] = Array.from({ length: 1 << n }, (_, i) => (i === 0 ? [1, 0] : [0, 0]) as C);
  const measured: number[] = [];

  for (const op of ops) {
    let m: RegExpMatchArray | null;
    if ((m = op.match(/^c\[(\d)\]\s*=\s*measure\s+(\S+);$/))) {
      measured[Number(m[1])] = qubitIndex(m[2]);
    } else if ((m = op.match(/^cx\s+([^,]+),\s*([^;]+);$/))) {
      const [c, t] = [qubitIndex(m[1]), qubitIndex(m[2])];
      state = state.map((_, i) => state[(i >> c) & 1 ? i ^ (1 << t) : i]);
    } else if ((m = op.match(/^(\w+)(?:\(([^)]*)\))?\s+([^;]+);$/))) {
      const gate = GATES[m[1]];
      if (!gate) throw new Error(`unsupported gate ${m[1]}`);
      const [a, b, c, d] = gate(m[2] === undefined ? undefined : angle(m[2]));
      const q = qubitIndex(m[3]);
      const next = state.slice();
      for (let i = 0; i < state.length; i++) {
        if ((i >> q) & 1) continue;
        const j = i | (1 << q);
        next[i] = add(mul(a, state[i]), mul(b, state[j]));
        next[j] = add(mul(c, state[i]), mul(d, state[j]));
      }
      state = next;
    } else {
      throw new Error(`unsupported line: ${op}`);
    }
  }

  const probs: Record<string, number> = { '00': 0, '01': 0, '10': 0, '11': 0 };
  state.forEach(([re, im], i) => {
    const key = `${(i >> measured[1]) & 1}${(i >> measured[0]) & 1}`;
    probs[key] += re * re + im * im;
  });
  return probs;
}

/** Exact counts for `shots` from probabilities (rounded; sums may differ by 1). */
const countsOf = (p: Record<string, number>, shots = 1_000_000) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v * shots)]));

/** |Φ−⟩ circuit: |Φ+⟩ followed by Z on the control (inserted after the CX). */
function phiMinus(qasm: string, physical: boolean, control: string): string {
  const z = physical ? `rz(pi) ${control};` : `z ${control};`;
  return qasm.replace(/^(cx [^\n]*)$/m, `$1\n${z}`);
}

function expectations(circuitFor: (basis: BellBasis) => string) {
  const e = Object.fromEntries(
    BELL_BASES.map((b) => [b, parityExpectation(countsOf(simulate(circuitFor(b))))]),
  ) as Record<BellBasis, number>;
  return { zz: e.ZZ, xx: e.XX, yy: e.YY };
}

const PAIRS: QubitPair[] = [[0, 1], [2, 1]];

test.describe('Bell fidelity math (unit)', () => {
  for (const physical of [false, true]) {
    for (const pair of PAIRS) {
      const mode = physical ? 'physical' : 'logical';

      test(`ideal |Φ+⟩ gives <ZZ>=+1, <XX>=+1, <YY>=-1, F=1 (${mode}, ${pair.join('-')})`, () => {
        const e = expectations((b) => bellCircuit(pair, physical, b));
        expect(e.zz).toBeCloseTo(1, 5);
        expect(e.xx).toBeCloseTo(1, 5);
        expect(e.yy).toBeCloseTo(-1, 5);
        expect(bellStateFidelity(e)).toBeCloseTo(1, 5);
      });

      test(`|Φ−⟩ gives F=0 (${mode}, ${pair.join('-')})`, () => {
        const control = physical ? `$${pair[0]}` : `q[${pair[0]}]`;
        const e = expectations((b) => phiMinus(bellCircuit(pair, physical, b), physical, control));
        expect(e.zz).toBeCloseTo(1, 5);
        expect(e.xx).toBeCloseTo(-1, 5);
        expect(e.yy).toBeCloseTo(1, 5);
        expect(bellStateFidelity(e)).toBeCloseTo(0, 5);
      });
    }
  }

  for (const basis of BELL_BASES) {
    test(`native-gate ${basis} circuit matches the standard-gate one`, () => {
      const pair: QubitPair = [2, 1];
      const physical = bellCircuit(pair, true, basis);
      const logical = bellCircuit(pair, false, basis);
      // Physical mode skips the transpiler: only rz / sx / cx may appear.
      const gates = [...physical.matchAll(/^(\w+)(?:\([^)]*\))?\s+\$/gm)].map((m) => m[1]);
      expect(gates.length).toBeGreaterThan(0);
      expect(gates.filter((g) => !['rz', 'sx', 'cx'].includes(g))).toEqual([]);
      const p = simulate(physical);
      const l = simulate(logical);
      for (const k of Object.keys(l)) expect(p[k]).toBeCloseTo(l[k], 9);
    });
  }

  test('parity expectation and fidelity from counts', () => {
    expect(parityExpectation({ '00': 480, '01': 20, '10': 20, '11': 480 })).toBeCloseTo(0.92, 9);
    expect(parityExpectation({ '00': 250, '01': 250, '10': 250, '11': 250 })).toBeCloseTo(0, 9);
    expect(parityExpectation({ '01': 600, '10': 400 })).toBeCloseTo(-1, 9);
    // A leading zero may be dropped from a label: "1" is "01" (odd).
    expect(parityExpectation({ '0': 300, '1': 100, '11': 600 })).toBeCloseTo(0.8, 9);
    expect(bellStateFidelity({ zz: 0.92, xx: 0.9, yy: -0.88 })).toBeCloseTo(0.925, 9);
    // A mixed state (no coherence) stays at the separable bound F = 0.5.
    expect(bellStateFidelity({ zz: 1, xx: 0, yy: 0 })).toBeCloseTo(0.5, 9);
    expect(bellStateFidelity({ zz: 0, xx: 0, yy: 0 })).toBeCloseTo(0.25, 9);
  });

  test('malformed counts are rejected', () => {
    for (const bad of [{ foo: 1000 }, { '00': 1000, '01': -500 }, { '00': 0.5 }, { '000': 1 }, {}, null]) {
      expect(invalidCounts(bad)).not.toBeNull();
      expect(() => parityExpectation(bad as Record<string, number>)).toThrow();
    }
    expect(invalidCounts({ '00': 1, '11': 1 })).toBeNull();
  });
});
