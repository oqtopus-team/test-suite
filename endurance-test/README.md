# Endurance Test Suite

This document describes how to use the endurance test suite.

## Overview

The endurance test suite is designed to run a sampling job repeatedly to ensure the stability and reliability of the system over a long period. It uses `runn` to define and execute the test scenarios.

The main test script, `run_endurance_test.sh`, executes the `endr.yml` test scenario every 10 seconds.

## Prerequisites

- [runn](https://github.com/k1LoW/runn) installed
- [Task](https://taskfile.dev/) installed (for running Taskfile.yml commands)
- A `.env` file in the scenario-tests directory with required environment variables

## Test Structure

- **`run_endurance_test.sh`**: The main shell script that runs the test in a loop.
- **`Taskfile.yml`**: Defines tasks for starting, stopping, and checking the status of the endurance test.
- **`endr.yml`**: The main `runn`book that defines the endurance test. It includes `sampling-included.yml`.
- **`sampling-included.yml`**: A `runn`book that defines the steps for a sampling job test. It includes `include/post.yml`.
- **`include/post.yml`**: A `runn`book that handles job registration, payload upload, job submission, and waits for the job to complete.

## How to Use

### 1. Create `.env` file

Create a `.env` file in the root directory with the following content:

```bash
USER_API_ENDPOINT="<your-api-endpoint>"
Q_API_TOKEN="<your-api-token>"
DEVICE_ID=<your_device_id>
```

### 2. Start the endurance test

To start the test in the background, run the following command:

```bash
task start-endr
```

This will:

- Create a `results` directory if it doesn't exist.
- Start the `run_endurance_test.sh` script in the background using `nohup`.
- Redirect all output to a log file in the `results` directory (e.g., `results/endurance_test_2023_1027_1530_00.log`).
- Create a `endurance_test.pid` file containing the process ID of the test script.

### 3. Check the status

To check if the test is running, use:

```bash
task status-endr
```

This will show the process information if the test is active.

### 4. Stop the endurance test

To stop the test, run:

```bash
task stop-endr
```

This will kill the process and remove the `endurance_test.pid` file.

### 5. View logs

The logs are stored in the `results` directory. You can view the latest log file to see the test progress.

```bash
tail -f results/$(ls -t results | head -n1)
