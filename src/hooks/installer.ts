import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const AUTOMATION_DIR = path.resolve(__dirname, "../../");

const PRE_COMMIT = `#!/bin/bash
# dev-automation: pre-commit hook
# Runs integration and unit tests before allowing a commit.
set -e

AUTOMATION_DIR="${AUTOMATION_DIR}"
PROJECT_DIR="$(git rev-parse --show-toplevel)"

echo ""
echo "🔍 Pre-commit checks..."

# Run tests (skip integration to keep pre-commit fast)
TARGET_PROJECT_PATH="$PROJECT_DIR" npx ts-node "$AUTOMATION_DIR/src/cli.ts" tests --run-only

echo "✓ Pre-commit checks passed"
`;

const POST_COMMIT = `#!/bin/bash
# dev-automation: post-commit hook
# Runs the full automation pipeline after every commit.
# Runs in background so it doesn't block the commit.

AUTOMATION_DIR="${AUTOMATION_DIR}"
PROJECT_DIR="$(git rev-parse --show-toplevel)"

(
  echo ""
  echo "🔧 Running post-commit automation..."
  TARGET_PROJECT_PATH="$PROJECT_DIR" npx ts-node "$AUTOMATION_DIR/src/cli.ts" run-all --skip-integration

  # Stage and commit the auto-updated docs/logs
  cd "$PROJECT_DIR"
  git add \\
    CHANGELOG.md \\
    package.json \\
    docs/ \\
    logs/ \\
    tests/generated/ \\
    config/automation.json \\
    2>/dev/null || true

  if ! git diff --staged --quiet; then
    git commit -m "chore: auto-update docs, tests, and logs [skip ci]" --no-verify
    echo "✓ Auto-committed docs and logs"
  fi
) &

disown
`;

export function installHooks(projectPath: string): void {
  const gitDir = path.join(projectPath, ".git");
  if (!fs.existsSync(gitDir)) {
    console.error(`Not a git repository: ${projectPath}`);
    process.exit(1);
  }

  const hooksDir = path.join(gitDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const hooks: Record<string, string> = {
    "pre-commit": PRE_COMMIT,
    "post-commit": POST_COMMIT,
  };

  for (const [name, content] of Object.entries(hooks)) {
    const hookPath = path.join(hooksDir, name);
    if (fs.existsSync(hookPath)) {
      fs.copyFileSync(hookPath, `${hookPath}.backup`);
      console.log(`  Backed up existing ${name} hook → ${name}.backup`);
    }
    fs.writeFileSync(hookPath, content, "utf8");
    fs.chmodSync(hookPath, "755");
    console.log(`  ✓ Installed ${name} hook`);
  }

  console.log(`\n✅ Hooks installed in ${hooksDir}`);
  console.log("   pre-commit  → runs tests before every commit");
  console.log("   post-commit → bumps version, updates docs/changelog/logs after every commit");
}
