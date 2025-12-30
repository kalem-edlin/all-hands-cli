# Git Hooks

Husky v9+ hooks with a layered architecture: **main hooks → claude/ scripts → project/ hooks**

## Structure

```
.husky/
├── claude/          # Framework scripts (don't edit)
├── project/         # YOUR customizations go here
└── *.sh             # Main hooks (delegate to above)
```

## Customizing

Add project-specific logic in `project/`:

```sh
# project/pre-commit
npm run lint
```

```sh
# project/commit-msg  
npx commitlint --edit "$1"
```

## What the Hooks Do

| Hook | Auto-behavior |
|------|---------------|
| `post-checkout` | Creates `.claude/plans/<branch>/` for feature branches |
| `post-merge` | Cleans up plan dir, runs sync-back |
| `pre-commit` | Warns about files that will sync to claude-all-hands |

## Quick Reference

```sh
npx husky              # Reinstall hooks
git commit --no-verify # Skip hooks
HUSKY=0 git commit     # Also skips hooks
```
