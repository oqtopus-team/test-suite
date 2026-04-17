![OQTOPUS](docs/asset/oqtopus-logo.png)

# OQTOPUS Test Suite

This repository contains external testing tools for the OQTOPUS quantum computing platform.

## Contents

- **[scenario-tests/](scenario-tests/README.md)** - Scenario tests for quantum job execution using runn framework
- **[endurance-test/](endurance-test/README.md)** - Endurance tests for long-term stability of the OQTOPUS platform

## Developer Guidelines

- [Setup Development Environment](developer_guidelines/setup.md)
- [Development Flow](developer_guidelines/development_flow.md)
- [Adding New Tests](developer_guidelines/adding_new_tests.md)
- [How to Contribute](CONTRIBUTING.md)
- [Code of Conduct](https://github.com/oqtopus-team/.github/blob/main/CODE_OF_CONDUCT.md)
- [Security](https://github.com/oqtopus-team/.github/blob/main/SECURITY.md)

## Quick Start

**1. Install dependencies**

- [Task](https://taskfile.dev/installation/) — task runner
- [runn](https://github.com/k1LoW/runn#install) — test framework

**2. Configure environment variables**

```bash
cd scenario-tests
cp profiles/example.env .env
# Edit .env and fill in your values:
#   USER_API_ENDPOINT, Q_API_TOKEN, DEVICE_ID
```

**3. Run all tests**

```bash
task runn-all
```

> Alternatively, use profiles to switch between environments without modifying `.env`:
> ```bash
> PROFILE=<profile-name> task runn-all
> ```
