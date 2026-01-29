---
description: "Git and GitHub CLI wrapper layers that provide structured result types for repo detection, file listing, authentication checks, and API calls"
---

# Git and GitHub Integration

The sync-cli wraps both `git` and `gh` (GitHub CLI) behind thin abstraction layers that normalize output into structured result types. These wrappers are consumed across all three commands.

## Result Type Convention

Both [ref:src/lib/git.ts:git:827a9fa] and [ref:src/lib/gh.ts:gh:827a9fa] return the same shape:

| Field | Type | Meaning |
|---|---|---|
| `success` | `boolean` | Exit code === 0 |
| `stdout` | `string` | Trimmed stdout |
| `stderr` | `string` | Trimmed stderr |

Both use `spawnSync` (not `execSync`) for structured access to exit codes and stderr without try/catch. The 10MB max buffer accommodates large repos with many files.

## Git Operations

[ref:src/lib/git.ts::827a9fa] exposes four capabilities:

| Function | Used By | Purpose |
|---|---|---|
| [ref:src/lib/git.ts:checkGitInstalled:827a9fa] | CLI entrypoint | Pre-flight: is `git` available? |
| [ref:src/lib/git.ts:isGitRepo:827a9fa] | sync, push, pull-manifest | Guards commands that require a repo context |
| [ref:src/lib/git.ts:getStagedFiles:827a9fa] | sync | Detects staged changes that would conflict with sync |
| [ref:src/lib/git.ts:getGitFiles:827a9fa] | push | Lists tracked + untracked-but-not-ignored files |

[ref:src/lib/git.ts:getGitFiles:827a9fa] combines `git ls-files` (tracked) with `git ls-files --others --exclude-standard` (untracked, not ignored) to produce a complete view of files the user's repo considers relevant. This is critical for the push command's gitignore-respecting file collection.

## GitHub CLI Operations

[ref:src/lib/gh.ts::827a9fa] provides authentication and identity primitives:

| Function | Used By | Purpose |
|---|---|---|
| [ref:src/lib/gh.ts:checkGhInstalled:827a9fa] | push | Pre-flight: is `gh` available? |
| [ref:src/lib/gh.ts:checkGhAuth:827a9fa] | push | Is the user authenticated with GitHub? |
| [ref:src/lib/gh.ts:getGhUser:827a9fa] | push | Resolves the authenticated GitHub username |
| [ref:src/lib/gh.ts:gh:827a9fa] | push (fork, clone, PR) | General-purpose gh command runner |

The push command is the sole consumer of the gh layer -- sync and pull-manifest only need local git operations.

## Design Trade-off: Synchronous Execution

Both wrappers use `spawnSync` (blocking). This simplifies control flow throughout the CLI since commands execute sequentially. The trade-off is that long-running git operations (like cloning in the push command) block the event loop, but this is acceptable for a CLI tool where the user is waiting for completion anyway.
