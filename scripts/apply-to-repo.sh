#!/bin/bash
# Apply dev-automation hooks to an existing repo.
# Usage: ./apply-to-repo.sh /path/to/your/project
set -euo pipefail

AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$(pwd)}"

if [ ! -d "$TARGET/.git" ]; then
  echo "Error: $TARGET is not a git repository."
  exit 1
fi

echo ""
echo "Applying dev-automation hooks to: $TARGET"

# Re-run git init so the global template hooks are copied in
git -C "$TARGET" init

# Write .env if it doesn't exist
if [ ! -f "$TARGET/.env" ]; then
  cat > "$TARGET/.env" <<ENV
TARGET_PROJECT_PATH=$TARGET
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
ENV
  echo "✓ Created $TARGET/.env"
fi

echo "✓ Hooks installed in $TARGET/.git/hooks/"
echo ""
echo "  pre-commit  → run tests before every commit"
echo "  post-commit → update docs/changelog/tests after every commit"
echo "  pre-push    → full pipeline gate before every push"
echo ""
