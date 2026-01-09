---
description: Complete reference for all claude-all-hands CLI commands including init, update, sync-back, and check-ignored with options and examples.
---

# Commands Reference

## init

Initialize allhands framework in a target repository.

**Location**: `src/commands/init.ts`

### Usage

```bash
claude-all-hands init <target> [options]
```

### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `target` | string | Yes | Path to target repository |

### Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--yes` | `-y` | boolean | false | Skip confirmation prompts |

### Behavior

1. **Migration Phase**
   - Renames existing `CLAUDE.md` to `CLAUDE.project.md`
   - Renames `.claude/settings.json` to `.claude/settings.local.json`
   - Moves existing husky hooks to `.husky/project/`

2. **Copy Phase**
   - Gets distributable files from manifest
   - Skips files that were just migrated
   - Warns before overwriting files with different content
   - Creates directory structure as needed

3. **Gitignore Sync**
   - Adds missing entries from source `.gitignore` to target
   - Preserves existing target entries
   - Adds header comment for allhands entries

4. **Setup Phase**
   - Creates `.allhandsignore` template
   - Runs `npx husky install`
   - Adds `envoy()` shell function to `.zshrc` or `.bashrc`

5. **Auto-sync Setup** (interactive only)
   - Detects GitHub remote
   - Offers to configure `ALL_HANDS_SYNC_TOKEN` secret

### Exit Codes

- `0`: Success
- `1`: Error (target doesn't exist, user aborted, etc.)

### Examples

```bash
# Interactive mode
claude-all-hands init ../my-project

# Non-interactive (CI/scripts)
claude-all-hands init ../my-project --yes
```

---

## update

Pull latest framework files from allhands source.

**Location**: `src/commands/update.ts`

### Usage

```bash
claude-all-hands update [options]
```

### Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--yes` | `-y` | boolean | false | Skip confirmation prompts |

### Behavior

1. **Pre-checks**
   - Verifies current directory is a git repo
   - Checks manifest exists at allhands source
   - Detects staged changes to managed files (blocks if found)

2. **Change Detection**
   - Compares distributable files (source vs target)
   - Identifies files modified in target
   - Identifies files deleted from source

3. **Update Phase**
   - Warns about files that will be overwritten
   - Copies updated/new files
   - Optionally deletes files removed from source

### Exit Codes

- `0`: Success
- `1`: Error (not git repo, staged conflicts, user aborted)

### Examples

```bash
# Run from target repo
cd my-project
claude-all-hands update

# Auto-accept all changes
claude-all-hands update -y
```

### Preserved Files

These files are never overwritten by update:
- `CLAUDE.project.md`
- `.claude/settings.local.json`
- `.husky/project/*`

---

## sync-back

Sync changes from target repo back to allhands via pull request.

**Location**: `src/commands/sync-back.ts`

### Usage

```bash
claude-all-hands sync-back [options]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--auto` | boolean | false | Non-interactive mode for hooks/CI |
| `--list` | boolean | false | List files that would sync, no PR |

### Behavior

1. **Pre-checks**
   - Verifies git repo and current branch
   - In `--auto` mode: exits silently if not on protected branch
   - Checks `gh auth status`

2. **Change Detection**
   - Finds modified managed files (vs allhands source)
   - Finds new files in managed directories (`.claude/`)
   - Filters through `.allhandsignore` patterns

3. **Sync Phase** (`--list` mode stops here)
   - Clones allhands to temp directory
   - Creates/updates branch: `sync/<repo-name>/<branch>`
   - Copies changed files
   - Commits and pushes

4. **PR Phase**
   - Creates or updates PR to allhands repo
   - PR body includes file list and source repo info

### Protected Branches

Auto mode only triggers on these branches:
- `main`, `master`
- `develop`, `staging`, `production`

### Exit Codes

- `0`: Success (or no changes to sync)
- `1`: Error (not git repo, auth failed, push failed)

### Examples

```bash
# Interactive sync
claude-all-hands sync-back

# Check what would sync (dry run)
claude-all-hands sync-back --list

# In post-merge hook
claude-all-hands sync-back --auto
```

---

## check-ignored

Filter file paths through `.allhandsignore` patterns.

**Location**: `src/commands/check-ignored.ts`

### Usage

```bash
claude-all-hands check-ignored [files...]
```

### Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `files` | string[] | File paths to check |

### Behavior

- Loads patterns from `.allhandsignore` in current directory
- For each input file, checks if it matches any ignore pattern
- Outputs files that are NOT ignored (would be synced)

### Exit Codes

- `0`: Always (filtering succeeded)

### Examples

```bash
# Check single file
claude-all-hands check-ignored .claude/agents/my-agent.md

# Check multiple files
claude-all-hands check-ignored .claude/agents/*.md

# Use with xargs
find .claude -name "*.md" | xargs claude-all-hands check-ignored

# Check if file would sync (no output = ignored)
claude-all-hands check-ignored CLAUDE.project.md
# (no output - file is ignored by default)
```

### Use Cases

- Pre-commit validation
- CI checks
- Manual verification before sync-back

---

## Global Options

Available on all commands:

| Option | Alias | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help |
| `--version` | | Show version number |

### Dependency Checks

- **git**: Checked on all commands (exits with error if missing)
- **gh**: Checked only for `sync-back` when not using `--list`
