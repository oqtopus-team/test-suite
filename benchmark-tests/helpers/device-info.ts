/**
 * Device-info field extraction for Layer-1 threshold benchmarks.
 *
 * Each function reads a specific section of the `device_info` payload returned
 * by the User-API and reduces it to the single scalar the benchmark needs.
 * A `null` return means "the data is absent / the device cannot be measured"
 * and the caller treats it as a pass (consistent with the existing error-rate
 * benchmark).
 */

import { parseDeviceInfo, type DeviceInfo } from './error-rate';

export { parseDeviceInfo, type DeviceInfo };

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
