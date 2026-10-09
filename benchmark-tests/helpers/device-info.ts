/**
 * Device-info field extraction for Layer-1 threshold benchmarks.
 *
 * Each function reads a specific section of the `device_info` payload returned
 * by the User-API and reduces it to the single scalar the benchmark needs.
 * A `null` return means "the data is absent / the device cannot be measured"
 * and the caller treats it as a pass (consistent with the existing error-rate
 * benchmark).
 */

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeviceInfo, type DeviceInfo } from './error-rate';

export { parseDeviceInfo, type DeviceInfo };

// ── device_info resolution ─────────────────────────────────────────

const URL_PATTERN = /^(https?|file):\/\//;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Download (or read) the payload a URL-valued `device_info` points to. */
async function fetchPayload(url: string): Promise<Buffer> {
  if (url.startsWith('file://')) return readFileSync(fileURLToPath(url));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to fetch device_info from ${url}: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract `device_info.json` from a ZIP archive, mirroring the runn setup.
 * `unzip -p` writes straight to a temp file rather than a stdout pipe, so the
 * payload size is not capped by `execFileSync`'s 1 MiB `maxBuffer`.
 */
function unzipDeviceInfo(zip: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'device-info-'));
  try {
    const zipPath = join(dir, 'device_info.zip');
    const jsonPath = join(dir, 'device_info.json');
    writeFileSync(zipPath, zip);
    const fd = openSync(jsonPath, 'w');
    try {
      execFileSync('unzip', ['-p', zipPath, 'device_info.json'], {
        stdio: ['ignore', fd, 'pipe'],
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          'device_info is a ZIP archive but the `unzip` command was not found on PATH',
        );
      }
      throw e;
    } finally {
      closeSync(fd);
    }
    return readFileSync(jsonPath, 'utf-8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Decode a string `device_info`: inline JSON, or a URL to JSON / a ZIP. */
async function decodeDeviceInfo(raw: string): Promise<unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!URL_PATTERN.test(trimmed)) return JSON.parse(trimmed);

  const payload = await fetchPayload(trimmed);
  const json = payload.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)
    ? unzipDeviceInfo(payload)
    : payload.toString('utf-8');
  return JSON.parse(json);
}

/**
 * Resolve the raw `device_info` field into a `DeviceInfo`.
 *
 * Unlike `parseDeviceInfo`, this follows the same rules as the scenario setup
 * (`scenario-tests/setup/runn/setup.yml`): an HTTP(S)/file URL is
 * fetched, and a ZIP payload is unpacked to its `device_info.json`. Only an
 * absent/empty/`null` value yields `null` (no calibration data); retrieval or
 * decoding failures, and a resolved value that is not a JSON object (an array
 * or a primitive such as `false`), throw so they surface as test failures
 * instead of silent passes.
 */
export async function resolveDeviceInfo(raw: unknown): Promise<DeviceInfo | null> {
  const value = typeof raw === 'string' ? await decodeDeviceInfo(raw) : raw;
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    const type = Array.isArray(value) ? 'array' : typeof value;
    throw new Error(`device_info must be a JSON object, got ${type}`);
  }
  return value as DeviceInfo;
}

// ── Qubit-level types ──────────────────────────────────────────────

interface MeasError {
  readout_assignment_error?: number | null;
}

interface QubitLifetime {
  t1?: number | null;
  t2_star?: number | null;
  t2_echo?: number | null;
}

interface Qubit {
  fidelity?: number | null;
  meas_error?: MeasError | null;
  qubit_lifetime?: QubitLifetime | null;
}

// ── Coupling-level types ───────────────────────────────────────────

interface Coupling {
  fidelity?: number | null;
}

// ── Extended DeviceInfo (adds fields the baseline helper does not need) ──

interface DeviceInfoExt {
  qubits?: Record<string, Qubit> | null;
  couplings?: Record<string, Coupling> | null;
  calibrated_at?: string | null;
  calibration_data?: unknown;
}

// ── Probability validation ────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Short JSON rendering of an offending value for error messages. */
function preview(v: unknown): string {
  const json = JSON.stringify(v) ?? String(v);
  return json.length > 80 ? `${json.slice(0, 77)}...` : json;
}

