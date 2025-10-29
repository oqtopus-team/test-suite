# Scenario Tests

| Docs         |                                                                        |
|--------------|------------------------------------------------------------------------|
| **CI**       | ![CI](https://github.com/oqtopus-project/test-suite/actions/workflows/ci.yaml/badge.svg) |

## Overview

This document outlines the scenario tests for the OQTOPUS quantum computing platform. These tests are designed to verify the end-to-end behavior of the system using the OQTOPUS Cloud API. The tests are written in YAML format and executed using the `runn` framework.

## Table of Contents

- [Scenario Tests](#scenario-tests)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Test Characteristics](#test-characteristics)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Project Structure](#project-structure)
  - [Usage](#usage)
  - [Available Test Scenarios](#available-test-scenarios)

## Test Characteristics

-   **Black-Box Testing**: Tests are executed from outside the OQTOPUS Cloud API, verifying API behavior without knowledge of the internal system workings.
-   **No UI Interaction**: Unlike E2E tests, these scenarios do not involve operations through a user interface.
-   **Prerequisites**: Each test scenario's prerequisites (e.g., topology, gate set) are detailed in the `README.md` within its respective directory.

![Scenario Tests](images/scenario-tests.svg)

## Prerequisites

Before running the tests, ensure you have the following installed:

-   [runn](https://github.com/k1LoW/runn)
-   [Task](https://taskfile.dev/) (for running commands from `Taskfile.yml`)

## Environment Variables

Create a `.env` file in the `scenario-tests` directory with the following variables:

```bash
# API Configuration
USER_API_ENDPOINT="<your-api-endpoint>"
Q_API_TOKEN="<your-api-token>"
```

-   `USER_API_ENDPOINT` should be the full URL of your OQTOPUS Cloud User-API endpoint (e.g., `https://...`).
-   `Q_API_TOKEN` should be your authentication token for the API.

**Note**: Do not commit the `.env` file to version control.

## Project Structure

```
scenario-tests/
├── Taskfile.yml
├── .env
├── include/
│   └── post.yml
├── estimation-job/
│   ├── README.md
│   └── runn/
├── mp-job/
│   ├── README.md
│   └── runn/
├── sampling-job/
│   ├── README.md
│   └── runn/
└── sse-job/
    ├── README.md
    └── runn/
```

## Usage

The following commands are available via `Taskfile.yml`:

-   **List Available Tests**:
    ```bash
    task runn-list
    ```
-   **Run a Specific Test by ID**:
    ```bash
    task runn-id -- <test-id>
    ```
-   **Run All Tests Sequentially**:
    ```bash
    task runn-all
    ```
-   **Run All Tests Concurrently**:
    ```bash
    task runn-all-con
    ```

## Available Test Scenarios

Below is a list of available test scenarios. For detailed information about each scenario, please refer to the `README.md` in the respective directory.

-   **[Estimation Job Tests](./estimation-job/README.md)**
-   **[Multi-Program Job Tests](./mp-job/README.md)**
-   **[Sampling Job Tests](./sampling-job/README.md)**
-   **[SSE Job Tests](./sse-job/README.md)**


```{toctree}
---
maxdepth: 1
caption: Job Types:
---
estimation-job/README.md
mp-job/README.md
sampling-job/README.md
sse-job/README.md
```

