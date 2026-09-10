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

// ── Helpers ────────────────────────────────────────────────────────

const API_BASE =
  process.env.USER_API_ENDPOINT ?? process.env.E2E_API_BASE_URL ?? '';
const API_TOKEN = process.env.Q_API_TOKEN ?? process.env.E2E_API_TOKEN ?? '';

function headers(): Record<string, string> {
  return { 'q-api-token': API_TOKEN };
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

/** Step 5: Fetch the result JSON from the presigned result URL. */
export async function fetchResult(
  ctx: APIRequestContext,
  resultUrl: string,
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
    return extractJsonFromZip(body);
  }
  return JSON.parse(body.toString('utf-8')) as SamplingResult;
}

function extractJsonFromZip(zipBuffer: Buffer): SamplingResult {
  const dir = mkdtempSync(join(tmpdir(), 'result-'));
  try {
    const zipPath = join(dir, 'result.zip');
    writeFileSync(zipPath, zipBuffer);
    execSync(`unzip -o "${zipPath}" -d "${dir}"`, { stdio: 'pipe' });
    // Find the first JSON file in the extracted directory.
    const output = execSync(`find "${dir}" -name "*.json" -not -name "result.zip"`, {
      encoding: 'utf-8',
    }).trim();
    const jsonPath = output.split('\n')[0];
    return JSON.parse(readFileSync(jsonPath, 'utf-8')) as SamplingResult;
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
 * @returns        The sampling result (counts).
 */
export async function runSamplingJob(
  ctx: APIRequestContext,
  program: string[],
  params: SubmitParams,
): Promise<SamplingResult> {
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
    return raw;
  }
  const sampling = raw.sampling as Record<string, unknown> | undefined;
  if (sampling?.counts && typeof sampling.counts === 'object') {
    return { counts: sampling.counts as Record<string, number> };
  }
  // If every value is a number, treat the whole object as counts.
  const values = Object.values(raw);
  if (values.length > 0 && values.every((v) => typeof v === 'number')) {
    return { counts: raw as unknown as Record<string, number> };
  }
  // Last resort: log and return as-is (bellFidelity will throw a clearer error).
  console.warn(`[job-runner] WARNING: result has no 'counts' field. Full result: ${JSON.stringify(raw)}`);
  return raw;
}
