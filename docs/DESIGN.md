# Design Document

> Auto-maintained. New features and breaking changes are appended here by the pipeline.

## Goals

1. **Zero friction** — automation runs without developer intervention
2. **Append-only** — nothing is ever overwritten; all history is preserved
3. **Gate at push, not commit** — commits stay fast; the full check happens at push time
4. **Self-updating** — tests and integration configs update themselves as code changes

## Decisions

### 2026-06-10 — gate placement
The full pipeline (tests + integration + doc generation) runs in the `pre-push` hook,
not `pre-commit`, to keep commit latency under 15 seconds while still guaranteeing
the remote only ever receives verified, documented code.

### 2026-06-10 — LLM for docs/tests
Ollama (local, free) generates doc notes and test scaffolding from git diffs.
If Ollama is unreachable the pipeline degrades gracefully — docs fall back to
a plain diff summary, no error is thrown.

### 2026-06-10 — config-driven integration
All API endpoints and pages to check live in `config/automation.json`.
New route files are parsed for Express-style route definitions and auto-added.
