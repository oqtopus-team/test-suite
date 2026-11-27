import { test, expect, type Page, type Request, type Response } from '@playwright/test';
import { existsSync } from 'node:fs';
import { requireBaseURL } from '../../helpers/env';
import { STORAGE_STATE } from '../../helpers/storage';

/**
 * The API documentation lives on the authenticated `/howto` page
 * (サイドバー「APIドキュメント」). oqtopus-frontend renders it with
 * `swagger-ui-react`, which fetches `<PUBLIC_PATH>/static_assets/openapi.yaml`
 * in the browser and draws the operations from it.
 *
 * When that fetch or the definition itself is broken, Swagger UI does not
 * throw: it renders an in-page error instead. The indicators below are the
 * ones Swagger UI 5 uses, so any of them being on screen means the docs are
 * not usable even though the page itself loaded:
 *
 * - `.loading-container .title` — "Failed to load API definition.": the
 *   definition could not be fetched or parsed (shown together with the
 *   error list below).
 * - `.errors-wrapper .error-wrapper` — one entry per error. A fetch failure
 *   shows up as "Fetch error" followed by e.g. "Not Found <url>" /
 *   "Forbidden <url>" / "Failed to fetch <url>"; a definition with broken
 *   `$ref`s shows "Resolver error". Swagger UI resolves an operation's `$ref`s
 *   only when the operation is expanded, so resolver errors usually appear
 *   only after expanding — the check therefore runs again after every
 *   operation has been expanded.
 * - `.version-pragma` — "Unable to render this definition": the response
 *   was not an OpenAPI document at all (typically the SPA's index.html served
 *   with 200 for a missing static file).
 * - `h4` "No API definition provided." — the response body was empty.
 *
 * Whatever happens, the openapi.yaml fetch summary is attached. On failure
 * the error text and fetch summary are also recorded as annotations, with a
 * full-page screenshot, so the HTML/CI report shows what users saw. On
 * success a screenshot per color scheme is attached instead.
 *
 * The `error detection` tests at the bottom feed broken responses to the real
 * page with `page.route` to prove these indicators still match, so a Swagger
 * UI upgrade that renames them cannot make the main test pass silently.
 */

