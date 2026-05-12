SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

.PHONY: install docs-assets docs-lint docs-build docs-serve help

install: ## Install dependencies
	@uv sync --group docs
	@git config --local commit.template .gitmessage

docs-assets: ## Copy scenario-tests assets into docs/
	@mkdir -p docs/scenario-tests/asset
	@cp -r scenario-tests/asset/* docs/scenario-tests/asset/

docs-lint: ## Lint markdown files under docs/
	@uv run pymarkdown scan docs

docs-build: docs-assets ## Build documentation
	@uv run mkdocs build

docs-serve: docs-assets ## Serve documentation locally
	@uv run mkdocs serve

help: ## Show help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
