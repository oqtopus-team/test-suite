/**
 * Device error-rate computation.
 *
 * This mirrors the scenario-tests runn gate (`device-error-rate-check.yml`):
 * it reads `device_info.calibration_data.two_qubit_gates` and computes the
 * arithmetic mean of every `gate_error_value`. The underlying values are
 * average gate errors obtained by interleaved randomized benchmarking of the
 * two-qubit gate on the real device.
 */

/** A single two-qubit gate entry in the calibration data. */
export interface TwoQubitGate {
  gate_error_value?: number | null;
}

export interface CalibrationData {
  two_qubit_gates?: Record<string, TwoQubitGate> | null;
}

export interface DeviceInfo {
  calibration_data?: CalibrationData | null;
}

/**
 * The API may serialize `device_info` either as a JSON string or as an already
 * parsed object. Normalize both to a `DeviceInfo`, returning `null` when the
 * field is missing/empty (treated as "not measurable" by the caller).
 */
export function parseDeviceInfo(raw: unknown): DeviceInfo | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    try {
      return JSON.parse(trimmed) as DeviceInfo;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as DeviceInfo;
  return null;
}

/**
 * Arithmetic mean of the two-qubit `gate_error_value`s.
 *
 * Returns `null` when the error rate cannot be computed (missing calibration
 * data or zero gates). Following the runn gate, an unmeasurable device is
 * treated as a pass by the caller rather than a failure.
 */
export function averageTwoQubitGateError(info: DeviceInfo | null): number | null {
  const gates = info?.calibration_data?.two_qubit_gates;
  if (gates == null) return null;

  const values = Object.values(gates)
    .map((gate) => gate?.gate_error_value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  if (values.length === 0) return null;

  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}