const OPENAPI_URL = /\/static_assets\/openapi\.yaml(?:[?#]|$)/;
const OPENAPI_ROUTE = '**/static_assets/openapi.yaml*';

const ERROR_INDICATORS = [
  '.swagger-ui .loading-container .title',
  '.swagger-ui .errors-wrapper .error-wrapper',
  '.swagger-ui .version-pragma',
  '.swagger-ui h4:text-is("No API definition provided.")',
] as const;

const INFO_TITLE = '.swagger-ui .information-container .info .title';

// The individual waits below are bounded so they add up to well under the
// test budget: a stuck step fails on its own wait (and the report says
// which), instead of on the generic test timeout, which would also cut the
// failure reporting in `finally` short.
const TEST_TIMEOUT_MS = 90_000;
const NAVIGATION_TIMEOUT_MS = 20_000;
const RENDER_TIMEOUT_MS = 20_000;
const OPERATION_TIMEOUT_MS = 5_000;

interface SpecFetch {
  url: string;
  status: number | null;
  contentType?: string;
  bodyHead?: string;
  failure?: string;
}

/**
 * Record every openapi.yaml request made by the page from the moment it is
 * sent, so a request that never gets a response is reported too.
 */
function trackSpecFetches(page: Page): SpecFetch[] {
  const fetches: SpecFetch[] = [];
  const byRequest = new Map<Request, SpecFetch>();
  page.on('request', (req) => {
    if (!OPENAPI_URL.test(req.url())) return;
    const entry: SpecFetch = { url: req.url(), status: null };
    byRequest.set(req, entry);
    fetches.push(entry);
  });
  page.on('response', (res: Response) => {
    const entry = byRequest.get(res.request());
    if (!entry) return;
    entry.status = res.status();
    entry.contentType = res.headers()['content-type'];
    // Keep the head of the body so a 200 that is really index.html or an
    // error document is recognisable in the report.
    res
      .text()
      .then((body) => {
        entry.bodyHead = body.slice(0, 200);
      })
      .catch(() => {});
  });
  page.on('requestfailed', (req) => {
    const entry = byRequest.get(req);
    if (entry) entry.failure = req.failure()?.errorText ?? 'unknown';
  });
  return fetches;
}

/** Give in-flight body reads a moment so the fetch summary is complete. */
async function settleFetchBodies(fetches: SpecFetch[]): Promise<void> {
  await expect
    .poll(() => fetches.every((f) => f.status === null || f.bodyHead !== undefined), {
      timeout: 3_000,
    })
    .toBe(true)
    .catch(() => {});
}

function describeFetches(fetches: SpecFetch[]): string {
  if (fetches.length === 0) return 'no openapi.yaml request was observed';
  return fetches
    .map((f) =>
      [
        `GET ${f.url} -> ${
          f.status ?? (f.failure !== undefined ? `failed (${f.failure})` : 'no response yet')
        }`,
        f.contentType ? `content-type: ${f.contentType}` : undefined,
        f.bodyHead !== undefined ? `body: ${JSON.stringify(f.bodyHead)}` : undefined,
      ]
        .filter(Boolean)
        .join('\n  '),
    )
    .join('\n');
}

/** Visible Swagger UI error texts, normalised to one line each. */
async function collectSwaggerErrors(page: Page): Promise<string[]> {
  const errors = new Set<string>();
  for (const selector of ERROR_INDICATORS) {
    for (const el of await page.locator(selector).all()) {
      if (!(await el.isVisible())) continue;
      errors.add((await el.innerText()).replace(/\s+/g, ' ').trim());
    }
  }
  return [...errors];
}

/** Annotations that describe a failed load, as written to the report. */
function failureAnnotations(errors: string[], fetchSummary: string) {
  return [
    ...errors.map((description) => ({ type: 'swagger-ui error', description })),
    { type: 'openapi.yaml fetch', description: fetchSummary },
  ];
}

/** Open `/howto` and wait until Swagger UI shows the definition or an error. */
async function openApiDocs(page: Page): Promise<void> {
  await page.goto('/howto', { timeout: NAVIGATION_TIMEOUT_MS });
  await expect(page).not.toHaveURL(/login/i);
  await expect(page.locator('.swagger-ui')).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
  await expect(
    page.locator([INFO_TITLE, ...ERROR_INDICATORS].join(', ')).first(),
  ).toBeVisible({ timeout: RENDER_TIMEOUT_MS });
}

/** Fail if Swagger UI shows any error; `stage` says when it was checked. */
async function expectNoSwaggerErrors(page: Page, stage: string): Promise<void> {
  const errors = await collectSwaggerErrors(page);
  expect(errors, `Swagger UI shows an error ${stage}`).toEqual([]);
}

// Skip in a hook rather than in the test body: the `page` fixture loads the
// project's storageState before the body runs, so when `setup` was skipped
// (E2E_BASE_URL or credentials unset) the test would otherwise error on the
// missing state file instead of being skipped.
test.beforeEach(() => {
  requireBaseURL();
  test.skip(!existsSync(STORAGE_STATE), 'no saved login state (auth setup was skipped)');
});

const colorSchemes = ['light', 'dark'] as const;

for (const scheme of colorSchemes) {
  test(`API docs (Swagger UI) render without errors in ${scheme} mode`, async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    // The app picks its theme from localStorage first and only falls back to
    // prefers-color-scheme, and the saved login state may already carry a
    // theme. Pin both so this run really exercises `scheme`.
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript((theme) => {
      window.localStorage.setItem('theme', theme);
    }, scheme);

    const specFetches = trackSpecFetches(page);
    let passed = false;
    try {
      await openApiDocs(page);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
          timeout: OPERATION_TIMEOUT_MS,
        })
        .toBe(scheme === 'dark');

      await expectNoSwaggerErrors(page, 'after loading the definition');

      // The definition itself was fetched successfully.
      expect(
        specFetches.some((f) => f.status === 200),
        `openapi.yaml was not served with 200:\n${describeFetches(specFetches)}`,
      ).toBe(true);

      // Title and API version from `info` are shown.
      const title = page.locator(INFO_TITLE);
      await expect(title).not.toHaveText(/^\s*$/);
      await expect(title.locator('small pre').first()).toHaveText(/\S/);

      // At least one operation is listed. Expand every operation — this is
      // what makes Swagger UI resolve their `$ref`s — and check that each one
      // shows its parameters and responses.
      const operations = page.locator('.swagger-ui .opblock');
      await expect(operations.first()).toBeVisible();
      for (const operation of await operations.all()) {
        await operation.locator('.opblock-summary-control').first().click();
        const body = operation.locator('.opblock-body');
        await expect(body.locator('.parameters-container')).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(body.locator('.responses-wrapper')).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
        await expect(body.locator('.responses-table .response').first()).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
      }

      await expectNoSwaggerErrors(page, 'after expanding every operation');
      passed = true;
    } finally {
      // Runs on success and on any failure above, so the report always says
      // what openapi.yaml returned and what was on screen. Each step is
      // guarded so a closed page cannot hide the original failure.
      await settleFetchBodies(specFetches);
      const fetchSummary = describeFetches(specFetches);
      await test.info().attach(`openapi-fetch-${scheme}.txt`, {
        body: fetchSummary,
        contentType: 'text/plain',
      });
      if (!passed) {
        const errors = await collectSwaggerErrors(page).catch(() => [] as string[]);
        test.info().annotations.push(...failureAnnotations(errors, fetchSummary));
      }
      const screenshot = await page.screenshot({ fullPage: true }).catch(() => undefined);
      if (screenshot) {
        await test.info().attach(
          passed ? `api-docs-${scheme}.png` : `swagger-ui-error-${scheme}.png`,
          { body: screenshot, contentType: 'image/png' },
        );
      }
    }
  });
}

