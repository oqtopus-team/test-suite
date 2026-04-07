# Setup Development Environment

This guide explains how to set up your local environment for developing and running tests in the OQTOPUS Test Suite.

## Prerequisites

Before you begin, ensure you have the following tools installed on your system:

### 1. Homebrew (macOS/Linux)

If you are on macOS or Linux, we recommend using [Homebrew](https://brew.sh/) to install dependencies.

### 2. Python & uv

The documentation generation uses Python and [uv](https://docs.astral.sh/uv/) for dependency management.

```bash
# Install uv using curl (macOS/Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

*Note: If you only intend to run the `runn` tests and not build the documentation, this step is optional.*

### 3. runn

[runn](https://github.com/k1LoW/runn) is the core testing framework used for writing and executing scenario tests.

```bash
# macOS
brew install k1LoW/tap/runn

# Go
go install github.com/k1LoW/runn/cmd/runn@latest
```

### 4. Task

[Task](https://taskfile.dev/) is used as a task runner to simplify executing test commands.

```bash
# macOS
brew install go-task
```

## Environment Configuration

To run the tests against the OQTOPUS Cloud API, you need to configure your environment variables.

1. Navigate to the `scenario-tests` directory:

   ```bash
   cd scenario-tests
   ```

2. Create a `.env` file based on the required variables:

   ```bash
   touch .env
   ```

3. Populate the `.env` file with your specific API credentials:

   ```bash
   # API Configuration
   USER_API_ENDPOINT="<your-api-endpoint>"
   Q_API_TOKEN="<your-api-token>"
   ```

   - `USER_API_ENDPOINT`: The full URL to your target Oqtopus Cloud User-API endpoint (e.g., `https://api.example.com`).
   - `Q_API_TOKEN`: Your authentication token for the API.

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
   cd scenario-tests
   PROFILE=<profile-name> task runn-all
   ```

   For example, if you created `profiles/staging.env`:

   ```shell
   PROFILE=staging task runn-all
   ```

When `PROFILE` is set, `profiles/<profile-name>.env` is loaded first. The `.env` file is loaded afterward as a fallback for any variables not defined in the profile.

## Documentation

### Build Documentation

Build the documentation:

```shell
uv run mkdocs build
```

### Start the Documentation Server

This project uses [MkDocs](https://www.mkdocs.org/) to generate the HTML documentation.
Start the documentation server with:

```shell
uv run mkdocs serve
```

Open the documentation in your browser at [http://localhost:8000](http://localhost:8000).

## Next Steps

Once your environment is set up, you can refer to the [Development Flow](development_flow.md) to learn how to run tests and make changes.
