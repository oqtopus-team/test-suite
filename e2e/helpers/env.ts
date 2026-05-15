import { test } from '@playwright/test';

/**
 * Skip the calling test when `E2E_BASE_URL` is not configured.
 * Centralizes the boilerplate so every spec does not have to repeat it.
 */
export function requireBaseURL(): void {
  const baseURL = test.info().project.use.baseURL;
  test.skip(!baseURL, 'E2E_BASE_URL is not set');
}
