/**
 * Persistence for Layer-1 threshold results.
 *
 * A failing test makes Playwright restart its worker, so state held in the
 * spec module does not survive a run. Each test therefore writes its own
 * entry to `results/threshold/<key>.json`; a retry overwrites the same file so
 * the final attempt wins. Global setup clears the directory and global
 * teardown merges the entries into `results/threshold.json`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const RESULTS_DIR = join(__dirname, '..', 'results');
const ENTRY_DIR = join(RESULTS_DIR, 'threshold');
const SUMMARY_PATH = join(RESULTS_DIR, 'threshold.json');

export interface ThresholdEntry {
  device: string;
  measured: number | null;
  threshold: number;
  unit?: string;
  /** `null` when the value is not measurable (treated as a pass). */
  passed: boolean | null;
  /** Playwright retry index of the attempt that produced this entry. */
  retry: number;
}

/** Record (or replace on retry) the entry for a single threshold check. */
export function recordThresholdResult(key: string, entry: ThresholdEntry): void {
  mkdirSync(ENTRY_DIR, { recursive: true });
  writeFileSync(
    join(ENTRY_DIR, `${key}.json`),
    `${JSON.stringify(entry, null, 2)}\n`,
  );
}

/** Drop entries left over from a previous run. */
export function clearThresholdResults(): void {
  rmSync(ENTRY_DIR, { recursive: true, force: true });
  rmSync(SUMMARY_PATH, { force: true });
}

/** Merge per-test entries into `threshold.json`; no-op if none were recorded. */
export function aggregateThresholdResults(): void {
  if (!existsSync(ENTRY_DIR)) return;
  const files = readdirSync(ENTRY_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) return;

  const checks: Record<string, ThresholdEntry> = {};
  for (const file of files) {
    checks[file.replace(/\.json$/, '')] = JSON.parse(
      readFileSync(join(ENTRY_DIR, file), 'utf-8'),
    ) as ThresholdEntry;
  }
  const device = Object.values(checks)[0].device;
  writeFileSync(SUMMARY_PATH, `${JSON.stringify({ device, checks }, null, 2)}\n`);
}
