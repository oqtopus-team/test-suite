# Scenario Test: Sampling Job Execution Succeeded/Failed Cases

## Overview

This test suite **verifies that quantum jobs complete with a `succeeded` or `failed` status** across various basic job configurations. It focuses on the **`sampling` job type** and covers common parameter combinations.

The goal is to ensure that supported and stable job executions behave as expected under normal operating conditions.

---

## Prerequisites to pass the test

- Number of qubits: 4 or more

## Target Job Types

This suite covers the following Job Types:

* **`sampling`**

---

## Parameter Combinations

This test suite aims for **n-wise coverage** of the following parameter combinations.

* **Transpiler**: `qiskit`, `no transpiler`, `default transpiler`
* **Backend**: `simulator`, `QPU (real)` (in production environment only), `QPU (mock)` (in development environment only), `simulator (mock)` (for failed cases only)
* **Mitigation**: `on`, `off`
* **Expected Result**: `succeeded`, `failed`

---

## Limitations

The following constraints currently apply to this test suite:

* **Handling of `default transpiler`**: Since `default transpiler` refers to the same underlying transpiler as `qiskit`, its test cases will overlap with `qiskit`. Therefore, one test case will be used to confirm that `default transpiler` yields the same results as `qiskit`.

---

## Test Scenario

Each test follows this flow:

1.  Submit a job via **`POST /jobs`** with the specified parameters.
2.  Verify that the response contains a valid job ID.
3.  Poll the job status using **`GET /jobs/{job_id}`** every 5 seconds.
4.  Confirm that the job status becomes either **`succeeded` or `failed`**.
5.  Verify that the returned Job information matches the expected output.

---

## Test Matrix

| # | Transpiler | Backend | Mitigation | Expected | Implemented | memo |
|---|---|---|---|---|---|
| 1 | qiskit | simulator | off | succeeded | ✅ |
| 2 | qiskit | simulator | on | succeeded | ✅ |
| 3 | qiskit | QPU (real) | off | succeeded | |
| 4 | qiskit | QPU (real) | on | succeeded | |
| 5 | qiskit | QPU (mock) | off | failed | |
| 6 | qiskit | QPU (mock) | on | failed | |
| 7 | qiskit | simulator (mock) | off | failed | |
| 8 | qiskit | simulator (mock) | on | failed | |
| 9 | no transpiler | simulator | off | succeeded | ✅ |
| 10 | no transpiler | simulator | on | succeeded | ✅ |
| 11 | no transpiler | QPU (real) | off | succeeded | |
| 12 | no transpiler | QPU (real) | on | succeeded | |
| 13 | no transpiler | QPU (mock) | off | failed | |
| 14 | no transpiler | QPU (mock) | on | failed | |
| 15 | no transpiler | simulator (mock) | off | failed | |
| 16 | no transpiler | simulator (mock) | on | failed | |
| 17 | default transpiler | simulator | off | succeeded | ✅ |
| 18 | custom transpiler | simulator | off | succeeded | ✅ |
