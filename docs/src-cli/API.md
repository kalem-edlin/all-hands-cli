---
description: API reference for CLI commands including function signatures, options, and return values for cmdInit, cmdUpdate, cmdSyncBack, and cmdCheckIgnored.
---

# API Reference

## Entry Point

### main() (cli.ts)

Internal function, not exported. Handles CLI bootstrap and argument parsing.

**Dependencies checked:**
- `git` - required, exits with code 1 if missing
- `gh` - checked per-command (only sync-back needs it)

---

## Commands

### cmdInit

**File:** `src/commands/init.ts`

```typescript
export async function cmdInit(
  target: string,
  autoYes: boolean = false
): Promise<number>
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `target` | `string` | required | Path to target repository |
| `autoYes` | `boolean` | `false` | Skip confirmation prompts |

**Returns:** Exit code (0 = success, 1 = error/aborted)

**CLI Usage:**
```bash
claude-all-hands init <target> [--yes|-y]
```

**Side Effects:**
- Creates/modifies files in target directory
- Migrates existing files to project-specific locations
- Appends to user's shell rc file (envoy function)
- Runs `npx husky install`

---

### cmdUpdate

**File:** `src/commands/update.ts`

```typescript
export async function cmdUpdate(
  autoYes: boolean = false
): Promise<number>
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `autoYes` | `boolean` | `false` | Skip confirmation prompts |

**Returns:** Exit code (0 = success, 1 = error/aborted)

**CLI Usage:**
```bash
claude-all-hands update [--yes|-y]
```

**Prerequisites:**
- Must be run from a git repository
- AllHands source must be available (via ALLHANDS_PATH or package)
- No staged changes in managed files

**Side Effects:**
- Overwrites managed files with source versions
- Optionally deletes files removed from source

---

### cmdSyncBack

**File:** `src/commands/sync-back.ts`

```typescript
export interface SyncBackOptions {
  auto?: boolean;
  list?: boolean;
}

export async function cmdSyncBack(
  options: SyncBackOptions = {}
): Promise<number>
```

**Options:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `auto` | `boolean` | `false` | Non-interactive mode for hooks/CI |
| `list` | `boolean` | `false` | List syncable files only (no PR) |

**Returns:** Exit code (0 = success, 1 = error)

**CLI Usage:**
```bash
claude-all-hands sync-back [--auto] [--list]
```

**Auto Mode Behavior:**
- Only runs on protected branches (main, master, develop, staging, production)
- Returns 0 silently on non-protected branches
- Returns 0 on PR creation failure (non-blocking)

**List Mode Output:**
- One file path per line
- No header or formatting
- Suitable for piping to other commands

**Prerequisites:**
- Must be run from git repository
- `gh` CLI must be authenticated (unless --list)
- AllHands source must be available

**Side Effects:**
- Clones AllHands repo to temp directory (cleaned up after)
- Creates/updates branch in AllHands repo
- Creates/updates PR

---

### cmdCheckIgnored

**File:** `src/commands/check-ignored.ts`

```typescript
export function cmdCheckIgnored(
  files: string[]
): number
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `files` | `string[]` | List of file paths to check |

**Returns:** Always 0

**CLI Usage:**
```bash
claude-all-hands check-ignored [files..]
```

**Output:**
- Files that are NOT ignored (pass through filter)
- One file per line

**Example:**
```bash
# Check specific files
claude-all-hands check-ignored .claude/agents/custom.md docs/readme.md

# With shell expansion
claude-all-hands check-ignored .claude/**/*.md
```

---

## Supporting Types

### SyncBackOptions

```typescript
interface SyncBackOptions {
  auto?: boolean;  // Non-interactive mode
  list?: boolean;  // List-only mode
}
```

---

## Exit Codes

All commands use consistent exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error, aborted by user, or dependency missing |

---

## Environment Variables

### ALLHANDS_PATH

Override AllHands source location (for local development).

```bash
ALLHANDS_PATH=/path/to/claude-all-hands claude-all-hands update
```

Resolution order:
1. `ALLHANDS_PATH` environment variable
2. Package location (relative to cli.js)
