# Benchmark Tests (Playwright)

HTTP-driven benchmarks of the target device's calibration quality, implemented
with [Playwright](https://playwright.dev/) and TypeScript. They query the
User-API for the device calibration data and compare it against the thresholds
in [`thresholds.toml`](./thresholds.toml); no quantum circuits are executed.

| Spec | Checks |
| --- | --- |
| `device-error-rate.spec.ts` | Average 2-qubit gate error rate (see [What it measures](#what-it-measures)) |
| `device-threshold.spec.ts` | Layer-1 threshold checks (see [Layer-1 threshold checks](#layer-1-threshold-checks)) |

The average error-rate benchmark is a separate gate from the
`check_error_rate` step of `scenario-tests/setup/runn/setup.yml`, and the two
do not enforce equivalent criteria: the scenario-tests gate takes the **maximum** over 1-qubit, readout
and 2-qubit errors and fails when it **reaches** the threshold, whereas this
benchmark takes the **average** of the 2-qubit gate errors only and fails only
when it **exceeds** the threshold.

## What it measures

The benchmark reads `device_info.calibration_data.two_qubit_gates` from the
device response and computes the arithmetic mean of every `gate_error_value`.

Those `gate_error_value`s are **average gate errors measured on the real device
by interleaved randomized benchmarking (IRB)** of the two-qubit gate — i.e.
`(d-1)/d * (1 - p_irb/p_rb)` with `d = 4`, not a Clifford-averaged number. A
high average therefore means the device is too noisy to yield meaningful
results, which is why it is used as a health gate.

## Layer-1 threshold checks

Layer 1 covers static checks of the calibration data the device reports: no
circuit is executed, each value is read from `device_info` and compared with a
threshold. `device-threshold.spec.ts` reads `device_info` from `GET /devices/{DEVICE_ID}`
and checks each value against the `[threshold]` section of `thresholds.toml`:

| Test | Value | Default threshold |
| --- | --- | --- |
| max 1Q gate error | `max(1 − qubits[].fidelity)` | 0.1 |
| max 2Q gate error | `max(1 − couplings[].fidelity)` | 0.5 |
| max readout error | `max(qubits[].meas_error.readout_assignment_error)` | 0.3 |
| calibration freshness | hours since `calibrated_at` | 24 |

- `device_info` may be inline JSON or an HTTP(S)/`file://` URL to JSON or to a
  ZIP containing `device_info.json`, as in the scenario-tests setup. Retrieval
  or decoding errors, a value that is not a JSON object, a non-numeric or
  out-of-range fidelity / readout error (outside [0, 1]), an unparseable
  `calibrated_at`, and a `calibrated_at` more than 5 minutes in the future
  (the tolerance for clock skew) fail the test.
- Missing calibration data is treated as a pass.
- Calibration freshness is skipped for `device_type: simulator`, whose
  `calibrated_at` is static.
- Results are written per test to `results/threshold/` and aggregated into
  `results/threshold.json` after the run (the final retry wins).

## Layer-2 Bell pair fidelity

`bell-fidelity.spec.ts` prepares the Bell state |Φ+⟩ (H → CX) on a qubit pair,
measures it in the Z basis and reports fidelity = P(00) + P(11) (the
probability of correlated outcomes; it does not see the relative phase, so
|Φ−⟩ would also score 1). It is opt-in:
it runs only with `RUN_BELL_FIDELITY=true`, which CI sets when
`tests/bell-fidelity.spec.ts` is passed via the `benchmark-test.yml`
`test_files` input. Results go to `results/bell-fidelity.json`,
`results/bell-fidelity-summary.md` (appended to the Job Summary) and
`results/bell-qubit-map.svg`.

The pair is chosen in one of two ways, set by `BELL_QUBIT_PAIRS`. The log and
the Job Summary show which one was used as `Pair selection: auto` or
`Pair selection: manual (<pairs>)`.

| Pair selection | `BELL_QUBIT_PAIRS` | Behavior |
| --- | --- | --- |
| auto | `auto` | Picks the single coupling in `device_info.couplings` with the highest calibrated 2Q fidelity and measures it in physical mode (`BELL_QUBIT_MODE` is ignored). |
| manual | `control-target` pairs, comma-separated (e.g. `0-1` or `0-1,2-3`) | Measures the listed pairs in `BELL_QUBIT_MODE` (`physical` by default, or `logical`). |

Manual pairs are checked before any job is submitted, and a failed check fails
the run (it is not a skip):

- Every entry must be `<int>-<int>`, and control and target must differ.
- In physical mode, every pair must be a coupling in `device_info.couplings`.
  Couplings are **directed**: `2-1` passes only when a coupling with control 2
  and target 1 exists, and `1-2` is rejected, because physical mode sends
  `cx control, target` to the hardware without a transpiler. The failure
  message and the Job Summary list the available pairs.
- Devices whose `device_info` has no couplings (e.g. `qulacs`) skip the
  coupling check, and so does logical mode, where the transpiler places the
  qubits.

In physical mode the circuit uses native gates only (H is emitted as
`rz(pi/2); sx; rz(pi/2)`) since no transpiler runs.

The device is read from `GET /devices/{DEVICE_ID}` before any job is submitted:

- A failed request (any non-2xx status) fails the run. So does an unreadable
  `device_info` (download or decode error) when it is needed — for `auto`, and
  for manual pairs in physical mode, where it guards the untranspiled CX.
- A device that was read but cannot run the measurement is a skip: no coupling
  with a calibrated fidelity for `auto`, or a requested qubit that the device
  does not have. Physical qubits are checked against the ids in
  `device_info.qubits` (falling back to `0..n_qubits-1` only when the device
  reports no qubits); logical pairs only need to fit within `n_qubits`.

Each measured pair is saved to `results/bell/` and global teardown merges them
into the outputs above, so a worker restart after a failing pair does not drop
earlier pairs.

| Variable | Purpose | Default |
| --- | --- | --- |
| `BELL_QUBIT_PAIRS` | `auto`, or manual `control-target` pairs | (unset: the spec is skipped) |
| `BELL_QUBIT_MODE` | `physical` or `logical` (manual only) | `physical` |
| `BELL_SHOTS` | Shots per measurement | `1000` |

## Prerequisites

- Node.js 20 or later (LTS recommended)
- npm (bundled with Node.js)
- `unzip` on `PATH` (only needed when `device_info` is a URL to a ZIP; e.g.
  `apt-get install unzip`, preinstalled on GitHub-hosted runners and macOS)
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

# The Bell pair fidelity benchmark is opt-in (it is skipped by default)
RUN_BELL_FIDELITY=true npx playwright test tests/bell-fidelity.spec.ts

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
| `task chart` | Render the measured-vs-threshold chart from the last run |
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
| `Q_API_TOKEN` | API token sent as the `q-api-token` and `Authorization` headers | (optional; empty for APIs without auth) |
| `DEVICE_ID` | Target device id | `qulacs` |

`USER_API_ENDPOINT` / `Q_API_TOKEN` fall back to `E2E_API_BASE_URL` /
`E2E_API_TOKEN` when unset or empty, matching the `e2e` API specs. Both specs
are skipped when no API base URL is configured; an empty token is still sent, so
APIs without auth are covered. A device with no calibration data is treated as
a pass, consistent with the scenario-tests gate; malformed calibration data
fails the Layer-1 checks (see [Layer-1 threshold checks](#layer-1-threshold-checks)).

## Thresholds

Benchmark thresholds live in [`thresholds.toml`](./thresholds.toml), a tracked
file (unlike `.env`) so changes are reviewed and versioned. As more benchmarks
are added, add their thresholds here rather than introducing new env vars.

```toml
[error_rate]
# Averaged 2-qubit gate error rate above which the benchmark fails.
max_2q_gate_error = 0.4

[threshold]
# Layer-1 threshold checks (see above).
max_1q_gate_error = 0.1
max_2q_gate_error = 0.5
max_readout_error = 0.3
max_calibration_age_hours = 24
```

The loader (`helpers/config.ts`) falls back to built-in defaults when the file
or a key is missing, so a partial config still runs.

## Directory Layout

```text
benchmark-tests/
├── README.md               # this file
├── Taskfile.yml            # task runner (loads ../profiles/*.env)
├── .env.org                # env template (copy to .env)
├── thresholds.toml         # benchmark thresholds (tracked)
├── package.json
├── playwright.config.ts
├── scripts/
│   └── render-chart.mjs    # measured-vs-threshold chart (`task chart`)
├── global-setup.ts         # clears stale threshold results
├── global-teardown.ts      # aggregates results/threshold.json
├── helpers/
│   ├── config.ts           # loads thresholds.toml
│   ├── device-info.ts      # device_info resolution (JSON / URL / ZIP) + Layer-1 metrics
│   ├── error-rate.ts       # device_info parsing + average error computation
│   └── threshold-results.ts # per-test threshold result persistence
├── tests/
│   ├── device-error-rate.spec.ts
│   └── device-threshold.spec.ts
└── results/                # run outputs (git-ignored)
    ├── error-rate.json     # average 2Q error-rate measurement
    ├── error-rate-chart.svg
    └── threshold.json      # aggregated Layer-1 threshold results
```
