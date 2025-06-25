# Scenario Tests

## Overview

This directory contains scenario tests for Oqtopus system job execution using the [runn](https://github.com/k1LoW/runn) testing framework. The tests verify that quantum jobs complete with expected statuses (`succeeded` or `failed`) across various job configurations and parameter combinations.

## Prerequisites

Before running the tests, ensure you have the following:

- [runn](https://github.com/k1LoW/runn) installed
- [Task](https://taskfile.dev/) installed (for running Taskfile.yml commands)
- A `.env` file in the scenario-tests directory with required environment variables


## Environment Variables

Create a `.env` file in the scenario-tests directory with the following variables:

```bash
# API Configuration
USER_API_ENDPOINT=<your-api-endpoint>
Q_API_TOKEN=<your-api-token>
```

USER_API_ENDPOINT should point to your Oqtopus Cloud User-API endpoint, and Q_API_TOKEN should be your authentication token for accessing the API.

**Note**: The `.env` file should not be committed to version control as it contains sensitive information.


## Project Structure

```
scenario-tests/
├── Taskfile.yml           # Task runner configuration
├── .env                   # Environment variables (not tracked in git)
├── include/
│   └── post.yml          # Common test steps for job submission and polling
├── estimation-job/       # Estimation job type tests
│   ├── README.md
│   └── runn/
├── mp-job/              # MP job type tests (under construction)
│   ├── README.md
│   └── runn/
├── sampling-job/        # Sampling job type tests
│   ├── README.md
│   └── runn/
├── sse-job/             # SSE job type tests (under construction)
│   ├── README.md
│   └── runn/
└── validation/          # Validation tests (under construction)
    ├── README.md
    └── runn/
```

## Usage

### Available Commands

The following commands are available via the Taskfile.yml:

#### List Available Tests
```bash
task runn-list
```
Lists all available runn test files with their descriptions.

#### Run Specific Test by ID
```bash
task runn-id -- <test-id>
```
Runs a specific test identified by its ID. Replace `<test-id>` with the actual test identifier which can be found in the output of `task runn-list`.

Example:
```bash
task runn-id -- 8f57278
```

#### Run All Tests Sequentially
```bash
task runn-all
```
Executes all tests in sequence, one after another. This is safer but takes longer.

#### Run All Tests Concurrently
```bash
task runn-all-con
```
Executes all tests concurrently with a maximum of 8 parallel processes. This is faster but may put more load on the target system.

## Test Categories

### Sampling Job Tests
Located in `sampling-job/`, these tests verify sampling job execution across various parameter combinations including:
- Different transpilers (qiskit, no transpiler, default transpiler)
- Different backends (simulator, QPU real/mock, simulator mock)
- Various qubit counts (4, 16)
- Mitigation settings (on/off)

### Estimation Job Tests
Located in `estimation-job/`, these tests verify estimation job execution with similar parameter combinations as sampling jobs.

### Other Job Types
- **MP Job Tests** (`mp-job/`): Under construction
- **SSE Job Tests** (`sse-job/`): Under construction
- **Validation Tests** (`validation/`): Under construction
