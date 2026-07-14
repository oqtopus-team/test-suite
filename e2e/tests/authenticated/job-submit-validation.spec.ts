import { test, expect } from '@playwright/test';

/**
 * Job-submission form validation: an empty program is rejected client-side.
 *
 * The job form at `/jobs/form` requires a program (QASM) body. Submitting with
 * the program left empty must surface an inline validation error and must NOT
 * call the job-creation API — the request is blocked in the browser before it
 * is ever sent. This is the "API is not called" acceptance bar: it only holds
 * for genuine client-side validation, which the empty-program case is.
 *
 * Scope note (verified against the live app): a *malformed* (non-empty) QASM
 * program is NOT caught client-side — the form posts it to the job API and the
 * server rejects it with a "失敗: ジョブの送信に失敗しました" message. That is a
 * server-side error path (design-doc JOB-009 "QASM 構文エラー"), a different
 * observable from this test's "API is not called" guarantee, so it is
 * deliberately out of scope here.
 *
 * Safety: a route handler aborts any POST to the job-creation endpoint, so even
 * if client-side validation ever regressed this test could never create a real
 * job on the target environment. The same handler records the attempt, letting
 * us assert the endpoint was not called at all.
 */

// Job-creation endpoint. The frontend and the User-API live on different hosts
// (e.g. app host vs. `*-api` host), so match on the path rather than the origin.
const JOB_CREATE_URL = /\/jobs$/;

// A valid QASM3 program, only used to prove the form *would* otherwise submit —
// the assertion is on the empty case. Mirrors the form's own placeholder.
const DEVICE_ID = 'qulacs'; // simulator present in every environment

test('empty program is blocked client-side with an inline error and no API call', async ({
  page,
}) => {
  // Record (and abort) any attempt to hit the job-creation endpoint.
  const jobSubmitAttempts: string[] = [];
  await page.route(JOB_CREATE_URL, async (route) => {
    if (route.request().method() === 'POST') {
      jobSubmitAttempts.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('/jobs/form');
  await expect(page).not.toHaveURL(/login/i);
  await expect(
    page.getByRole('heading', { name: 'Job入力フォーム' }),
  ).toBeVisible({ timeout: 30_000 });

  // Fill every *other* required field so the empty program is the only thing
  // left to fail: a device, a shot count, and the job type.
  await page.selectOption('select[name="deviceId"]', DEVICE_ID);
  await page.selectOption('select[name="type"]', 'sampling');
  await page.fill('input[name="shots"]', '1000');

  // Choose manual entry so the program (QASM) textarea is shown, then leave it
  // empty. The radio group toggles the input method; the manual option is the
  // one that reveals `textarea[name="program"]`.
  const manualRadio = page.locator('input[name="job-info-upload-option"]').nth(1);
  await manualRadio.check({ force: true });
  const program = page.locator('textarea[name="program"]');
  await expect(program).toBeVisible();
  await expect(program).toHaveValue('');

  // Submit with the program empty.
  await page.getByRole('button', { name: '送信する', exact: true }).click();

  // The form shows an inline validation error and stays on the form page.
  await expect(page.getByText('プログラムを入力してください')).toBeVisible();
  await expect(page).toHaveURL(/\/jobs\/form/);

  // The job-creation API must never have been called: client-side validation
  // stops the request synchronously, so by the time the error is visible any
  // request would already have been recorded by the route handler above.
  expect(jobSubmitAttempts).toEqual([]);
});
