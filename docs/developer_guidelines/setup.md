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

> [!WARNING]
> Do not commit the `.env` file to version control. It is already added to `.gitignore` to prevent secret leakage.

## Next Steps

Once your environment is set up, you can refer to the [Development Flow](development_flow.md) to learn how to run tests and make changes.
