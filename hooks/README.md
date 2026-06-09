# hooks/

This directory is intentionally empty in the repo.

Hooks are **written dynamically** into a target project's `.git/hooks/` by:

```bash
# Install into a specific project
auto hooks install

# Or apply globally (every future git init/clone)
bash scripts/setup-global.sh
```

The hook content is defined in [`src/hooks/installer.ts`](../src/hooks/installer.ts).
The global template is written to `~/.git-template/hooks/`.
