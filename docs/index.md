# OQTOPUS Test Suite

| Docs         |                                                                        |
|--------------|------------------------------------------------------------------------|
| **CI**       | ![CI](https://github.com/oqtopus-project/test-suite/actions/workflows/ci.yaml/badge.svg) |
| **License**  | ![LICENSE](https://img.shields.io/github/license/oqtopus-project/test-suite)   |

This repository contains external testing tools for the OQTOPUS quantum computing platform.

## Overview

This test suite is designed to ensure the reliability and correctness of the OQTOPUS platform. It includes a variety of tests that cover different aspects of the system.

## Table of Contents

- [OQTOPUS Test Suite](#oqtopus-test-suite)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Included Tests](#included-tests)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Contributing](#contributing)
  - [License](#license)

## Included Tests

- **[scenario-tests/](scenario-tests/README.md)**: Scenario tests for quantum job execution using the `runn` framework.
- **[endurance-test/](endurance-test/README.md)**: Endurance tests for the OQTOPUS platform.

## Prerequisites

- [runn](https://github.com/k1LoW/runn)

## Installation

To use this test suite, you need to have `runn` installed. Please follow the installation instructions in the [official runn documentation](https://github.com/k1LoW/runn).

## Usage

1.  Navigate to the specific test directory you want to run.
2.  Follow the instructions in the `README.md` file within that directory to execute the tests.

For detailed usage instructions, refer to the `README.md` in each respective test directory.

## Contributing

We welcome contributions to the OQTOPUS Test Suite! If you would like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and commit them with a clear message.
4.  Push your changes to your fork.
5.  Submit a pull request to the `main` branch of this repository.

## License

This project is licensed under the [MIT License](LICENSE).

```{toctree}
---
maxdepth: 2
caption: Contents:
---
scenario-tests/README.md
endurance-test/README.md
```

