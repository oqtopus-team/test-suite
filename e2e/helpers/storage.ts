import { join } from 'node:path';

/**
 * Path of the Playwright storageState written by the `setup` project after a
 * successful login and reused by the `chromium-auth` project. Kept under the
 * gitignored test-results dir so the saved auth cookies never get committed.
 */
export const STORAGE_STATE = join(__dirname, '..', 'test-results', '.auth', 'state.json');
