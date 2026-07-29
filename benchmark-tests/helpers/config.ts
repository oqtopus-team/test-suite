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
}

/** Built-in fallbacks used when the file or a key is missing. */
const DEFAULTS: Thresholds = {
  errorRate: { max2qGateError: 0.4 },
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
  return {
    errorRate: {
      max2qGateError: num(
        errorRate.max_2q_gate_error,
        DEFAULTS.errorRate.max2qGateError,
      ),
    },
  };
}
