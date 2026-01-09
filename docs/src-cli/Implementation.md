---
description: Implementation details for CLI commands including init migration logic, update conflict handling, sync-back PR flow, and check-ignored pattern matching.
---

# Implementation Details

## init Command

**File:** `src/commands/init.ts`

### Initialization Flow

The init command performs 8 sequential steps:

1. **Migrate existing files** - Moves conflicting files to project-specific locations
2. **Check for overwrites** - Warns about files that will be replaced
3. **Copy files** - Distributes AllHands files to target
4. **Sync .gitignore** - Adds required ignore entries
5. **Create .allhandsignore** - Template for project-specific exclusions
6. **Setup husky** - Installs git hooks
7. **Setup envoy shell** - Adds shell function to rc file
8. **Auto-sync setup** - Optional GitHub Actions workflow (interactive only)

### Migration Map

Files are automatically migrated to avoid conflicts:

| Original | Migrated To |
|----------|-------------|
| `CLAUDE.md` | `CLAUDE.project.md` |
| `.claude/settings.json` | `.claude/settings.local.json` |
| `.husky/<hook>` | `.husky/project/<hook>` |

Migration only occurs if:
- Original file exists
- Destination does not exist
- File is not already an AllHands hook (contains `claude/` or `project/`)

### Envoy Shell Function

The init command adds a shell function to enable the `envoy` command:

```bash
envoy() {
  "$PWD/.claude/envoy/envoy" "$@"
}
```

Detection order: `.zshrc` > `.bash_profile` > `.bashrc`

### Return Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Target not found, user aborted, or error |

---

## update Command

**File:** `src/commands/update.ts`

### Update Flow

1. Verify target is a git repo
2. Load manifest from AllHands source
3. Check for staged changes in managed files (conflicts)
4. Compare distributable files between source and target
5. Detect files deleted from source
6. Copy updated files
7. Optionally delete removed files

### Conflict Detection

Update fails if any managed files have staged changes:

```typescript
const conflicts = [...staged].filter(f => managedPaths.has(f));
if (conflicts.length > 0) {
  console.error("Run 'git stash' or commit first.");
  return 1;
}
```

### File Comparison

Files are compared byte-by-byte using `Buffer.equals()`:

```typescript
const sourceContent = readFileSync(sourceFile);
const targetContent = readFileSync(targetFile);
if (!sourceContent.equals(targetContent)) {
  willOverwrite.push(relPath);
}
```

### Deleted File Handling

When files are removed from AllHands source but exist in target:
- Listed with count
- User prompted for deletion (unless `-y` flag)
- Each deletion logged

---

## sync-back Command

**File:** `src/commands/sync-back.ts`

### Protected Branches

In auto mode (`--auto`), sync only runs on protected branches:

```typescript
const PROTECTED_BRANCHES = new Set([
  'main', 'master', 'develop', 'staging', 'production'
]);
```

### Change Detection

Two categories of files are detected:

1. **Changed managed files** - Files in manifest that differ from source
2. **New files in managed dirs** - Files in `.claude/` not in source but matching distribute patterns

Files matching `.allhandsignore` patterns are excluded from both.

### Sync Flow

1. Clone AllHands repo to temp directory
2. Checkout or create branch: `sync/<repo-name>/<branch>`
3. Copy changed files from target to clone
4. Commit with message: `sync: <repo-name>/<branch>`
5. Push to origin
6. Create or update PR

### PR Naming Convention

- **Branch:** `sync/<repo-name>/<source-branch>`
- **Title:** `sync: <repo-name>/<source-branch>`

### List Mode

With `--list`, only outputs files that would sync (no PR created):

```bash
claude-all-hands sync-back --list
# Outputs one file per line, suitable for scripting
```

### Temp Directory Cleanup

Clone is always cleaned up in `finally` block, even on errors.

---

## check-ignored Command

**File:** `src/commands/check-ignored.ts`

### Purpose

Filters input files through `.allhandsignore` patterns. Outputs files that are NOT ignored.

### Usage

```bash
# Filter file list
claude-all-hands check-ignored file1.ts file2.ts file3.ts
# Outputs only files not matching any ignore pattern
```

### Pattern Matching

Uses [minimatch](https://github.com/isaacs/minimatch) with `{ dot: true }` option:

```typescript
export function isIgnored(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(path, pattern, { dot: true }));
}
```

Patterns follow gitignore conventions:
- `*.md` - match all markdown files
- `dir/**` - match everything under directory
- `!important.md` - negation (not supported - only positive patterns)

---

## Edge Cases

### No AllHands Source

If `ALLHANDS_PATH` is not set and package location cannot be determined:

```
Could not locate allhands package. Ensure you are running via npx
or set ALLHANDS_PATH for local dev.
```

### Non-Git Target

Init warns but allows continuation with user confirmation. Other commands require git repo.

### Empty .allhandsignore

Returns empty pattern array - all files eligible for sync.

### GitHub Auth Failure

Sync-back checks auth before starting work:

```typescript
const authResult = ghCli(['auth', 'status'], targetRoot);
if (!authResult.success) {
  console.error('Run: gh auth login');
  return 1;
}
```
