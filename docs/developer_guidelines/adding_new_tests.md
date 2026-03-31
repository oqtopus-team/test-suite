# Adding New Tests

This guide provides instructions on how to add new testing scenarios to the codebase.

## Overview of Test Types

The test suite is functionally categorized into two general groups:

- **Scenario Tests** (`scenario-tests/`): Verify the end-to-end API behaviour logic for specific job types (e.g., Estimation, Sampling, Device).
- **Endurance Tests** (`endurance-test/`): Long-term stability tests that continuously poll or send requests to verify the platform's reliability over extended periods.

## Adding a Scenario Test

1. **Locate the Job Category:**
   Identify the category your test falls under within the `scenario-tests/` directory:
   - `device/`
   - `estimation-job/`
   - `mp-job/`
   - `sampling-job/`
   - `sse-job/`

2. **Create the Test File:**
   Navigate into the appropriate category folder's `runn/` directory. Create a new YAML file. Use specific, descriptive names mapping the conditions being tested (e.g., `sampling-qiskit-transpiler-error.yml`).

3. **Writing the Test Definition:**
   Use the `runn` framework's syntax to define the API request scenario.
   - Every scenario should include a clear `desc` property indicating what the test verifies.
   - In most cases, you will need to authenticate and submit a job. We highly recommend using the existing logic in `include/post.yml` to trigger the backend API if applicable.
   - For variables, inject them natively utilizing the configuration available in `.env` (`{{ vars.USER_API_ENDPOINT }}`, `{{ vars.Q_API_TOKEN }}`).

Example test structure:

```yaml
desc: Example test submitting a job and verifying response
runners:
  req: {{ vars.USER_API_ENDPOINT }}
vars:
  job_type: sampling
steps:
  postJob:
    desc: Post the job via shared include
    include:
      path: ../../include/post.yml
      vars:
        job_type: '{{ vars.job_type }}'
        req_body: '{"name": "test-job", ...}'
  
  verifyCompletion:
    req:
      /jobs/{{ steps.postJob.job_id }}
      get:
        headers:
          Authorization: Bearer {{ vars.Q_API_TOKEN }}
    test: |
      current.res.status == 200
      && current.res.body.status == "succeeded"
```

## Adding an Endurance Test

1. Navigate to `endurance-test/`.
2. Determine if the new test requires an overarching modification to the Makefile/Taskfile, or simply the addition of a new Python script.
3. Add your logic keeping in mind constraints like robust logging, exception handling on network drops, and graceful exits for continuous looping processes.
4. Document the new test procedure under `endurance-test/README.md`.

## Verifying the Test

After authoring your test:

1. Load up specific variables in `.env` if changes imply new mocked secrets.
2. Run your specific test via `Task`:

   ```bash
   cd scenario-tests
   task runn-list # Find your test
   task runn-id -- <your-test-id>
   ```