/**
 * A minimal definition whose only response points at a schema that does not
 * exist. Swagger UI loads it fine and only reports "Resolver error" once the
 * operation is expanded.
 */
const BROKEN_REF_DEFINITION = `openapi: 3.0.1
info:
  title: Broken ref
  version: '1.0'
paths:
  /broken:
    get:
      summary: broken ref
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DoesNotExist'
`;

const errorCases = [
  {
    name: '404',
    response: { status: 404, contentType: 'text/plain', body: 'Not Found' },
    expected: /Fetch error.*Not Found/,
  },
  {
    name: '403',
    response: {
      status: 403,
      contentType: 'application/xml',
      body: '<Error><Code>AccessDenied</Code></Error>',
    },
    expected: /Fetch error.*Forbidden/,
  },
  {
    name: 'HTML served with 200',
    response: {
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    },
    expected: /Unable to render this definition/,
  },
  {
    name: 'empty body served with 200',
    response: { status: 200, contentType: 'application/yaml', body: '' },
    expected: /No API definition provided/,
  },
  {
    name: 'broken $ref (shown after expanding)',
    response: { status: 200, contentType: 'application/yaml', body: BROKEN_REF_DEFINITION },
    expected: /Resolver error/,
    expand: true,
  },
] as const;

test.describe('API docs error detection', () => {
  for (const c of errorCases) {
    test(`detects a broken openapi.yaml: ${c.name}`, async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS);
      await page.route(OPENAPI_ROUTE, (route) => route.fulfill(c.response));
      const specFetches = trackSpecFetches(page);

      await openApiDocs(page);
      if ('expand' in c && c.expand) {
        await page.locator('.swagger-ui .opblock .opblock-summary-control').first().click();
        await expect(page.locator('.swagger-ui .errors-wrapper .error-wrapper').first()).toBeVisible({
          timeout: OPERATION_TIMEOUT_MS,
        });
      }

      const errors = await collectSwaggerErrors(page);
      expect(errors.join('\n')).toMatch(c.expected);

      // The same annotations the main test writes on failure carry the error
      // and the request status.
      await settleFetchBodies(specFetches);
      const annotations = failureAnnotations(errors, describeFetches(specFetches));
      expect(annotations.filter((a) => a.type === 'swagger-ui error')).not.toHaveLength(0);
      expect(annotations.find((a) => a.type === 'openapi.yaml fetch')?.description).toContain(
        `-> ${c.response.status}`,
      );
    });
  }
});
