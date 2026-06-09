# API / Interface Documentation

> Auto-maintained. Updated whenever route or handler files change.

## CLI Commands

| Command | Description |
|---------|-------------|
| `auto run-all` | Full pipeline (version → docs → tests → log) |
| `auto version` | Bump version from conventional commits |
| `auto changelog` | Append to CHANGELOG.md |
| `auto docs` | Update architecture, design, API docs |
| `auto tests` | Generate/update + run all tests |
| `auto integration` | Test API endpoints and page links |
| `auto log-deploy --env <env>` | Log a deployment event |
| `auto hooks install` | Install hooks into TARGET_PROJECT_PATH |
| `auto hooks uninstall` | Remove hooks |
| `auto pre-push-pipeline` | Full synchronous gate (called by pre-push hook) |

## Configuration (`config/automation.json`)

| Key | Description |
|-----|-------------|
| `project.siteUrl` | Base URL for link checking |
| `integration.apiEndpoints` | Array of endpoints to test on every push |
| `integration.pages` | Array of pages to check links on |
| `docs.*` | Paths to each doc file (relative to project root) |
| `logging.*` | Paths to each log file |
| `ollama.model` | LLM model for doc/test generation |

## Change History

