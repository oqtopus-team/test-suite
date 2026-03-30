# Development Flow

This guide lists the typical workflow for developing and maintaining the OQTOPUS Test Suite.

## 1. Branching Strategy

Follow standard Git flow conventions for repository branching:

- `main`: The default branch for the latest stable release.
- `develop`: The active development branch.
- Feature branches (e.g., `feature/add-new-test`, `fix/update-test-case`): Branch off of `develop` to add new test scenarios or implement bug fixes.

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

## 2. Writing and Modifying Tests

Testing files are written in YAML format with the properties expected by [runn](https://github.com/k1LoW/runn).

To add a new scenario test:

1. Navigate to the `scenario-tests/` directory.
2. Determine the correct job category (e.g., `sampling-job`, `estimation-job`, `mp-job`, `sse-job`).
3. Add or modify the `.yml` files in the corresponding `runn/` subdirectory.

See [Adding New Tests](adding_new_tests.md) for more detailed instructions on creating tests.

## 3. Running Tests Locally

Before submitting your changes, verify that the tests are working locally.

```bash
cd scenario-tests
```

List all available tests:

```bash
task runn-list
```

Run a specific test to verify execution (replace `<test-id>` with the desired ID):

```bash
task runn-id -- <test-id>
```

Run all tests if you modified shared includes:

```bash
task runn-all
```

## 4. Committing Changes

After confirming your tests pass against your local or dedicated testing environment, stage and commit your changes.

```bash
git add .
# We recommend using the provided `gcommit` prompt or conventional commits
git commit -m "feat(scenario-tests): add new edge case test for sampling job"
```

## 5. Submitting a Pull Request

Push your feature branch and create a Pull Request against the `develop` branch.
Wait for CI/CD checks to complete, and request review from the maintainers. Once approved, the changes will be merged into `develop`.
