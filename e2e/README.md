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
npx playwright test tests/login.spec.ts
npx playwright test -g "login"   # filter by title substring
```

## Environment Variables

Defined in `e2e/.env` (never commit this file; it is excluded via `.gitignore`).

| Variable | Purpose |
| --- | --- |
| `E2E_BASE_URL` | Base URL of the frontend under test |
| `E2E_EMAIL` | Test user email for login |
| `E2E_PASSWORD` | Test user password |

In CI, values are provided via GitHub Actions Secrets instead of `.env`.

## Directory Layout

```
e2e/
├── README.md             # this file
├── .env                  # local only (not tracked)
├── tests/                # test specs (*.spec.ts)
├── helpers/              # shared utilities (login, etc.)
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
