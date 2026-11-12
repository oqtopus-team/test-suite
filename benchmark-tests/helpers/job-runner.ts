/**
 * Generic job submission and polling against the User-API.
 *
 * Implements the 3-step flow:
 *   1. POST /jobs → register, get presigned URL
 *   2. Upload input archive (zip) to S3 via presigned URL
 *   3. POST /jobs/{job_id}/submit → submit with metadata
 *   4. Poll GET /jobs/{job_id} until terminal status
 *   5. Fetch result from presigned result URL
 */

import { execSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { APIRequestContext } from '@playwright/test';

// ── Types ──────────────────────────────────────────────────────────

interface PresignedUrl {
  url: string;
  fields: Record<string, string>;
}

interface JobRegistration {
  job_id: string;
  presigned_url: PresignedUrl;
}

interface JobInfo {
  input?: string;
  result?: string;
  transpile_result?: string;
  combined_program?: string;
  sse_log?: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  job_info?: JobInfo;
  execution_time?: number;
}

export interface SubmitParams {
  name: string;
  description?: string;
  device_id: string;
  job_type: string;
  shots: number;
  transpiler_info?: Record<string, unknown>;
  mitigation_info?: Record<string, unknown>;
  simulator_info?: Record<string, unknown>;
}

export interface SamplingResult {
  counts: Record<string, number>;
  [key: string]: unknown;
}

export interface SamplingJobResult {
  result: SamplingResult;
  job: JobStatus;
}

// ── Helpers ────────────────────────────────────────────────────────

const API_BASE =
  process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL ?? '';
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN ?? '';

function headers(): Record<string, string> {
  // LambdaAuth caches results keyed on Authorization, so it must carry
  // the same value as q-api-token. oqtopus-cloud plans to unify these
  // into one header.
  return { 'q-api-token': API_TOKEN, Authorization: API_TOKEN };
}

/** Create a zip archive containing a single JSON file. */
export function createInputZip(
  payload: Record<string, unknown>,
  filename = 'input.json',
): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'job-'));
  try {
    const jsonPath = join(dir, filename);
    const zipPath = join(dir, 'input.zip');
    writeFileSync(jsonPath, JSON.stringify(payload));
    execSync(`zip -j "${zipPath}" "${jsonPath}"`, { stdio: 'pipe' });
    return readFileSync(zipPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── API Steps ──────────────────────────────────────────────────────

/** Step 1: Register a new job, returning the job ID and presigned URL. */
export async function registerJob(
  ctx: APIRequestContext,
): Promise<JobRegistration> {
  const res = await ctx.post(`${API_BASE}/jobs`, {
    headers: headers(),
  });
  if (!res.ok()) {
    throw new Error(`POST /jobs failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as JobRegistration;
}

/** Step 2: Upload the input zip to S3 via the presigned URL. */
export async function uploadInput(
  ctx: APIRequestContext,
  presigned: PresignedUrl,
  zipBuffer: Buffer,
): Promise<void> {
  // Build multipart form data — field order matters for S3 (file must be last).
  const form: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
  for (const [k, v] of Object.entries(presigned.fields)) {
    form[k] = v;
  }
  form.file = {
    name: 'input.zip',
    mimeType: 'application/zip',
    buffer: zipBuffer,
  };

  const res = await ctx.post(presigned.url, { multipart: form });
  const status = res.status();
  if (status !== 200 && status !== 201 && status !== 204) {
    throw new Error(
      `S3 upload failed: ${status} ${await res.text()}`,
    );
  }
}

/** Step 3: Submit the job with metadata. */
export async function submitJob(
  ctx: APIRequestContext,
  jobId: string,
  params: SubmitParams,
): Promise<void> {
  const res = await ctx.post(`${API_BASE}/jobs/${jobId}/submit`, {
    headers: { ...headers(), 'content-type': 'application/json' },
    data: params,
  });
  if (!res.ok()) {
    throw new Error(
      `POST /jobs/${jobId}/submit failed: ${res.status()} ${await res.text()}`,
    );
  }
}

/** Step 4: Poll until the job reaches a terminal status. */
export async function pollJob(
  ctx: APIRequestContext,
  jobId: string,
  {
    intervalMs = 5_000,
    timeoutMs = 300_000,
  }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<JobStatus> {
  const deadline = Date.now() + timeoutMs;
  const terminal = new Set(['succeeded', 'failed', 'cancelled']);

  while (Date.now() < deadline) {
    const res = await ctx.get(`${API_BASE}/jobs/${jobId}`, {
      headers: headers(),
    });
    if (!res.ok()) {
      throw new Error(
        `GET /jobs/${jobId} failed: ${res.status()} ${await res.text()}`,
      );
    }
    const job = (await res.json()) as JobStatus;
    if (terminal.has(job.status)) return job;

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

// ── Result archives ────────────────────────────────────────────────

/** Says which JSON file of a result archive is the one the caller wants. */
export interface JsonPicker {
  /** Human-readable description, used in error messages. */
  what: string;
  matches: (value: unknown) => boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

/** A sampling result: `counts`, `sampling.counts`, or a bare counts object. */
export const SAMPLING_RESULT: JsonPicker = {
  what: 'a sampling result (counts)',
  matches: (v) =>
    isRecord(v) &&
    (isRecord(v.counts) ||
      (isRecord(v.sampling) && isRecord(v.sampling.counts)) ||
      (Object.keys(v).length > 0 && Object.values(v).every((x) => typeof x === 'number'))),
};

/** A transpile result: the transpiled program and/or the qubit placement. */
export const TRANSPILE_RESULT: JsonPicker = {
  what: 'a transpile result',
  matches: (v) =>
    isRecord(v) &&
    ['transpiled_program', 'virtual_physical_mapping', 'qubit_mapping', 'layout', 'initial_layout']
      .some((k) => k in v),
};

/**
 * Choose the JSON file of a result archive. A single JSON file is used as is.
 * With several, exactly one must match `picker` — none or more than one is an
 * error rather than a guess, so an unrelated JSON (metadata, logs, ...) is
 * never read as the result.
 */
export function selectArchiveJson(
  files: { name: string; content: string }[],
  picker: JsonPicker,
): unknown {
  if (files.length === 0) throw new Error(`result archive has no JSON file (expected ${picker.what})`);
  const parse = (f: { name: string; content: string }) => {
    try {
      return JSON.parse(f.content) as unknown;
    } catch (e) {
      throw new Error(`result archive file ${f.name} is not valid JSON: ${e}`);
    }
  };
  if (files.length === 1) return parse(files[0]);
  const parsed = files.map((f) => ({ name: f.name, value: parse(f) }));
  const hits = parsed.filter((f) => picker.matches(f.value));
  const names = (list: { name: string }[]) => list.map((f) => f.name).join(', ');
  if (hits.length === 1) return hits[0].value;
  if (hits.length === 0) {
    throw new Error(`no JSON file in the result archive is ${picker.what} (files: ${names(parsed)})`);
  }
  throw new Error(
    `cannot choose the result: ${hits.length} JSON files in the archive look like ${picker.what} (${names(hits)})`,
  );
}

/** Step 5: Fetch the result JSON from the presigned result URL. */
export async function fetchResult(
  ctx: APIRequestContext,
  resultUrl: string,
  picker: JsonPicker = SAMPLING_RESULT,
): Promise<SamplingResult> {
  const res = await ctx.get(resultUrl);
  if (!res.ok()) {
    throw new Error(
      `GET result failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = await res.body();

  // The result may be a zip archive or bare JSON.
  // Zip files start with 'PK' (0x50 0x4B).
  if (body[0] === 0x50 && body[1] === 0x4b) {
    return extractJsonFromZip(body, picker) as SamplingResult;
  }
  return JSON.parse(body.toString('utf-8')) as SamplingResult;
}

/** Unpack a result archive and pick its JSON with `selectArchiveJson`. */
export function extractJsonFromZip(zipBuffer: Buffer, picker: JsonPicker): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'result-'));
  try {
    const zipPath = join(dir, 'result.zip');
    const outDir = join(dir, 'out');
    writeFileSync(zipPath, zipBuffer);
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' });
    const files = (readdirSync(outDir, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.json') && !f.split('/').includes('__MACOSX'))
      .sort()
      .map((f) => ({ name: f, content: readFileSync(join(outDir, f), 'utf-8') }));
    return selectArchiveJson(files, picker);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Convenience ────────────────────────────────────────────────────

/**
 * Run a complete sampling job: register → upload → submit → poll → result.
 *
 * @param program  Array of OpenQASM 3 program strings.
 * @param params   Job submission parameters (name, device_id, shots, etc.).
 * @returns        The sampling result (counts) and full job status.
 */
export async function runSamplingJob(
  ctx: APIRequestContext,
  program: string[],
  params: SubmitParams,
): Promise<SamplingJobResult> {
  const inputPayload = { program };
  const zipBuffer = createInputZip(inputPayload);

  const { job_id, presigned_url } = await registerJob(ctx);
  await uploadInput(ctx, presigned_url, zipBuffer);
  await submitJob(ctx, job_id, params);

  const job = await pollJob(ctx, job_id);
  if (job.status !== 'succeeded') {
    const detail = JSON.stringify(job, null, 2);
    throw new Error(
      `Job ${job_id} ended with status: ${job.status}\n` +
      `Device: ${params.device_id} | Shots: ${params.shots}\n` +
      `Job detail:\n${detail}`,
    );
  }

  const resultUrl = job.job_info?.result;
  if (!resultUrl) {
    throw new Error(`Job ${job_id} has no result URL`);
  }

  const raw = await fetchResult(ctx, resultUrl);
  console.log(`[job-runner] raw result keys: ${JSON.stringify(Object.keys(raw))}`);

  // Normalise result format — counts may live in different locations:
  //   { counts: {...} }                             — flat
  //   { sampling: { counts: {...}, ... }, ... }      — nested (qulacs / OQTOPUS)
  //   { "00": 500, "11": 500 }                      — bare counts object
  if (raw.counts && typeof raw.counts === 'object') {
    return { result: raw, job };
  }
  const sampling = raw.sampling as Record<string, unknown> | undefined;
  if (sampling?.counts && typeof sampling.counts === 'object') {
    return { result: { counts: sampling.counts as Record<string, number> }, job };
  }
  // If every value is a number, treat the whole object as counts.
  const values = Object.values(raw);
  if (values.length > 0 && values.every((v) => typeof v === 'number')) {
    return { result: { counts: raw as unknown as Record<string, number> }, job };
  }
  // Last resort: log and return as-is (bellFidelity will throw a clearer error).
  console.warn(`[job-runner] WARNING: result has no 'counts' field. Full result: ${JSON.stringify(raw)}`);
  return { result: raw, job };
}

/**
 * Fetch the transpile result from a job's presigned URL.
 * Returns the parsed JSON content, or null if the URL is not available.
 */
export async function fetchTranspileResult(
  ctx: APIRequestContext,
  job: JobStatus,
): Promise<Record<string, unknown> | null> {
  const url = job.job_info?.transpile_result;
  if (!url) return null;

  try {
    const raw = await fetchResult(ctx, url, TRANSPILE_RESULT);
    return raw as unknown as Record<string, unknown>;
  } catch (e) {
    console.warn(`[job-runner] Failed to fetch transpile result: ${e}`);
    return null;
  }
}
