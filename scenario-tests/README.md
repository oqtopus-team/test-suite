# Scenario Test Suite

This directory contains scenario tests for OQTOPUS system job execution using the [runn](https://github.com/k1LoW/runn) testing framework. The tests verify that quantum jobs complete with expected statuses (`succeeded` or `failed`) across various job configurations and parameter combinations.

These tests are executed against the OQTOPUS Cloud API from the outside, making them black-box integration tests. They do not involve UI operations and are distinct from E2E tests. Prerequisites for each test scenario (such as topology and gate set) are described in the `README.md` within each category folder.

![Scenario Tests](./asset/scenario-tests.png)

## Prerequisites

Before running the tests, ensure you have the following:

- [runn](https://github.com/k1LoW/runn) installed
- [Task](https://taskfile.dev/) installed (for running Taskfile.yml commands)
- Environment variables configured (see [Environment Variables](#environment-variables))

## Environment Variables

### Using `.env`

Create a `.env` file in the `scenario-tests` directory:

```bash
USER_API_ENDPOINT="<your-api-endpoint>"
Q_API_TOKEN="<your-api-token>"
DEVICE_ID="<your-device-id>"
```

- `USER_API_ENDPOINT`: The full URL to your OQTOPUS Cloud User-API endpoint (e.g., `https://api.example.com`).
- `Q_API_TOKEN`: Your authentication token for the API.
- `DEVICE_ID`: The target device identifier (e.g., `qulacs`).

> **Note**: The `.env` file should not be committed to version control as it contains sensitive information.

### Using Profiles

Profiles let you switch between multiple environments (e.g., staging, production) without modifying `.env`.

Create a file under `profiles/<profile-name>.env` (see `profiles/example.env` as a reference), then specify the profile when running a task:

```bash
PROFILE=<profile-name> task runn-all
```

The profile file takes precedence over `.env`. Variables not defined in the profile fall back to `.env`.

## Project Structure

```text
scenario-tests/
├── Taskfile.yml           # Task runner configuration
├── .env                   # Environment variables (not tracked in git)
├── profiles/              # Environment profiles
│   └── example.env        # Reference profile template
├── include/
│   └── post.yml          # Common test steps for job register/upload/submit and polling
├── payloads/             # ZIP payloads uploaded to presigned input URLs
├── estimation-job/       # Estimation job type tests
│   ├── README.md
│   └── runn/
├── mp-job/                # Multi-Programming job type tests
│   ├── README.md
│   └── runn/
├── sampling-job/          # Sampling job type tests
│   ├── README.md
│   └── runn/
└── sse-job/               # SSE job type tests
    ├── README.md
    └── runn/
```

## Usage

### Available Commands

#### List Available Tests

```bash
task runn-list
```

Lists all available runn test files with their descriptions.

#### Run Specific Test by ID

```bash
task runn-id -- <test-id>
```

Runs a specific test by its ID. The ID can be found in the output of `task runn-list`.

Example:

```bash
task runn-id -- 8f57278
```

#### Run All Tests Sequentially

```bash
task runn-all
```

Executes all tests in sequence. This is safer but takes longer.

#### Run All Tests Concurrently

```bash
task runn-all-con
```

Executes all tests concurrently with a maximum of 8 parallel processes. This is faster but may put more load on the target system.

## Test Categories

- [Setup](./setup/README.md): Prepares device/qubit state before running scenario tests.
- [Estimation Job](./estimation-job/README.md): Verifies estimation job execution across various parameter combinations.
- [Multi-Programming (MP) Job](./mp-job/README.md): Verifies MP job execution.
- [Sampling Job](./sampling-job/README.md): Verifies sampling job execution with different transpilers (qiskit, no transpiler, default transpiler) and mitigation settings (on/off).
- [SSE Job](./sse-job/README.md): Verifies SSE job execution.

## Current User API Flow

Current job scenarios follow the User API register/upload/submit flow:

1. `POST /jobs` to register a job and receive `job_id` plus `presigned_url`
2. Upload `input.zip` to the returned presigned URL
3. `POST /jobs/{job_id}/submit` with metadata such as `device_id`, `job_type`, and `transpiler_info`
4. Poll `GET /jobs/{job_id}` until the job reaches a terminal status
