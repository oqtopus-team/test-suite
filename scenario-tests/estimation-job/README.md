# Scenario Test: Estimation Job Execution Succeeded/Failed Cases

## Overview

This test suite **verifies that quantum jobs complete with a `succeeded` or `failed` status** across various basic job configurations. It focuses on the **`estimation` job type** and covers common parameter combinations.

The goal is to ensure that supported and stable job executions behave as expected under normal operating conditions.

---

## Target Job Types

This suite covers the following Job Types:

* **`estimation`**

---

## Parameter Combinations

This test suite aims for **n-wise coverage** of the following parameter combinations.

* **Transpiler**: `qiskit`, `no transpiler`, `default transpiler`
* **Backend**: `simulator`, `QPU (real)` (in production environment only), `QPU (mock)` (in development environment only), `simulator (mock)` (for failed cases only)
* **Qubit Count**: `4 qubits`, `16 qubits`
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

| # | Transpiler | Backend | Qubits | Mitigation | Expected | Implemented in Dev | Implemented in Prod |
|---|---|---|---|---|---|---|---|
| 1 | qiskit | simulator | 4 | off | succeeded |  | |
| 2 | qiskit | simulator | 4 | on | succeeded |  | |
| 3 | qiskit | simulator | 16 | off | succeeded | ✅ | |
| 4 | qiskit | simulator | 16 | on | succeeded | | |
| 5 | qiskit | QPU (real) | 4 | off | succeeded | | |
| 6 | qiskit | QPU (real) | 4 | on | succeeded | | |
| 7 | qiskit | QPU (real) | 16 | off | succeeded | | |
| 8 | qiskit | QPU (real) | 16 | on | succeeded | | |
| 9 | qiskit | QPU (mock) | 4 | off | failed | | |
| 10 | qiskit | QPU (mock) | 4 | on | failed | | |
| 11 | qiskit | QPU (mock) | 16 | off | failed | | |
| 12 | qiskit | QPU (mock) | 16 | on | failed | | |
| 13 | qiskit | simulator (mock) | 4 | off | failed | | |
| 14 | qiskit | simulator (mock) | 4 | on | failed | | |
| 15 | qiskit | simulator (mock) | 16 | off | failed | | |
| 16 | qiskit | simulator (mock) | 16 | on | failed | | |
| 17 | no transpiler | simulator | 4 | off | succeeded |  | |
| 18 | no transpiler | simulator | 4 | on | succeeded |  | |
| 19 | no transpiler | simulator | 16 | off | succeeded | | |
| 20 | no transpiler | simulator | 16 | on | succeeded | | |
| 21 | no transpiler | QPU (real) | 4 | off | succeeded | | |
| 22 | no transpiler | QPU (real) | 4 | on | succeeded | | |
| 23 | no transpiler | QPU (real) | 16 | off | succeeded | | |
| 24 | no transpiler | QPU (real) | 16 | on | succeeded | | |
| 25 | no transpiler | QPU (mock) | 4 | off | failed | | |
| 26 | no transpiler | QPU (mock) | 4 | on | failed | | |
| 27 | no transpiler | QPU (mock) | 16 | off | failed | | |
| 28 | no transpiler | QPU (mock) | 16 | on | failed | | |
| 29 | no transpiler | simulator (mock) | 4 | off | failed | | |
| 30 | no transpiler | simulator (mock) | 4 | on | failed | | |
| 31 | no transpiler | simulator (mock) | 16 | off | failed | | |
| 32 | no transpiler | simulator (mock) | 16 | on | failed | | |
| 33 | default transpiler | simulator | 4 | off | succeeded | | |
