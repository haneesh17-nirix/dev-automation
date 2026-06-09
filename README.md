# dev-automation

Plug into any project. Every commit automatically gets:
versioning · changelog · architecture docs · design docs · API docs · test generation · integration checks · structured logs.

Everything appends — nothing is ever overwritten.

---

## What runs on every commit

```
pre-commit hook   → runs existing tests (blocks commit if they fail)
post-commit hook  → runs the full pipeline in background:
  1. Bump version         (patch / minor / major from conventional commits)
  2. Update CHANGELOG.md  (grouped by feat / fix / breaking / chore)
  3. Update ARCHITECTURE.md  (LLM summary of structural changes)
  4. Update DESIGN.md        (LLM note on new features / breaking changes)
  5. Update API.md           (LLM note when route files change)
  6. Update automation.json  (auto-add new API endpoints from route files)
  7. Generate/update tests   (LLM writes tests for changed source files)
  8. Run all tests           (unit + generated)
  9. Append logs             (logs/changes.log + docs/CHANGE-LOG.md)
  10. Auto-commit all above  (single chore commit, skip CI)
```

---

## Setup (5 minutes)

### 1 — Install

```bash
git clone https://github.com/YOUR_USERNAME/dev-automation.git
cd dev-automation
npm install
cp .env.example .env
```

### 2 — Point at your project

Edit `.env`:
```
TARGET_PROJECT_PATH=/Users/haneeshp/seo-pipeline
OLLAMA_HOST=http://localhost:11434
```

### 3 — Install git hooks into your project

```bash
npm run install-hooks
```

This installs `pre-commit` and `post-commit` hooks into your project's `.git/hooks/`.

### 4 — (Optional) Configure your APIs and pages

Edit `config/automation.json`:
- Add your API endpoints under `integration.apiEndpoints`
- Add your site pages under `integration.pages`

New endpoints are auto-added as you add route files.

---

## Commands

| Command | What it does |
|---------|-------------|
| `auto run-all` | Full pipeline (used by post-commit hook) |
| `auto version` | Bump version from conventional commits |
| `auto changelog` | Append to CHANGELOG.md |
| `auto docs` | Update architecture, design, and API docs |
| `auto tests` | Generate tests for changed files + run all |
| `auto tests --generate-only` | Only generate, don't run |
| `auto tests --run-only` | Only run, don't generate |
| `auto integration` | Test all API endpoints + all page links |
| `auto integration --crawl` | Deep link crawl (finds links on each page) |
| `auto integration --apis-only` | API tests only |
| `auto log-deploy --env staging` | Append deployment record |
| `auto hooks install` | Install git hooks into TARGET_PROJECT_PATH |
| `auto hooks uninstall` | Remove the hooks |

---

## Files generated in your project

```
YOUR_PROJECT/
├── CHANGELOG.md              ← auto-appended on every commit
├── docs/
│   ├── ARCHITECTURE.md       ← structural change notes (LLM)
│   ├── DESIGN.md             ← feature/breaking change notes (LLM)
│   ├── API.md                ← API contract changes (LLM)
│   └── CHANGE-LOG.md         ← human-readable full change record
├── logs/
│   ├── changes.log           ← machine-readable change + integration log
│   ├── deployments.log       ← deployment history
│   └── test-runs.log         ← test run history
└── tests/generated/
    └── *.generated.test.ts   ← LLM-generated tests, updated on each change
```

---

## Conventional commit format (required for smart versioning)

```
feat: add asset export endpoint     → bumps minor version
fix: correct null check in tracker  → bumps patch version
feat!: change API response shape    → bumps MAJOR version (breaking)
chore: update dependencies          → bumps patch version
```

---

## GitHub Actions

`.github/workflows/on-push.yml` runs on every push to `main`:
- Bumps version + updates changelog
- Runs integration checks against live site
- Logs the deployment
- Commits updated files back to the repo

For the GitHub Actions to work, set the workflow `permissions: contents: write` (already configured).
