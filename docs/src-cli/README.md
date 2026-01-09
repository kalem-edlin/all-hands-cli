---
description: CLI entry point and command routing for claude-all-hands. Handles argument parsing via yargs, dependency checks, and dispatches to individual command handlers.
---

# src-cli

The `src/cli.ts` module serves as the entry point for the `claude-all-hands` CLI tool, providing commands to initialize, update, and sync AllHands framework files between repositories.

## Overview

The CLI is built on [yargs](https://yargs.js.org/) and provides four main commands:

| Command | Purpose |
|---------|---------|
| `init <target>` | Initialize AllHands in a target repository |
| `update` | Pull latest files from AllHands source |
| `sync-back` | Sync local changes back to AllHands as PR |
| `check-ignored` | Filter files through `.allhandsignore` patterns |

## Key Concepts

### Distributable Files

Files managed by AllHands are defined in `.allhands-manifest.json`. The manifest specifies:
- `distribute`: glob patterns for files to copy to target repos
- `internal`: files kept only in source repo
- `exclude`: patterns to skip during distribution

### Project-Specific Files

Target repos can maintain project-specific configurations:
- `CLAUDE.project.md` - project-specific Claude instructions
- `.claude/settings.local.json` - local settings overrides
- `.husky/project/*` - project-specific git hooks

These files are excluded from sync operations.

### AllHands Ignore

The `.allhandsignore` file (gitignore-style patterns) controls which files are excluded from sync-back operations. Use this for project-specific customizations.

## Architecture

```
src/cli.ts                 # Entry point, argument parsing
  |
  +-- src/commands/
  |     +-- init.ts        # Initialization flow
  |     +-- update.ts      # Update from source
  |     +-- sync-back.ts   # PR creation for changes
  |     +-- check-ignored.ts # Ignore pattern filter
  |
  +-- src/lib/
        +-- manifest.ts    # Manifest parsing, ignore patterns
        +-- git.ts         # Git/gh CLI wrappers
        +-- paths.ts       # Source location resolution
```

## Entry Point

**File:** `src/cli.ts`

The main function:
1. Checks git is installed (required for all commands)
2. Parses arguments via yargs
3. Checks gh CLI for commands that need it (sync-back)
4. Dispatches to appropriate command handler
5. Exits with handler's return code

```typescript
// Simplified flow
async function main() {
  if (!checkGitInstalled()) exit(1);

  yargs(hideBin(process.argv))
    .command('init <target>', ..., (argv) => cmdInit(argv.target, argv.yes))
    .command('update', ..., (argv) => cmdUpdate(argv.yes))
    .command('sync-back', ..., (argv) => cmdSyncBack(options))
    .command('check-ignored', ..., (argv) => cmdCheckIgnored(argv.files))
    .parse();
}
```

## Dependency Checks

- **git**: Required for all commands. Checked at startup.
- **gh (GitHub CLI)**: Required only for `sync-back` (not `--list` mode). Checked before command execution.

## Common Workflows

### Fresh Repository Setup

```bash
# Initialize AllHands in a new repo
claude-all-hands init /path/to/repo

# With auto-confirm
claude-all-hands init /path/to/repo -y
```

### Updating to Latest

```bash
# Pull latest from AllHands source
cd /path/to/target
claude-all-hands update
```

### Contributing Back

```bash
# See what would sync
claude-all-hands sync-back --list

# Create PR with changes
claude-all-hands sync-back
```

## Related Documentation

- [Implementation Details](./Implementation.md) - deep dive into each command
- [API Reference](./API.md) - function signatures and options
