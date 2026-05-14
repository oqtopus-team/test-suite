![OQTOPUS](docs/asset/oqtopus-logo.png)

# OQTOPUS Test Suite

This repository contains external testing tools for the OQTOPUS quantum computing platform.

## Contents

- **[scenario-tests/](scenario-tests/README.md)** - Scenario tests for quantum job execution using runn framework
- **[endurance-test/](endurance-test/README.md)** - Endurance tests for long-term stability of the OQTOPUS platform
- **[e2e/](e2e/README.md)** - Browser-based end-to-end tests for the OQTOPUS frontend using Playwright

## Developer Guidelines

- [Setup Development Environment](developer_guidelines/setup.md)
- [Development Flow](developer_guidelines/development_flow.md)
- [Adding New Tests](developer_guidelines/adding_new_tests.md)
- [How to Contribute](CONTRIBUTING.md)
- [Code of Conduct](https://github.com/oqtopus-team/.github/blob/main/CODE_OF_CONDUCT.md)
- [Security](https://github.com/oqtopus-team/.github/blob/main/SECURITY.md)

## Git Hooks (Secret Scanning)

This repository uses [Lefthook](https://github.com/evilmartians/lefthook) to run [gitleaks](https://github.com/gitleaks/gitleaks) before every commit, so accidentally staged secrets are blocked locally.

**One-time setup per clone:**

1. Install the `gitleaks` binary (used by the hook):
   - macOS: `brew install gitleaks`
   - Linux: see [gitleaks releases](https://github.com/gitleaks/gitleaks/releases)
   - Windows: `scoop install gitleaks`
2. Install JS tooling and activate the hooks:
   ```bash
   npm install
   ```
   `npm install` also runs `lefthook install` via the `prepare` script, registering the Git hooks automatically. No extra step is needed.

After setup, `git commit` will fail if gitleaks detects a secret in the staged diff. Fix the finding (or scope the allowlist in `.gitleaks.toml` if it is a false positive) and commit again.

> Note: `jj` does not invoke Git hooks. `jj` users rely on the CI-side gitleaks job as the safety net, or run `gitleaks detect --source . --redact --no-banner` manually before pushing.

## Quick Start

**1. Install dependencies**

- [Task](https://taskfile.dev/installation/) — task runner
- [runn](https://github.com/k1LoW/runn#install) — test framework

**2. Configure environment variables**

```bash
cd scenario-tests
cp profiles/example.env .env
# Edit .env and fill in your values:
#   USER_API_ENDPOINT, Q_API_TOKEN, DEVICE_ID
```

**3. Run all tests**

```bash
task runn-all
```

> Alternatively, use profiles to switch between environments without modifying `.env`:
> ```bash
> PROFILE=<profile-name> task runn-all
> ```

## Running E2E Tests

Browser-based end-to-end tests live under [`e2e/`](e2e/README.md) and are powered by [Playwright](https://playwright.dev/).

**1. Install dependencies (first time only)**

```bash
cd e2e
npm install
npx playwright install --with-deps
```

**2. Configure environment variables**

Create `e2e/.env` (excluded by `.gitignore`) and set the following values:

```
E2E_BASE_URL=https://<frontend-under-test>
E2E_EMAIL=<test-user-email>
E2E_PASSWORD=<test-user-password>
E2E_TOTP_SECRET=<totp-seed-for-mfa>
USER_API_ENDPOINT=https://<user-api>
Q_API_TOKEN=<q-api-token>
```

> Use a dedicated test account. Do not put production credentials in `.env` or CI Secrets.

**3. Run the tests**

```bash
cd e2e
npx playwright test                  # run all tests
npx playwright test --headed         # show the browser
npx playwright test --ui             # Playwright UI mode
npx playwright show-report           # open the last HTML report
```

See [`e2e/README.md`](e2e/README.md) for details on the directory layout, debugging, and troubleshooting.
