import { test, expect, request } from '@playwright/test';
import { loadThresholds } from '../helpers/config';
import {
  averageTwoQubitGateError,
  parseDeviceInfo,
} from '../helpers/error-rate';

const API_BASE = process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL;
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID ?? 'qulacs';

/**
 * Fetch the target device and return its parsed `device_info`.
 * Kept separate so both the measurement and the gate share one request.
 */
async function fetchDeviceErrorRate(): Promise<{
  average: number | null;
  gateCount: number;
}> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.get(`${API_BASE}/devices/${DEVICE_ID}`, {
      headers: { 'q-api-token': API_TOKEN ?? '' },
    });
    expect(res.status(), `GET /devices/${DEVICE_ID} should return 200`).toBe(
      200,
    );
    const body = await res.json();
    const info = parseDeviceInfo(body?.device_info);
    const gates = info?.calibration_data?.two_qubit_gates ?? {};
    return {
      average: averageTwoQubitGateError(info),
      gateCount: Object.keys(gates).length,
    };
  } finally {
    await ctx.dispose();
  }
}

test.describe('Device two-qubit gate error rate', () => {
  test.skip(
    !API_BASE,
    'USER_API_ENDPOINT (or E2E_API_BASE_URL) is not set',
  );

  test('averaged 2Q gate error rate is within threshold', async () => {
    const threshold = loadThresholds().errorRate.max2qGateError;
    const { average, gateCount } = await fetchDeviceErrorRate();

    // Report the measured value so it is visible in the run output and the
    // HTML report, mirroring the runn `report_error_rate` step.
    const measured =
      average === null ? 'n/a (no calibration data)' : average.toFixed(6);
    const line = `device=${DEVICE_ID} gates=${gateCount} avg_2q_gate_error=${measured} threshold=${threshold}`;
    console.log(`[error-rate] ${line}`);
    await test.info().attach('error-rate', {
      body: line,
      contentType: 'text/plain',
    });

    // An unmeasurable device (missing calibration data) is treated as a pass,
    // consistent with the scenario-tests gate.
    if (average === null) return;

    expect(
      average,
      `averaged 2Q gate error ${measured} exceeds threshold ${threshold}`,
    ).toBeLessThanOrEqual(threshold);
  });
});
