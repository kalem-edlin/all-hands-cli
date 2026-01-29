---
description: "Terminal prompt utilities for yes/no confirmation, conflict resolution menus, free-text questions, and incrementing backup path generation"
---

# Interactive UI

[ref:src/lib/ui.ts::827a9fa] provides the interactive terminal layer for the sync-cli. It wraps Node's `readline` interface into purpose-built prompt functions used across the sync and push commands.

## Prompt Functions

| Function | Returns | Used By |
|---|---|---|
| [ref:src/lib/ui.ts:askQuestion:827a9fa] | `string` | push (PR title) |
| [ref:src/lib/ui.ts:confirm:827a9fa] | `boolean` | sync (continue, delete), push (create PR) |
| [ref:src/lib/ui.ts:askConflictResolution:827a9fa] | `ConflictResolution` | sync (conflict handling) |

Each function creates and closes its own `readline.Interface` instance. This avoids keeping a persistent readline open, which would interfere with process exit.

## Conflict Resolution Menu

[ref:src/lib/ui.ts:askConflictResolution:827a9fa] presents a three-option menu when the sync command detects files that differ between source and target:

- **`b` (backup)** -- Create numbered backup files before overwriting
- **`o` (overwrite)** -- Replace directly, losing local changes
- **`c` (cancel)** -- Abort the entire sync with no changes

The menu loops on invalid input, requiring an explicit valid choice. This is the only multi-option prompt in the CLI -- all other interactions are simple yes/no via [ref:src/lib/ui.ts:confirm:827a9fa].

## Backup Path Generation

[ref:src/lib/ui.ts:getNextBackupPath:827a9fa] generates non-colliding backup filenames using an incrementing counter:

```
original.ts -> original.backup_1.ts
             -> original.backup_2.ts
             -> original.backup_3.ts
```

It scans the directory for existing backup files matching the pattern `<base>.backup_<N><ext>` and selects `N+1`. The regex is built with escaped characters from the original filename to avoid glob injection from filenames containing special characters.

## Design Choice: No Persistent State

The UI module is stateless -- no prompt history, no saved preferences. The `--yes` flag on sync and the `--title`/`--body` flags on push bypass interactive prompts entirely, enabling non-interactive CI usage. This separation means the UI layer is purely a human interface concern that can be skipped wholesale in automation.
