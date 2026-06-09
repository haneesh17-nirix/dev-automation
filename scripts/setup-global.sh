#!/bin/bash
# Installs dev-automation as a global git template.
# After this runs, every `git init` and `git clone` automatically
# gets the pre-commit / post-commit / pre-push pipeline.
set -euo pipefail

AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$HOME/.git-template"
HOOKS_DIR="$TEMPLATE_DIR/hooks"

echo ""
echo "=== dev-automation: Global Git Template Setup ==="
echo ""
echo "Automation dir : $AUTOMATION_DIR"
echo "Template dir   : $TEMPLATE_DIR"
echo ""

# ── 1. Create template hooks directory ───────────────────────────────────────
mkdir -p "$HOOKS_DIR"

# ── 2. Write hooks that delegate to this installation ────────────────────────

cat > "$HOOKS_DIR/pre-commit" <<HOOK
#!/bin/bash
# dev-automation global pre-commit
AUTOMATION_DIR="$AUTOMATION_DIR"
PROJECT_DIR="\$(git rev-parse --show-toplevel)"

# Skip if this IS the automation repo itself
if [ "\$PROJECT_DIR" = "\$AUTOMATION_DIR" ]; then exit 0; fi

# Skip if no .env / TARGET_PROJECT_PATH not configured yet (fresh clone)
if [ ! -f "\$PROJECT_DIR/.env" ] && [ -z "\${TARGET_PROJECT_PATH:-}" ]; then exit 0; fi

echo ""
echo "==> [pre-commit] Running tests..."
TARGET_PROJECT_PATH="\$PROJECT_DIR" npx --prefix "\$AUTOMATION_DIR" ts-node "\$AUTOMATION_DIR/src/cli.ts" tests --run-only
echo "==> [pre-commit] Passed."
HOOK

cat > "$HOOKS_DIR/post-commit" <<HOOK
#!/bin/bash
# dev-automation global post-commit
AUTOMATION_DIR="$AUTOMATION_DIR"
PROJECT_DIR="\$(git rev-parse --show-toplevel)"

if [ "\$PROJECT_DIR" = "\$AUTOMATION_DIR" ]; then exit 0; fi
if [ ! -f "\$PROJECT_DIR/.env" ] && [ -z "\${TARGET_PROJECT_PATH:-}" ]; then exit 0; fi

(
  echo ""
  echo "==> [post-commit] Updating docs, changelog, test scripts..."
  TARGET_PROJECT_PATH="\$PROJECT_DIR" npx --prefix "\$AUTOMATION_DIR" ts-node "\$AUTOMATION_DIR/src/cli.ts" run-all \\
    --skip-tests --skip-integration
  echo "==> [post-commit] Done."
) &
disown
HOOK

cat > "$HOOKS_DIR/pre-push" <<HOOK
#!/bin/bash
# dev-automation global pre-push gate
AUTOMATION_DIR="$AUTOMATION_DIR"
PROJECT_DIR="\$(git rev-parse --show-toplevel)"

if [ "\$PROJECT_DIR" = "\$AUTOMATION_DIR" ]; then exit 0; fi
if [ ! -f "\$PROJECT_DIR/.env" ] && [ -z "\${TARGET_PROJECT_PATH:-}" ]; then exit 0; fi

echo ""
echo "================================================"
echo " dev-automation: pre-push pipeline"
echo "================================================"

TARGET_PROJECT_PATH="\$PROJECT_DIR" npx --prefix "\$AUTOMATION_DIR" ts-node "\$AUTOMATION_DIR/src/cli.ts" pre-push-pipeline
PIPELINE_EXIT=\$?

if [ \$PIPELINE_EXIT -ne 0 ]; then
  echo ""
  echo "✗ Push blocked: pipeline failed (exit \$PIPELINE_EXIT)."
  exit 1
fi

echo ""
echo "================================================"
echo " All checks passed. Push proceeding."
echo "================================================"
exit 0
HOOK

# ── 3. Make hooks executable ──────────────────────────────────────────────────
chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/post-commit" "$HOOKS_DIR/pre-push"

# ── 4. Register template dir with git globally ────────────────────────────────
git config --global init.templateDir "$TEMPLATE_DIR"

# ── 5. Also write a global .gitconfig snippet for reference ──────────────────
echo ""
echo "✓ Hooks written to     : $HOOKS_DIR"
echo "✓ Git global config    : init.templateDir = $TEMPLATE_DIR"
echo ""
echo "From now on, every 'git init' and 'git clone' will automatically"
echo "have the pre-commit / post-commit / pre-push pipeline installed."
echo ""
echo "To apply to an EXISTING repo that was already initialised:"
echo "  cd /path/to/existing-repo && git init   (safe to re-run)"
echo ""
echo "To skip the pipeline for a specific push (emergency only):"
echo "  git push --no-verify"
echo ""
