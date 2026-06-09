# dev-automation

Plug into any project. Every commit automatically gets:
versioning · changelog · architecture docs · design docs · API docs · test generation · integration checks · structured logs.

Everything appends — nothing is ever overwritten.

---

## What runs — and when

```
git commit
  └─ pre-commit  (synchronous, blocks commit)
       • Runs existing tests — commit blocked if any fail

  └─ post-commit  (background, non-blocking)
       • Bumps version
       • Updates CHANGELOG.md
       • Updates ARCHITECTURE.md, DESIGN.md, API.md  (via Ollama)
       • Generates/updates tests for changed files   (via Ollama)
       • Appends to change logs

git push
  └─ pre-push  (synchronous, blocks push) ← THE GATE
       Step 1  Version bump + CHANGELOG.md
       Step 2  Architecture, Design, API docs
       Step 3  Test script generation (Ollama)
       Step 4  Run ALL tests  ── FAIL = push blocked
       Step 5  Integration checks (API endpoints + page links)  ── FAIL = push blocked
       Step 6  Append logs (changes.log, CHANGE-LOG.md)
       Step 7  Auto-commit all generated output
               └─ The automation output travels WITH the push.
                  Nothing reaches the remote without it.
```

**Nothing reaches the remote unless the full pipeline passes.**

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
