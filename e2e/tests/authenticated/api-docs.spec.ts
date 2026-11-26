import { test, expect, type Page, type Response } from '@playwright/test';
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
 *   `$ref`s shows "Resolver error".
 * - `.version-pragma` — "Unable to render this definition": the response
 *   was not an OpenAPI document at all (typically the SPA's index.html served
 *   with 200 for a missing static file).
 *
 * When one is found the test fails, and the error text is recorded in the
 * test annotations, together with a screenshot and the openapi.yaml fetch
 * summary as attachments, so the HTML/CI report shows what users saw.
 */

const OPENAPI_URL = /\/static_assets\/openapi\.yaml(?:[?#]|$)/;

const ERROR_INDICATORS = [
  '.swagger-ui .loading-container .title',
  '.swagger-ui .errors-wrapper .error-wrapper',
  '.swagger-ui .version-pragma',
] as const;

const INFO_TITLE = '.swagger-ui .information-container .info .title';

interface SpecFetch {
  url: string;
  status: number | null;
  contentType?: string;
  bodyHead?: string;
  failure?: string;
}

/** Record every openapi.yaml request made by the page, including failures. */
function trackSpecFetches(page: Page): SpecFetch[] {
  const fetches: SpecFetch[] = [];
  page.on('response', (res: Response) => {
    if (!OPENAPI_URL.test(res.url())) return;
    const entry: SpecFetch = {
      url: res.url(),
      status: res.status(),
      contentType: res.headers()['content-type'],
    };
    fetches.push(entry);
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
    if (!OPENAPI_URL.test(req.url())) return;
    fetches.push({ url: req.url(), status: null, failure: req.failure()?.errorText });
  });
  return fetches;
}

function describeFetches(fetches: SpecFetch[]): string {
  if (fetches.length === 0) return 'no openapi.yaml request was observed';
  return fetches
    .map((f) =>
      [
        `GET ${f.url} -> ${f.status ?? `failed (${f.failure ?? 'unknown'})`}`,
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

const colorSchemes = ['light', 'dark'] as const;

// Skip in a hook rather than in the test body: the `page` fixture loads the
// project's storageState before the body runs, so when `setup` was skipped
// (E2E_BASE_URL or credentials unset) the test would otherwise error on the
// missing state file instead of being skipped.
test.beforeEach(() => {
  requireBaseURL();
  test.skip(!existsSync(STORAGE_STATE), 'no saved login state (auth setup was skipped)');
});

for (const scheme of colorSchemes) {
  test(`API docs (Swagger UI) render without errors in ${scheme} mode`, async ({ page }) => {
    // The app picks its theme from localStorage first and only falls back to
    // prefers-color-scheme, and the saved login state may already carry a
    // theme. Pin both so this run really exercises `scheme`.
    await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript((theme) => {
      window.localStorage.setItem('theme', theme);
    }, scheme);

    const specFetches = trackSpecFetches(page);

    await page.goto('/howto');
    await expect(page).not.toHaveURL(/login/i);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(scheme === 'dark');

    await expect(page.locator('.swagger-ui')).toBeVisible({ timeout: 30_000 });

    // Wait until Swagger UI has settled into either the rendered definition or
    // one of its error states before judging which one it is.
    await expect(
      page.locator([INFO_TITLE, ...ERROR_INDICATORS].join(', ')).first(),
    ).toBeVisible({ timeout: 30_000 });
    // Give the in-flight body read a moment so the fetch summary is complete.
    await expect
      .poll(() => specFetches.every((f) => f.status === null || f.bodyHead !== undefined), {
        timeout: 5_000,
      })
      .toBe(true)
      .catch(() => {});

    const fetchSummary = describeFetches(specFetches);
    await test.info().attach(`openapi-fetch-${scheme}.txt`, {
      body: fetchSummary,
      contentType: 'text/plain',
    });

    const errors = await collectSwaggerErrors(page);
    if (errors.length > 0) {
      for (const message of errors) {
        test.info().annotations.push({ type: 'swagger-ui error', description: message });
      }
      test.info().annotations.push({ type: 'openapi.yaml fetch', description: fetchSummary });
      await test.info().attach(`swagger-ui-error-${scheme}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    expect(errors, `Swagger UI shows an error.\nopenapi.yaml fetch:\n${fetchSummary}`).toEqual([]);

    // The definition itself was fetched successfully.
    expect(
      specFetches.some((f) => f.status === 200),
      `openapi.yaml was not served with 200:\n${fetchSummary}`,
    ).toBe(true);

    // Title and API version from `info` are shown.
    const title = page.locator(INFO_TITLE);
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText(/^\s*$/);
    const version = title.locator('small pre').first();
    await expect(version).toBeVisible();
    await expect(version).toHaveText(/\S/);

    // At least one operation is listed, and expanding one shows its
    // parameters and responses.
    const operations = page.locator('.swagger-ui .opblock');
    await expect(operations.first()).toBeVisible();
    expect(await operations.count()).toBeGreaterThan(0);

    const operation = operations.first();
    await operation.locator('.opblock-summary-control').first().click();
    const body = operation.locator('.opblock-body');
    await expect(body).toBeVisible();
    await expect(body.locator('.parameters-container')).toBeVisible();
    await expect(body.locator('.responses-wrapper')).toBeVisible();
    await expect(body.locator('.responses-table .response').first()).toBeVisible();
  });
}
