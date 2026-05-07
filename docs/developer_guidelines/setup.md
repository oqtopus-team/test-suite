# Setup Development Environment

This guide explains how to set up your local environment for developing and running tests in the OQTOPUS Test Suite.

## Prerequisites

Install the following tools before starting development.

| Tool | Version | Description | Install Guide |
| ---- | ------- | ----------- | ------------- |
| [runn](https://github.com/k1LoW/runn) | latest | Core testing framework for scenario tests | <https://github.com/k1LoW/runn#install> |
| [Task](https://taskfile.dev/) | latest | Task runner for simplifying test commands | <https://taskfile.dev/installation/> |
| [Python](https://www.python.org/) | >=3.12 | Required for documentation generation | <https://www.python.org/downloads/> |
| [uv](https://docs.astral.sh/uv/) | >=0.10 | Python package and project manager (for docs) | <https://docs.astral.sh/uv/getting-started/installation/> |

!!! note
    If you only intend to run the `runn` tests and not build the documentation, Python and uv are optional.

Clone the repository:

```shell
git clone https://github.com/oqtopus-team/test-suite.git
cd test-suite
```

## Project Structure

The repository is organized as follows:

```text
test-suite/
├─ scenario-tests/      # Scenario tests for quantum job execution
│  ├─ estimation-job/   # Estimation job tests
│  ├─ mp-job/           # Multi-programming job tests
│  ├─ sampling-job/     # Sampling job tests
│  ├─ sse-job/          # SSE job tests
│  ├─ setup/            # Setup tests
│  └─ runn-included/    # Shared test includes
├─ endurance-test/      # Endurance tests for long-term stability
├─ docs/                # Documentation sources (MkDocs)
├─ .github/             # GitHub workflows and repository settings
├─ mkdocs.yml           # MkDocs configuration
└─ README.md            # Project overview
```

## Environment Configuration

To run the tests against the OQTOPUS Cloud API, configure your environment variables.

### Using `.env`

1. Navigate to the `scenario-tests` directory:

   ```shell
   cd scenario-tests
   ```

2. Create a `.env` file based on the required variables:

   ```shell
   touch .env
   ```

3. Populate the `.env` file with your API credentials:

   ```shell
   # API Configuration
   USER_API_ENDPOINT="<your-api-endpoint>"
   Q_API_TOKEN="<your-api-token>"
   DEVICE_ID="<your-device-id>"
   ```

   - `USER_API_ENDPOINT`: The full URL to your target OQTOPUS Cloud User-API endpoint (e.g., `https://api.example.com`).
   - `Q_API_TOKEN`: Your authentication token for the API.
   - `DEVICE_ID`: The target device identifier (e.g., `qulacs`).

!!! warning
    Do not commit the `.env` file to version control. It is already added to `.gitignore` to prevent secret leakage.

### Using Profiles

Profiles let you switch between multiple environments (e.g., staging, production) without editing `.env` each time.

1. Create a profile file under `scenario-tests/profiles/`:

   ```shell
   cp scenario-tests/profiles/example.env scenario-tests/profiles/<profile-name>.env
   ```

2. Edit the new profile file with the target environment's credentials:

   ```shell
   USER_API_ENDPOINT="https://your-target-endpoint"
   Q_API_TOKEN="your-api-token"
   DEVICE_ID="your-device-id"
   ```

3. Specify the profile when running a task:

   ```shell
   PROFILE=<profile-name> task runn-all
   ```

   For example, if you created `profiles/staging.env`:

   ```shell
   PROFILE=staging task runn-all
   ```

The profile file takes precedence over `.env`. Variables not defined in the profile fall back to `.env`.

## Documentation

### Build Documentation

Install documentation dependencies:

```shell
make install
```

Build the documentation:

```shell
make docs-build
```

Lint markdown files:

```shell
make docs-lint
```

### Start the Documentation Server

This project uses [MkDocs](https://www.mkdocs.org/) to generate the HTML documentation.
Start the documentation server with:

```shell
make docs-serve
```

Open the documentation in your browser at [http://localhost:8000](http://localhost:8000).

## Next Steps

Once your environment is set up, refer to the [Development Flow](development_flow.md) to learn how to run tests and contribute changes.
