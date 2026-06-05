# E2E Tests (Playwright)

Browser-based end-to-end tests for OQTOPUS user-facing web flows.
Implemented with [Playwright](https://playwright.dev/) and TypeScript.

## Prerequisites

- Node.js 20 or later (LTS recommended)
- npm (bundled with Node.js)
- Playwright browser binaries (installed via `npx playwright install`)
- A dedicated test account (do not use production users)

## Quick Start

```bash
cd e2e

# 1. Install dependencies
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install --with-deps

# 3. Configure environment variables
cp .env.example .env   # create .env manually if .env.example is not present
$EDITOR .env           # set E2E_BASE_URL / E2E_EMAIL / E2E_PASSWORD

# 4. Run the tests
npx playwright test

# 5. Open the HTML report
npx playwright show-report
```

Run headed/debug modes to observe behavior:

```bash
npx playwright test --headed
npx playwright test --ui        # Playwright UI mode
npx playwright test --debug     # step-through debugger
```

Run a single test:

```bash
npx playwright test tests/logo.spec.ts
npx playwright test -g "logo"   # filter by title substring
```

## Running via Task (with profiles)

[`Taskfile.yml`](./Taskfile.yml) wraps the common Playwright commands and loads
environment variables from `../profiles/<PROFILE>.env` (shared with
`scenario-tests`) before falling back to `e2e/.env`. This lets you switch
between target environments (e.g. `env-a`, `env-b`, `env-c`) without editing
`.env` each time.

List available tasks:

```bash
task --list
```

| Task | Description |
| --- | --- |
| `task install` | `npm install` + `npx playwright install --with-deps` |
| `task test` | Run all Playwright tests |
| `task test-headed` | Run tests with a visible browser |
| `task test-ui` | Open Playwright UI mode |
| `task test-debug` | Run in step-through debug mode |
| `task report` | Open the last HTML report |

Examples:

```bash
# Use the env-a profile (loads ../profiles/env-a.env)
PROFILE=env-a task test

# Pass extra arguments to playwright via `--`
PROFILE=env-a task test -- tests/logo.spec.ts
PROFILE=env-b task test -- -g "logo"

# UI mode against the env-b profile
PROFILE=env-b task test-ui
```

The profile file takes precedence over `e2e/.env`. Variables not defined in the
profile fall back to `e2e/.env`. Running `task test` without `PROFILE` uses
`e2e/.env` only.

## Test Catalog

### GUI tests (browser-driven)

| Spec | Test Title | What it verifies |
| --- | --- | --- |
| `tests/auth.setup.ts` | authenticate | Login + TOTP MFA flow with `.env` credentials leaves the user on a non-login URL; the resulting session is saved and reused by the authenticated tests below |
| `tests/logo.spec.ts` | logo is rendered in light/dark mode | The header logo is visible and has `naturalWidth > 0` in both light and dark color schemes |
| `tests/smoke.spec.ts` | base URL is reachable | The frontend at `E2E_BASE_URL` returns a 2xx response on `/` |
| `tests/authenticated/device-list.spec.ts` | device list shows qulacs after opening the devices page | After login, the `デバイス` page shows a `qulacs` row within 60s |

### API tests (HTTP-driven)

| Spec | Test Title | What it verifies |
| --- | --- | --- |
| `tests/device-list-api.spec.ts` | GET /devices returns a non-empty device list | The User-API `/devices` endpoint returns 200 with a non-empty array whose first item has `device_info` (auth via `Q_API_TOKEN`) |

## Environment Variables

Defined in `e2e/.env` (never commit this file; it is excluded via `.gitignore`).

| Variable | Purpose |
| --- | --- |
| `E2E_BASE_URL` | Base URL of the frontend under test |
| `E2E_EMAIL` | Test user email for login |
| `E2E_PASSWORD` | Test user password |
| `E2E_TOTP_SECRET` | TOTP secret used to generate the MFA code at login |

In CI, values are provided via GitHub Actions Secrets instead of `.env`.

## Directory Layout

```
e2e/
├── README.md             # this file
├── Taskfile.yml          # task runner entrypoint (loads ../profiles/*.env)
├── .env                  # local only (not tracked)
├── tests/                # test specs (*.spec.ts)
│   ├── auth.setup.ts     # logs in once, saves the session for reuse
│   └── authenticated/    # specs that require login (gated on auth.setup.ts)
├── helpers/              # shared utilities (login, storage, etc.)
├── playwright.config.ts  # Playwright configuration
├── playwright-report/    # HTML report output (not tracked)
└── test-results/         # failure traces / screenshots (not tracked)
```

## Artifacts

- `playwright-report/`, `test-results/`, and `node_modules/` are excluded in the repository-root `.gitignore`.
- Failure traces are written to `test-results/`. View them with `npx playwright show-trace test-results/.../trace.zip`.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install` |
| Test stalls on the login screen | Verify `.env` values; for MFA flows, provide the TOTP secret |
| Passes locally but fails in CI | Check missing Secrets, or clock drift (when TOTP is used) |

## Notes

- **Do not put production credentials in `e2e/.env` or Secrets.** Use dedicated test accounts only.
- Never commit TOTP seeds or other secrets. The repository runs [`gitleaks`](../.github/workflows/gitleaks.yml) in CI to catch accidental commits.
