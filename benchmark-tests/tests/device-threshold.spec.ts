/**
 * Layer-1 threshold benchmarks — static device_info verification.
 *
 * Each test fetches `/devices/{DEVICE_ID}`, extracts a single scalar from
 * `device_info`, and compares it against the threshold defined in
 * `thresholds.toml [threshold]`.  No quantum circuit execution is involved.
 *
 * An unmeasurable value (missing calibration data) is treated as a pass,
 * consistent with the existing error-rate benchmark.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, request } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import {
  parseDeviceInfo,
  max1qGateError,
  max2qGateError,
  maxReadoutError,
  calibrationAgeHours,
  type DeviceInfo,
} from '../helpers/device-info';

const API_BASE = process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL;
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID ?? 'qulacs';

const RESULT_PATH = join(__dirname, '..', 'results', 'threshold.json');

/** Fetch device_info once for the entire suite. */
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
    return parseDeviceInfo(body?.device_info);
  } finally {
    await ctx.dispose();
  }
}

/** Persist all threshold results for downstream reporting. */
function writeResult(result: Record<string, unknown>): void {
  mkdirSync(join(__dirname, '..', 'results'), { recursive: true });
  writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
}

function fmt(v: number | null): string {
  return v === null ? 'n/a (no data)' : v.toFixed(6);
}

test.describe('Device threshold verification (Layer 1)', () => {
  test.skip(
    !API_BASE,
    'USER_API_ENDPOINT (or E2E_API_BASE_URL) is not set',
  );

  let info: DeviceInfo | null;
  const results: Record<string, unknown> = { device: DEVICE_ID };

  test.beforeAll(async () => {
    info = await fetchDeviceInfo();
  });

  test.afterAll(() => {
    writeResult(results);
  });

  // ── 1Q gate error (max) ─────────────────────────────────────────

  test('max 1Q gate error is within threshold', async () => {
    const threshold = loadThresholds().threshold.max1qGateError;
    const measured = max1qGateError(info);

    results.max1qGateError = { measured, threshold };

    const line = `device=${DEVICE_ID} max_1q_gate_error=${fmt(measured)} threshold=${threshold}`;
    console.log(`[threshold] ${line}`);
    await test.info().attach('max-1q-gate-error', {
      body: line,
      contentType: 'text/plain',
    });

    if (measured === null) return;
    expect(
      measured,
      `max 1Q gate error ${fmt(measured)} exceeds threshold ${threshold}`,
    ).toBeLessThanOrEqual(threshold);
  });

  // ── 2Q gate error (max) ─────────────────────────────────────────

  test('max 2Q gate error is within threshold', async () => {
    const threshold = loadThresholds().threshold.max2qGateError;
    const measured = max2qGateError(info);

    results.max2qGateError = { measured, threshold };

    const line = `device=${DEVICE_ID} max_2q_gate_error=${fmt(measured)} threshold=${threshold}`;
    console.log(`[threshold] ${line}`);
    await test.info().attach('max-2q-gate-error', {
      body: line,
      contentType: 'text/plain',
    });

    if (measured === null) return;
    expect(
      measured,
      `max 2Q gate error ${fmt(measured)} exceeds threshold ${threshold}`,
    ).toBeLessThanOrEqual(threshold);
  });

  // ── Readout error (max) ─────────────────────────────────────────

  test('max readout error is within threshold', async () => {
    const threshold = loadThresholds().threshold.maxReadoutError;
    const measured = maxReadoutError(info);

    results.maxReadoutError = { measured, threshold };

    const line = `device=${DEVICE_ID} max_readout_error=${fmt(measured)} threshold=${threshold}`;
    console.log(`[threshold] ${line}`);
    await test.info().attach('max-readout-error', {
      body: line,
      contentType: 'text/plain',
    });

    if (measured === null) return;
    expect(
      measured,
      `max readout error ${fmt(measured)} exceeds threshold ${threshold}`,
    ).toBeLessThanOrEqual(threshold);
  });

  // ── Calibration freshness ───────────────────────────────────────

  test('calibration is within allowed age', async () => {
    const threshold = loadThresholds().threshold.maxCalibrationAgeHours;
    const measured = calibrationAgeHours(info);

    results.calibrationAge = { measuredHours: measured, thresholdHours: threshold };

    const fmtAge =
      measured === null ? 'n/a (no timestamp)' : `${measured.toFixed(1)}h`;
    const line = `device=${DEVICE_ID} calibration_age=${fmtAge} threshold=${threshold}h`;
    console.log(`[threshold] ${line}`);
    await test.info().attach('calibration-age', {
      body: line,
      contentType: 'text/plain',
    });

    if (measured === null) return;
    expect(
      measured,
      `calibration age ${fmtAge} exceeds threshold ${threshold}h`,
    ).toBeLessThanOrEqual(threshold);
  });
});
