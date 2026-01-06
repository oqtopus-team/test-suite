# Scenario Test: Custom Job Execution Succeeded Cases

## Overview

This test suite **verifies that custom quantum jobs complete with a `succeeded` status**, focusing on scenarios that involve valid **custom gate definitions** and executions.

The goal is to ensure that the system correctly handles user-defined gates and complex OpenQASM 3 constructs under normal operating conditions.

---

## Target Job Types

This suite covers the following Job Types:

* **`sampling`**

---

## Parameter Combinations

This test suite aims for **coverage** of the following parameter combinations.

* **Transpiler**: `qiskit`
* **Mitigation**: `off` (default)
* **Expected Result**: `succeeded`

---

## Test Scenario

Each test follows this flow:

1. Submit a job via **`POST /jobs`** with the specified **custom OpenQASM 3 program**.
2. Verify that the response contains a valid job ID.
3. Poll the job status using **`GET /jobs/{job_id}`** every 5 seconds.
4. Confirm that the job status becomes **`succeeded`**.
5. Verify that the returned Job information matches the expected output (e.g., correct transpiler used).

---

## Test Matrix

| # | Transpiler | Mitigation | Expected | Implemented | memo |
|---|---|---|---|---|---|
| 1 | qiskit | off | succeeded | ✅ | Custom gate definition |
