# Benchmark Tests (Playwright)

HTTP-driven benchmark of the target device's error rate, implemented with
[Playwright](https://playwright.dev/) and TypeScript.

This is a Playwright port of the error-rate measurement that
`scenario-tests/setup/runn/device-error-rate-check.yml` performs with runn. It
queries the User-API for the device calibration data, computes the average
2-qubit gate error rate, and fails when it exceeds a threshold.

## What it measures

The benchmark reads `device_info.calibration_data.two_qubit_gates` from the
device response and computes the arithmetic mean of every `gate_error_value`.

Those `gate_error_value`s are **average gate errors measured on the real device
by interleaved randomized benchmarking (IRB)** of the two-qubit gate — i.e.
`(d-1)/d * (1 - p_irb/p_rb)` with `d = 4`, not a Clifford-averaged number. A
high average therefore means the device is too noisy to yield meaningful
results, which is why it is used as a health gate.

## Prerequisites

- Node.js 20 or later (LTS recommended)
- npm (bundled with Node.js)
- [Task](https://taskfile.dev/) (optional, for the `task` commands below)

## Quick Start

```bash
cd benchmark-tests

# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.org .env
$EDITOR .env    # set USER_API_ENDPOINT / Q_API_TOKEN / DEVICE_ID

# 3. Run the benchmark
npx playwright test

# 4. Open the HTML report
npx playwright show-report
```

## Running via Task (with profiles)

[`Taskfile.yml`](./Taskfile.yml) loads environment variables from
`../profiles/<PROFILE>.env` (shared with `scenario-tests` and `e2e`) before
falling back to `benchmark-tests/.env`. This lets you switch between target
environments without editing `.env`.

| Task | Description |
| --- | --- |
| `task install` | `npm install` + `npx playwright install --with-deps` |
| `task test` | Run all benchmark tests |
| `task report` | Open the last HTML report |

Examples:

```bash
# Use the env-a profile (loads ../profiles/env-a.env)
PROFILE=env-a task test

# Pass extra args to Playwright via `--`
PROFILE=env-a task test -- -g "error rate"
```

## Environment Variables

Environment variables hold only environment-specific / secret values (endpoint,
token, target device). Benchmark **thresholds** are kept out of `.env` — see
[Thresholds](#thresholds) below.

| Variable | Purpose | Default |
| --- | --- | --- |
| `USER_API_ENDPOINT` | User-API base URL | (required) |
| `Q_API_TOKEN` | API token sent as the `q-api-token` header | (required) |
| `DEVICE_ID` | Target device id | `qulacs` |

`USER_API_ENDPOINT` / `Q_API_TOKEN` fall back to `E2E_API_BASE_URL` /
`E2E_API_TOKEN` when unset, matching the `e2e` API specs. The test is skipped
when no API base URL is configured. A device with no calibration data is
treated as a pass, consistent with the scenario-tests gate.

## Thresholds

Benchmark thresholds live in [`thresholds.toml`](./thresholds.toml), a tracked
file (unlike `.env`) so changes are reviewed and versioned. As more benchmarks
are added, add their thresholds here rather than introducing new env vars.

```toml
[error_rate]
# Averaged 2-qubit gate error rate above which the benchmark fails.
max_2q_gate_error = 0.4
```

The loader (`helpers/config.ts`) falls back to built-in defaults when the file
or a key is missing, so a partial config still runs.

## Directory Layout

```
benchmark-tests/
├── README.md               # this file
├── Taskfile.yml            # task runner (loads ../profiles/*.env)
├── .env.org                # env template (copy to .env)
├── thresholds.toml         # benchmark thresholds (tracked)
├── package.json
├── playwright.config.ts
├── helpers/
│   ├── config.ts           # loads thresholds.toml
│   └── error-rate.ts       # device_info parsing + average error computation
└── tests/
    └── device-error-rate.spec.ts
```
