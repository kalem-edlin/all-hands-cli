---
description: Implementation details for claude-all-hands CLI including git utilities, manifest parsing, path resolution, and internal helper functions.
---

# Internals

Implementation details of the claude-all-hands CLI.

## Git Utilities

**File**: `src/lib/git.ts`

### GitResult Interface

```typescript
interface GitResult {
  success: boolean;  // true if exit code 0
  stdout: string;    // trimmed stdout
  stderr: string;    // trimmed stderr
}
```

### Core Functions

#### `git(args, cwd)`

Wrapper around `spawnSync('git', ...)` with consistent result handling.

```typescript
const result = git(['status', '--short'], '/path/to/repo');
if (result.success) {
  console.log(result.stdout);
}
```

- Max buffer: 10MB
- Encoding: utf-8
- Returns `GitResult`

#### `ghCli(args, cwd)`

Same pattern for GitHub CLI commands.

```typescript
const result = ghCli(['pr', 'view', 'main'], cwd);
```

### Helper Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getCurrentBranch(path)` | `string` | Current branch name or empty |
| `getRepoName(path)` | `string` | Repo name from remote URL |
| `getStagedFiles(path)` | `Set<string>` | Paths of staged files |
| `isGitRepo(path)` | `boolean` | Check for `.git` directory |
| `checkGitInstalled()` | `boolean` | Verify git available |
| `checkGhInstalled()` | `boolean` | Verify gh CLI available |

### Implementation Notes

- `getRepoName` extracts from `git remote get-url origin`, stripping `.git` suffix
- Falls back to directory name if no remote
- All git calls use synchronous spawn for simplicity

---

## Manifest System

**File**: `src/lib/manifest.ts`

### Manifest Class

Parses `.allhands-manifest.json` and provides file filtering.

```typescript
const manifest = new Manifest('/path/to/allhands');

// Get all distributable files
const files = manifest.getDistributableFiles(); // Set<string>

// Check single path
manifest.isDistributable('CLAUDE.md');  // true
manifest.isExcluded('.git/config');     // true
manifest.isInternal('src/cli.ts');      // true
```

### Pattern Matching

Uses `minimatch` with `{ dot: true }` option to match dotfiles.

```typescript
private matches(path: string, pattern: string): boolean {
  return minimatch(path, pattern, { dot: true });
}
```

### getDistributableFiles()

1. Walks entire allhands directory (skips `.git`, `node_modules`)
2. Filters to files matching `distribute` patterns
3. Excludes files matching `exclude` patterns
4. Returns `Set<string>` of relative paths

### Ignore Pattern Loading

```typescript
// Load patterns from target repo's .allhandsignore
const patterns = loadIgnorePatterns('/path/to/target');

// Check if path is ignored
if (isIgnored('CLAUDE.project.md', patterns)) {
  // skip this file
}
```

Pattern file format:
- One pattern per line
- Lines starting with `#` are comments
- Empty lines ignored
- Uses gitignore-style glob patterns

---

## Path Resolution

**File**: `src/lib/paths.ts`

### getAllhandsRoot()

Locates the allhands package directory. Resolution order:

1. **ALLHANDS_PATH env var** - For local development
   - Must exist and contain `.allhands-manifest.json`

2. **Package location** - For npx/npm usage
   - Resolves from `import.meta.url`
   - Tries `../` then `../../` relative to script

```typescript
// Local dev
export ALLHANDS_PATH=/home/user/claude-all-hands
npx tsx src/cli.ts update

// Package usage (npx)
// Automatically finds package root
npx claude-all-hands update
```

### Constants

```typescript
export const UPSTREAM_REPO = 'kalem-edlin/claude-all-hands';
export const UPSTREAM_OWNER = 'kalem-edlin';
```

---

## Command Implementations

### init Command Helpers

**File**: `src/commands/init.ts`

#### Migration Map

```typescript
const MIGRATION_MAP: Record<string, string> = {
  'CLAUDE.md': 'CLAUDE.project.md',
  '.claude/settings.json': '.claude/settings.local.json',
};
```

#### Husky Hooks

Hooks that get migrated to `project/` subdirectory:

```typescript
const HUSKY_HOOKS = [
  'pre-commit', 'post-merge', 'commit-msg',
  'pre-push', 'pre-rebase', 'post-checkout', 'post-rewrite'
];
```

#### migrateExistingFiles(target)

1. Migrates files per `MIGRATION_MAP`
2. Moves existing husky hooks to `.husky/project/`
3. Skips hooks that reference claude/project paths (already framework hooks)

#### syncGitignore(allhandsRoot, target)

Merges gitignore entries:
1. Reads source `.gitignore`
2. Reads target `.gitignore`
3. Adds missing entries with header comment
4. Returns `{ added: string[], unchanged: boolean }`

#### setupEnvoyShellFunction()

Adds envoy shell function to shell rc file:

```bash
envoy() {
  "$PWD/.claude/envoy/envoy" "$@"
}
```

Detects shell from `$SHELL` env var:
- zsh: `~/.zshrc`
- bash: `~/.bash_profile` or `~/.bashrc`

### sync-back Command Helpers

**File**: `src/commands/sync-back.ts`

#### Protected Branches

```typescript
const PROTECTED_BRANCHES = new Set([
  'main', 'master', 'develop', 'staging', 'production'
]);
```

Auto mode only triggers on these branches.

#### getChangedManagedFiles(...)

Finds modified distributable files:
1. Iterates manifest distributable files
2. Skips files in `.allhandsignore`
3. Compares content between source and target
4. Returns array of changed relative paths

#### getNewFilesInManagedDirs(...)

Finds new files in `.claude/` directory:
1. Walks target `.claude/` directory
2. Filters through ignore patterns
3. Checks if file exists in allhands source
4. Returns array of new file paths

#### cloneAllhandsToTemp()

Clones upstream to temp directory for clean sync:
```typescript
const tempDir = join(tmpdir(), `allhands-sync-${Date.now()}`);
ghCli(['repo', 'clone', UPSTREAM_REPO, tempDir, '--', '--depth=1']);
```

---

## Error Handling

### Confirm Helper

Used by init and update for interactive prompts:

```typescript
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({...});
  return new Promise((resolve) => {
    rl.question(`${message} [y/N]: `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
```

Default is `N` (no) - user must explicitly type `y`.

### Exit Codes

All commands return numeric exit codes:
- `0`: Success
- `1`: Error (with message to stderr)

Commands call `process.exit(code)` in CLI wrapper.

---

## Build System

### esbuild Configuration

```json
{
  "scripts": {
    "build": "esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=bin/cli.js --format=esm --banner:js=\"#!/usr/bin/env node\""
  }
}
```

Output: Single bundled ESM file at `bin/cli.js` with shebang.

### Package Distribution

Files included in npm package:
```json
{
  "files": ["bin/", ".claude/"]
}
```

This excludes `src/`, `docs/`, etc. from the published package.
