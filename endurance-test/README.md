# Endurance Test Suite

This directory contains an endurance test for the OQTOPUS Cloud API. The test repeatedly submits a sampling job at a fixed interval over a long period to verify the long-term stability and reliability of the system.

These tests are executed against the OQTOPUS Cloud API from the outside, making them black-box integration tests. They do not involve UI operations and are distinct from E2E tests. Like the [scenario tests](../scenario-tests/README.md), they use the [runn](https://github.com/k1LoW/runn) testing framework to define and execute scenarios.

The main script `run_endurance_test.sh` runs the `endr.yml` runnbook every 10 seconds and writes results to a log file under `results/`.

## Prerequisites

Before running the tests, ensure you have the following:

- [runn](https://github.com/k1LoW/runn) installed
- [Task](https://taskfile.dev/) installed (for running Taskfile.yml commands)
- A `.env` file with required environment variables (see [Environment Variables](#environment-variables))

## Environment Variables

Create a `.env` file in this directory:

```bash
USER_API_ENDPOINT="<your-api-endpoint>"
Q_API_TOKEN="<your-api-token>"
DEVICE_ID="<your-device-id>"
```

- `USER_API_ENDPOINT`: The full URL to your OQTOPUS Cloud User-API endpoint (e.g., `https://api.example.com`).
- `Q_API_TOKEN`: Your authentication token for the API.
- `DEVICE_ID`: The target device identifier (e.g., `qulacs`).

> **Note**: The `.env` file should not be committed to version control as it contains sensitive information.

## Project Structure

```text
endurance-test/
├── Taskfile.yml             # Task runner configuration
├── .env                     # Environment variables (not tracked in git)
├── run_endurance_test.sh    # Main loop script (runs endr.yml every 10s)
├── endr.yml                 # Top-level runnbook for the endurance test
├── runn-included/
│   ├── sampling-included.yml   # Sampling job test steps
│   └── post.yml                # Job submission and polling
└── results/                 # Log files (created at runtime)
```

## Usage

### 1. Start the endurance test

Start the test in the background:

```bash
task start-endr
```

This will:

- Create a `results/` directory if it does not exist.
- Start `run_endurance_test.sh` in the background using `nohup`.
- Redirect all output to a log file under `results/` (e.g., `results/endurance_test_2026_0508_1530_00.log`).
- Create an `endurance_test.pid` file containing the PID of the test script.

### 2. Check the status

```bash
task status-endr
```

Shows the process information if the test is active.

### 3. Stop the endurance test

```bash
task stop-endr
```

Kills the process and removes the `endurance_test.pid` file.

### 4. View logs

Logs are stored in the `results/` directory. To follow the latest log file:

```bash
tail -f results/$(ls -t results | head -n1)
```
