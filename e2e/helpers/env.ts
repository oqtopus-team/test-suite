import { test } from '@playwright/test';

/**
 * Skip the calling test when `E2E_BASE_URL` is not configured.
 * Centralizes the boilerplate so every spec does not have to repeat it.
 */
export function requireBaseURL(): void {
  const baseURL = test.info().project.use.baseURL;
  test.skip(!baseURL, 'E2E_BASE_URL is not set');
}

/**
 * Read a boolean-ish environment variable. Returns `defaultValue` when the
 * variable is unset or empty (e.g. a CI expression that resolved to ""),
 * otherwise `false` only for the literal string "false" (case-insensitive).
 * Anything else is treated as `true`.
 */
export function boolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  return raw.toLowerCase() !== 'false';
}
