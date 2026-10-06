/**
 * Layer-1 threshold benchmarks — static device_info verification.
 *
 * Each test fetches `/devices/{DEVICE_ID}`, extracts a single scalar from
 * `device_info`, and compares it against the threshold defined in
 * `thresholds.toml [threshold]`.  No quantum circuit execution is involved.
 *
 * A URL-valued `device_info` is resolved the same way as the scenario setup
 * (JSON or a ZIP containing `device_info.json`); a retrieval or decoding error
 * fails the test. An unmeasurable value (missing calibration data) is treated
 * as a pass, consistent with the existing error-rate benchmark.
 */

import { test, expect, request } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import {
  resolveDeviceInfo,
  max1qGateError,
  max2qGateError,
  maxReadoutError,
  calibrationAgeHours,
  type DeviceInfo,
} from '../helpers/device-info';
import { recordThresholdResult } from '../helpers/threshold-results';

const API_BASE = process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL;
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID ?? 'qulacs';

/** Fetch device_info once per worker. */
async function fetchDeviceInfo(): Promise<DeviceInfo | null> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(`${API_BASE}/devices/${DEVICE_ID}`, {
      headers: { 'q-api-token': API_TOKEN ?? '' },
    });
    expect(res.status(), `GET /devices/${DEVICE_ID} should return 200`).toBe(
      200,
    );
    const body = await res.json();
    return await resolveDeviceInfo(body?.device_info);
  } finally {
    await ctx.dispose();
  }
}

/**
 * Record the result, report it, and assert it is within the threshold.
 * A `null` measurement is recorded and reported but not asserted.
 */
async function checkThreshold(opts: {
  key: string;
  label: string;
  measured: number | null;
  threshold: number;
  unit?: string;
  format: (v: number | null) => string;
}): Promise<void> {
  const { key, label, measured, threshold, unit = '', format } = opts;
  const passed = measured === null ? null : measured <= threshold;

  recordThresholdResult(key, {
    device: DEVICE_ID,
    measured,
    threshold,
    ...(unit ? { unit } : {}),
    passed,
    retry: test.info().retry,
  });

  const line = `device=${DEVICE_ID} ${label}=${format(measured)} threshold=${threshold}${unit}`;
  console.log(`[threshold] ${line}`);
  await test.info().attach(key, { body: line, contentType: 'text/plain' });

  if (measured === null) return;
  expect(
    measured,
    `${label} ${format(measured)} exceeds threshold ${threshold}${unit}`,
  ).toBeLessThanOrEqual(threshold);
}

function fmtError(v: number | null): string {
  return v === null ? 'n/a (no data)' : v.toFixed(6);
}

function fmtAge(v: number | null): string {
  return v === null ? 'n/a (no timestamp)' : `${v.toFixed(1)}h`;
}

test.describe('Device threshold verification (Layer 1)', () => {
  test.skip(
    !API_BASE,
    'USER_API_ENDPOINT (or E2E_API_BASE_URL) is not set',
  );

  let info: DeviceInfo | null;

  test.beforeAll(async () => {
    info = await fetchDeviceInfo();
  });

  test('max 1Q gate error is within threshold', async () => {
    await checkThreshold({
      key: 'max-1q-gate-error',
      label: 'max_1q_gate_error',
      measured: max1qGateError(info),
      threshold: loadThresholds().threshold.max1qGateError,
      format: fmtError,
    });
  });

  test('max 2Q gate error is within threshold', async () => {
    await checkThreshold({
      key: 'max-2q-gate-error',
      label: 'max_2q_gate_error',
      measured: max2qGateError(info),
      threshold: loadThresholds().threshold.max2qGateError,
      format: fmtError,
    });
  });

  test('max readout error is within threshold', async () => {
    await checkThreshold({
      key: 'max-readout-error',
      label: 'max_readout_error',
      measured: maxReadoutError(info),
      threshold: loadThresholds().threshold.maxReadoutError,
      format: fmtError,
    });
  });

  test('calibration is within allowed age', async () => {
    await checkThreshold({
      key: 'calibration-age',
      label: 'calibration_age',
      measured: calibrationAgeHours(info),
      threshold: loadThresholds().threshold.maxCalibrationAgeHours,
      unit: 'h',
      format: fmtAge,
    });
  });
});
