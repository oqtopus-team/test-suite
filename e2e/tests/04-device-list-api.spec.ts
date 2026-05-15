import { test, expect } from '@playwright/test';

/**
 * API-level smoke test that mirrors the `get_devices` step in
 * `scenario-tests/setup/runn_setup/setup.yml`.
 *
 * Verifies that the User-API `/devices` endpoint returns 200 and a non-empty
 * device list when authenticated with a valid Q API token. This is intended as
 * a probe to see whether Playwright's APIRequestContext is a viable way to
 * cover API checks from the e2e suite alongside the browser-based tests.
 */
test('GET /devices returns a non-empty device list', async ({ request }) => {
  const { USER_API_ENDPOINT, Q_API_TOKEN } = process.env;

  test.skip(!USER_API_ENDPOINT, 'USER_API_ENDPOINT is not set');
  test.skip(!Q_API_TOKEN, 'Q_API_TOKEN is not set');

  const response = await request.get(`${USER_API_ENDPOINT}/devices`, {
    headers: { 'q-api-token': Q_API_TOKEN! },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toHaveProperty('device_info');

  test.info().annotations.push({
    type: 'info',
    description: `${body.length} devices are registered`,
  });
});
