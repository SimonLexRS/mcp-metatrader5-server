# GitHub Configuration

This directory contains GitHub-specific configuration files for the MCP MetaTrader 5 Server project.

## Workflows

### CI Workflow (`workflows/ci.yml`)

Runs on every push to `main` and on all pull requests:

- **Test**: Runs unit tests on Python 3.11, 3.12, and 3.13 (Windows)
- **Lint**: Checks code style with ruff
- **Build**: Builds the package to verify distribution
- **Docs**: Builds documentation to verify no errors

### Publish Workflow (`workflows/publish.yml`)

Automatically publishes to PyPI when a new release is created:

- Builds the package
- Publishes to PyPI using trusted publishing
- Can also manually publish to Test PyPI

## Issue Templates

- **Bug Report**: For reporting bugs and issues
- **Feature Request**: For suggesting new features

## Pull Request Template

Standard template for all pull requests with:
- Description and type of change
- Testing checklist
- Documentation updates
- Related issues

## Dependabot

Automatically creates PRs to update:
- GitHub Actions versions (weekly)
- Python dependencies (weekly)
- Groups related dependencies together

## Setting Up Secrets

For the workflows to function properly, add these secrets to your repository:

### For PyPI Publishing

1. Go to https://pypi.org/manage/account/token/
2. Create a new API token
3. Add it as `PYPI_API_TOKEN` in GitHub repository secrets

### For Test PyPI (Optional)

1. Go to https://test.pypi.org/manage/account/token/
2. Create a new API token
3. Add it as `TEST_PYPI_API_TOKEN` in GitHub repository secrets

### For Codecov (Optional)

1. Go to https://codecov.io/
2. Add your repository
3. Copy the upload token
4. Add it as `CODECOV_TOKEN` in GitHub repository secrets

## Trusted Publishing (Recommended)

Instead of using API tokens, you can set up trusted publishing:

1. Go to https://pypi.org/manage/account/publishing/
2. Add a new publisher:
   - **PyPI Project Name**: `mcp-metatrader5-server`
   - **Owner**: `Qoyyuum`
   - **Repository**: `mcp-metatrader5-server`
   - **Workflow**: `publish.yml`
   - **Environment**: (leave blank)

This is more secure as it doesn't require storing tokens.
