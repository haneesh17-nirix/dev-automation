import * as fs from "fs";
import * as path from "path";

const AUTOMATION_DIR = path.resolve(__dirname, "../../");

// pre-commit: fast check — run existing tests only (no generation, no integration)
const PRE_COMMIT = `#!/bin/bash
# dev-automation: pre-commit — runs existing tests, blocks commit on failure
set -e
AUTOMATION_DIR="${AUTOMATION_DIR}"
PROJECT_DIR="$(git rev-parse --show-toplevel)"

echo ""
echo "==> [pre-commit] Running tests..."
TARGET_PROJECT_PATH="$PROJECT_DIR" npx ts-node "$AUTOMATION_DIR/src/cli.ts" tests --run-only
echo "==> [pre-commit] Passed."
`;

// post-commit: background — generate docs/changelog/tests for the new commit
// Does NOT run integration or commit — those are the pre-push gate's job
const POST_COMMIT = `#!/bin/bash
# dev-automation: post-commit — generates docs, changelog, and test scripts (background)
AUTOMATION_DIR="${AUTOMATION_DIR}"
PROJECT_DIR="$(git rev-parse --show-toplevel)"

(
  echo ""
  echo "==> [post-commit] Updating docs, changelog, and test scripts..."
  TARGET_PROJECT_PATH="$PROJECT_DIR" npx ts-node "$AUTOMATION_DIR/src/cli.ts" run-all \\
    --skip-tests \\
    --skip-integration
  echo "==> [post-commit] Done."
) &
disown
`;

// pre-push: synchronous gate — full pipeline must pass before any push reaches the remote.
// 1. Waits for any background post-commit to finish (via lock file check)
// 2. Runs full pipeline: version + changelog + docs + test generation + tests + integration
// 3. Auto-commits all generated output (so it's included in the push)
// 4. Blocks the push if tests or integration checks fail
const PRE_PUSH = `#!/bin/bash
# dev-automation: pre-push gate
# Everything that goes to the remote must include the full automation output.
set -e
AUTOMATION_DIR="${AUTOMATION_DIR}"
PROJECT_DIR="$(git rev-parse --show-toplevel)"

echo ""
echo "================================================"
echo " dev-automation: pre-push pipeline"
echo "================================================"

# ── 1. Run the full pipeline synchronously ────────────────────────────────────
TARGET_PROJECT_PATH="$PROJECT_DIR" npx ts-node "$AUTOMATION_DIR/src/cli.ts" pre-push-pipeline
PIPELINE_EXIT=$?

if [ $PIPELINE_EXIT -ne 0 ]; then
  echo ""
  echo "✗ Push blocked: automation pipeline failed (exit $PIPELINE_EXIT)."
  echo "  Fix the issues above and try again."
  exit 1
fi

echo ""
echo "================================================"
echo " All checks passed. Push proceeding."
echo "================================================"
exit 0
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
    "pre-push": PRE_PUSH,
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
  console.log("   pre-commit  → runs existing tests (fast, blocks bad commits)");
  console.log("   post-commit → regenerates docs/changelog/tests in background");
  console.log("   pre-push    → full pipeline gate: tests + integration + auto-commit output");
  console.log("                 NOTHING reaches the remote unless this passes.\n");
}
