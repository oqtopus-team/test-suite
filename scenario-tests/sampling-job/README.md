# Scenario Test: Sampling Job Execution Succeeded/Failed Cases

## Overview

This test suite **verifies that quantum jobs complete with a `succeeded` or `failed` status** across various basic job configurations. It focuses on the **`sampling` job type** and covers common parameter combinations.

The goal is to ensure that supported and stable job executions behave as expected under normal operating conditions.

---

## Target Job Types

This suite covers the following Job Types:

* **`sampling`**

---

## Parameter Combinations

This test suite aims for **n-wise coverage** of the following parameter combinations.

* **Transpiler**: `qiskit`, `no transpiler`, `default transpiler`
* **Mitigation**: `on`, `off`
* **Expected Result**: `succeeded`, `failed`

---

## Limitations

The following constraints currently apply to this test suite:

* **Handling of `default transpiler`**: Since `default transpiler` refers to the same underlying transpiler as `qiskit`, its test cases will overlap with `qiskit`. Therefore, one test case will be used to confirm that `default transpiler` yields the same results as `qiskit`.

---

## Test Scenario

Each test follows this flow:

1.  Register a job via **`POST /jobs`** and verify that the response contains a valid job ID and presigned upload URL.
2.  Upload the scenario payload as **`input.zip`** to the returned presigned URL.
3.  Submit the job via **`POST /jobs/{job_id}/submit`** with the specified parameters.
4.  Poll the job status using **`GET /jobs/{job_id}`** every 5 seconds.
5.  Confirm that the job status becomes either **`succeeded` or `failed`**.
6.  Verify that the returned Job metadata matches the expected output.

---

## Test Matrix

| # | Transpiler | Mitigation | Expected | Implemented | memo |
|---|---|---|---|---|---|
| 1 | qiskit | off | succeeded | ✅ | |
| 2 | qiskit | on | succeeded | ✅ | |
| 3 | qiskit | off | failed | ✅ | Invaid QASM |
| 4 | qiskit | on | failed | | |
| 5 | no transpiler | off | succeeded | ✅ | |
| 6 | no transpiler | on | succeeded | ✅ | |
| 7 | no transpiler | off | failed | | |
| 8 | no transpiler | on | failed | | |
| 9 | default transpiler | off | succeeded | ✅ | |
| 10 | custom transpiler | off | succeeded | ✅ | |