/**
 * Collect the probability at `field` (a property path) from every entry of a
 * `qubits` / `couplings` collection, skipping only entries whose value is
 * absent (`null`/`undefined` at the leaf or at an intermediate object such as
 * `meas_error`).
 *
 * Anything else that is malformed is invalid metadata and throws, so it cannot
 * be mistaken for missing data, hide among valid samples, or slip past the
 * upper-bound check:
 * - the collection, a non-null entry, or a non-null intermediate value is not
 *   a JSON object (e.g. `qubits: "x"`, `qubits: {"0": "bad"}`)
 * - the leaf value is not a finite number (e.g. `"bad"`)
 * - the leaf value is outside [0, 1] (e.g. fidelity 1.1 → error −0.1)
 */
function probabilities(
  collection: unknown,
  name: string,
  field: readonly string[],
): number[] {
  if (!isObject(collection)) {
    throw new Error(`${name} must be a JSON object, got ${preview(collection)}`);
  }
  const values: number[] = [];
  for (const [key, entry] of Object.entries(collection)) {
    let path = `${name}[${JSON.stringify(key)}]`;
    let v: unknown = entry;
    for (const prop of field) {
      if (v == null) break;
      if (!isObject(v)) {
        throw new Error(`${path} must be a JSON object, got ${preview(v)}`);
      }
      v = v[prop];
      path += `.${prop}`;
    }
    if (v == null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`${path} is not a finite number: ${preview(v)}`);
    }
    if (v < 0 || v > 1) {
      throw new Error(`${path} out of range [0, 1]: ${v}`);
    }
    values.push(v);
  }
  return values;
}

/** `max(values)`, or `null` when there are no samples. */
function maxOrNull(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

// ── 1Q gate error (max) ───────────────────────────────────────────

/**
 * Maximum single-qubit gate error across all qubits:  `max(1 − fidelity)`.
 * Returns `null` when no qubit fidelity data is available, and throws on
 * malformed `qubits` data (see `probabilities`).
 */
export function max1qGateError(info: DeviceInfo | null): number | null {
  const qubits = (info as DeviceInfoExt | null)?.qubits;
  if (qubits == null) return null;
  return maxOrNull(probabilities(qubits, 'qubits', ['fidelity']).map((f) => 1 - f));
}

// ── 2Q gate error (max) ───────────────────────────────────────────

/**
 * Maximum two-qubit gate error across all couplings: `max(1 − fidelity)`.
 * Returns `null` when no coupling fidelity data is available, and throws on
 * malformed `couplings` data (see `probabilities`).
 */
export function max2qGateError(info: DeviceInfo | null): number | null {
  const couplings = (info as DeviceInfoExt | null)?.couplings;
  if (couplings == null) return null;
  return maxOrNull(
    probabilities(couplings, 'couplings', ['fidelity']).map((f) => 1 - f),
  );
}

// ── Readout error (max) ───────────────────────────────────────────

/**
 * Maximum readout assignment error across all qubits.
 * Returns `null` when no readout error data is available, and throws on
 * malformed `qubits` / `meas_error` data (see `probabilities`).
 */
export function maxReadoutError(info: DeviceInfo | null): number | null {
  const qubits = (info as DeviceInfoExt | null)?.qubits;
  if (qubits == null) return null;
  return maxOrNull(
    probabilities(qubits, 'qubits', ['meas_error', 'readout_assignment_error']),
  );
}

// ── Calibration freshness ─────────────────────────────────────────

/**
 * Age of the most recent calibration in hours (now − calibrated_at).
 * Returns `null` when the field is missing or empty, and throws when it is
 * present but unparseable so malformed metadata fails instead of passing. A
 * future `calibrated_at` yields a negative age, which the caller must reject.
 */
export function calibrationAgeHours(
  info: DeviceInfo | null,
  now: Date = new Date(),
): number | null {
  const raw = (info as DeviceInfoExt | null)?.calibrated_at;
  if (raw == null || raw.trim() === '') return null;

  const ts = new Date(raw);
  if (Number.isNaN(ts.getTime())) {
    throw new Error(`unparseable calibrated_at: ${JSON.stringify(raw)}`);
  }

  return (now.getTime() - ts.getTime()) / (1000 * 60 * 60);
}
