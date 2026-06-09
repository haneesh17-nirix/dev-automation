# Architecture

> Auto-maintained. The pipeline appends a note here whenever structural files change.

## Overview

**dev-automation** is a zero-dependency automation toolkit that hooks into git
to enforce versioning, documentation, testing, and logging on every push.

### Components

| Module | Path | Responsibility |
|--------|------|----------------|
| Git utilities | `src/git/diff.ts` | Read commits, diffs, tags |
| Versioning | `src/version/bumper.ts` | Semver bump from conventional commits |
| Changelog | `src/docs/changelog.ts` | Append grouped entries to CHANGELOG.md |
| Docs (LLM) | `src/docs/architect.ts` | Update ARCHITECTURE / DESIGN / API docs via Ollama |
| Test generator | `src/testing/generator.ts` | LLM-generate/update test files from diffs |
| Test runner | `src/testing/runner.ts` | Run all tests, report results |
| Link checker | `src/integration/link-checker.ts` | Verify all pages return 200 |
| API tester | `src/integration/api-tester.ts` | Verify all API endpoints |
| Logger | `src/logging/appender.ts` | Append to change / deploy / test logs |
| Hook installer | `src/hooks/installer.ts` | Write pre-commit / post-commit / pre-push hooks |
| CLI | `src/cli.ts` | Entry point for all commands |

### Global git template

`scripts/setup-global.sh` installs hooks into `~/.git-template/hooks/`.
Git copies this directory into every new repo on `git init` or `git clone`.

## Change History

### 2026-06-10 — initial architecture
- Bootstrapped all 7 automation subsystems
- Global git template configured at ~/.git-template
- pre-push gate enforces full pipeline before any remote push
