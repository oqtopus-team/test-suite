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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** Extract `device_info.json` from a ZIP archive, mirroring the runn setup. */
function unzipDeviceInfo(zip: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'device-info-'));
  try {
    const path = join(dir, 'device_info.zip');
    writeFileSync(path, zip);
    return execFileSync('unzip', ['-p', path, 'device_info.json'], {
      encoding: 'utf-8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Resolve the raw `device_info` field into a `DeviceInfo`.
 *
 * Unlike `parseDeviceInfo`, this follows the same rules as the scenario setup
 * (`scenario-tests/setup/runn_setup/setup.yml`): an HTTP(S)/file URL is
 * fetched, and a ZIP payload is unpacked to its `device_info.json`. Only an
 * absent/empty field yields `null` (no calibration data); retrieval or decoding
 * failures throw so they surface as test failures instead of silent passes.
 */
export async function resolveDeviceInfo(raw: unknown): Promise<DeviceInfo | null> {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as DeviceInfo;
  if (typeof raw !== 'string') {
    throw new Error(`unexpected device_info type: ${typeof raw}`);
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null') return null;
  if (!URL_PATTERN.test(trimmed)) return JSON.parse(trimmed) as DeviceInfo;

  const payload = await fetchPayload(trimmed);
  const json = payload.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)
    ? unzipDeviceInfo(payload)
    : payload.toString('utf-8');
  return JSON.parse(json) as DeviceInfo;
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

// ── 1Q gate error (max) ───────────────────────────────────────────

/**
 * Maximum single-qubit gate error across all qubits:  `max(1 − fidelity)`.
 * Returns `null` when no qubit fidelity data is available.
 */
export function max1qGateError(info: DeviceInfo | null): number | null {
  const qubits = (info as DeviceInfoExt | null)?.qubits;
  if (qubits == null) return null;

  const errors = Object.values(qubits)
    .map((q) => q?.fidelity)
    .filter((f): f is number => typeof f === 'number' && Number.isFinite(f))
    .map((f) => 1 - f);

  return errors.length === 0 ? null : Math.max(...errors);
}

// ── 2Q gate error (max) ───────────────────────────────────────────

/**
 * Maximum two-qubit gate error across all couplings: `max(1 − fidelity)`.
 * Returns `null` when no coupling fidelity data is available.
 */
export function max2qGateError(info: DeviceInfo | null): number | null {
  const couplings = (info as DeviceInfoExt | null)?.couplings;
  if (couplings == null) return null;

  const errors = Object.values(couplings)
    .map((c) => c?.fidelity)
    .filter((f): f is number => typeof f === 'number' && Number.isFinite(f))
    .map((f) => 1 - f);

  return errors.length === 0 ? null : Math.max(...errors);
}

// ── Readout error (max) ───────────────────────────────────────────

/**
 * Maximum readout assignment error across all qubits.
 * Returns `null` when no readout error data is available.
 */
export function maxReadoutError(info: DeviceInfo | null): number | null {
  const qubits = (info as DeviceInfoExt | null)?.qubits;
  if (qubits == null) return null;

  const errors = Object.values(qubits)
    .map((q) => q?.meas_error?.readout_assignment_error)
    .filter(
      (e): e is number => typeof e === 'number' && Number.isFinite(e),
    );

  return errors.length === 0 ? null : Math.max(...errors);
}

// ── Calibration freshness ─────────────────────────────────────────

/**
 * Age of the most recent calibration in hours (now − calibrated_at).
 * Returns `null` when the field is missing or unparseable.
 */
export function calibrationAgeHours(
  info: DeviceInfo | null,
  now: Date = new Date(),
): number | null {
  const raw = (info as DeviceInfoExt | null)?.calibrated_at;
  if (raw == null) return null;

  const ts = new Date(raw);
  if (Number.isNaN(ts.getTime())) return null;

  return (now.getTime() - ts.getTime()) / (1000 * 60 * 60);
}
