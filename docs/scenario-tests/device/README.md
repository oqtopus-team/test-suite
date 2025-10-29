# Scenario Test: Get Device Information

## Overview

This test suite verifies that the API for retrieving device information functions correctly. The target endpoint is `/devices`.

The purpose of this test is to ensure that information about devices registered in the system can be retrieved as expected.

---

## Prerequisites to pass the test

- Number of qubits: 4 or more

## Target API Endpoints

This suite covers the following API endpoint:

*   **`GET /devices`**

---

## Test Scenario

Each test follows this flow:

1.  Call **`GET /devices`** to retrieve the list of devices.
2.  Verify that the response status code is `200` and that the number of returned devices matches the expected value.

---

## Test Cases

| # | Description | Expected Result | Implemented | memo |
|---|---|---|---|---|
| 1 | Retrieve the list of all devices | `succeeded` | ✅ | |
