import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

/**
 * Benchmark thresholds loaded from `thresholds.toml` at the benchmark-tests
 * root. Thresholds live in a tracked TOML file (not `.env`) so they are
 * reviewed and versioned. Add new fields here — and to the TOML — as more
 * benchmarks are introduced.
 */
export interface Thresholds {
  errorRate: {
    /** Averaged 2Q gate error rate above which the benchmark fails. */
    max2qGateError: number;
  };
  threshold: {
    /** Max single-qubit gate error: max(1 − qubits[].fidelity). */
    max1qGateError: number;
    /** Max two-qubit gate error: max(1 − couplings[].fidelity). */
    max2qGateError: number;
    /** Max readout assignment error across all qubits. */
    maxReadoutError: number;
    /** Max allowed calibration age in hours. */
    maxCalibrationAgeHours: number;
  };
  bellFidelity: {
    /** Minimum Bell pair fidelity F(|Φ+⟩) below which the benchmark fails. */
    minFidelity: number;
  };
}

/** Built-in fallbacks used when the file or a key is missing. */
const DEFAULTS: Thresholds = {
  errorRate: { max2qGateError: 0.4 },
  threshold: {
    max1qGateError: 0.1,
    max2qGateError: 0.5,
    maxReadoutError: 0.3,
    maxCalibrationAgeHours: 24,
  },
  bellFidelity: { minFidelity: 0.5 },
};

const CONFIG_PATH = join(__dirname, '..', 'thresholds.toml');

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Read and parse `thresholds.toml`. A missing file or missing keys fall back to
 * the built-in defaults so a partial config still runs.
 */
export function loadThresholds(path: string = CONFIG_PATH): Thresholds {
  let raw: Record<string, unknown> = {};
  try {
    raw = parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return DEFAULTS;
  }
  const errorRate = (raw.error_rate ?? {}) as Record<string, unknown>;
  const threshold = (raw.threshold ?? {}) as Record<string, unknown>;
  return {
    errorRate: {
      max2qGateError: num(
        errorRate.max_2q_gate_error,
        DEFAULTS.errorRate.max2qGateError,
      ),
    },
    threshold: {
      max1qGateError: num(
        threshold.max_1q_gate_error,
        DEFAULTS.threshold.max1qGateError,
      ),
      max2qGateError: num(
        threshold.max_2q_gate_error,
        DEFAULTS.threshold.max2qGateError,
      ),
      maxReadoutError: num(
        threshold.max_readout_error,
        DEFAULTS.threshold.maxReadoutError,
      ),
      maxCalibrationAgeHours: num(
        threshold.max_calibration_age_hours,
        DEFAULTS.threshold.maxCalibrationAgeHours,
      ),
    },
    bellFidelity: {
      minFidelity: num(
        ((raw.bell_fidelity ?? {}) as Record<string, unknown>).min_fidelity,
        DEFAULTS.bellFidelity.minFidelity,
      ),
    },
  };
}
