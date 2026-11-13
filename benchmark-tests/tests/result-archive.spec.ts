/**
 * Unit tests for picking the result JSON out of a job result archive — no API
 * needed, so they run on every benchmark job.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  SAMPLING_RESULT,
  TRANSPILE_RESULT,
  extractJsonFromZip,
  selectArchiveJson,
} from '../helpers/job-runner';

const json = (name: string, value: unknown) => ({ name, content: JSON.stringify(value) });
const sampling = { sampling: { counts: { '00': 500, '11': 500 } } };
const transpile = { transpiled_program: 'OPENQASM 3;', virtual_physical_mapping: { qubit_mapping: { 0: 1 } } };
const metadata = { job_id: 'j-1', status: 'succeeded' };

test.describe('result archive JSON selection (unit)', () => {
  test('a single JSON file is used as is', () => {
    expect(selectArchiveJson([json('anything.json', metadata)], SAMPLING_RESULT)).toEqual(metadata);
  });

  test('picks the file matching the expected shape among several', () => {
    // An unrelated JSON sorting first must not be read as the result.
    const files = [json('a-metadata.json', metadata), json('result.json', sampling), json('transpile.json', transpile)];
    expect(selectArchiveJson(files, SAMPLING_RESULT)).toEqual(sampling);
    expect(selectArchiveJson(files, TRANSPILE_RESULT)).toEqual(transpile);
  });

  test('no matching file is an error', () => {
    expect(() =>
      selectArchiveJson([json('a.json', metadata), json('b.json', { log: [] })], SAMPLING_RESULT),
    ).toThrow(/no JSON file in the result archive is a sampling result/);
  });

  test('more than one matching file is an error', () => {
    expect(() =>
      selectArchiveJson([json('r1.json', sampling), json('r2.json', { counts: { '00': 1 } })], SAMPLING_RESULT),
    ).toThrow(/2 JSON files in the archive look like a sampling result/);
  });

  test('an empty archive or invalid JSON is an error', () => {
    expect(() => selectArchiveJson([], SAMPLING_RESULT)).toThrow(/no JSON file/);
    expect(() => selectArchiveJson([{ name: 'r.json', content: '{' }], SAMPLING_RESULT)).toThrow(/not valid JSON/);
  });

  test('a real ZIP with nested files is unpacked and selected by shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'archive-test-'));
    try {
      mkdirSync(join(dir, 'job'));
      writeFileSync(join(dir, 'job', '0-metadata.json'), JSON.stringify(metadata));
      writeFileSync(join(dir, 'job', 'result.json'), JSON.stringify(sampling));
      execFileSync('zip', ['-qr', 'result.zip', 'job'], { cwd: dir });
      const zip = readFileSync(join(dir, 'result.zip'));
      expect(extractJsonFromZip(zip, SAMPLING_RESULT)).toEqual(sampling);
      expect(() => extractJsonFromZip(zip, TRANSPILE_RESULT)).toThrow(/no JSON file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
