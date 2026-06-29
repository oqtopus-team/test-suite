# Scenario Test: Get Device Information

## Overview

This test suite verifies that the API for retrieving device information functions correctly. The target endpoint is `/devices`.

The purpose of this test is to ensure that information about devices registered in the system can be retrieved as expected.

---

## Target API Endpoints

This suite covers the following API endpoint:

* **`GET /devices`**

---

## Test Scenario

Each test follows this flow:

1. Call **`GET /devices`** to retrieve the list of devices.
2. Verify that the response status code is `200` and that the number of returned devices matches the expected value.

---

## Test Cases

| # | Description | Expected Result | Implemented | memo |
|---|---|---|---|---|
| 1 | Retrieve the list of all devices | `succeeded` | ✅ | |
| 2 | Target device error rate is below threshold | `succeeded` | ✅ | health gate |

---

## Error Rate Gate

The `check_error_rate` step fails the setup (and therefore aborts all scenario
tests, since setup runs with `--fail-fast`) when **any** of the following error
rates is **greater than or equal to** the threshold:

| Error rate         | Source field (`device_info`)                   | Calculation    |
| ------------------ | ---------------------------------------------- | -------------- |
| 1-qubit gate error | `qubits[].fidelity`                            | `1 - fidelity` |
| Readout error      | `qubits[].meas_error.readout_assignment_error` | as-is          |
| 2-qubit gate error | `couplings[].fidelity`                         | `1 - fidelity` |

The step logs the measured error rate per category (and the overall max) so you
can see how close the device is to the threshold:

```text
measured error rates (threshold: 0.4):
  1-qubit gate error (max): 0.05
  readout error (max):      0.12
  2-qubit gate error (max): 0.2
  -> overall max:           0.2
```

The threshold defaults to `0.4` and can be overridden via the `ERROR_RATE_THRESHOLD`
environment variable:

```bash
ERROR_RATE_THRESHOLD=0.2 task runn-setup
```
