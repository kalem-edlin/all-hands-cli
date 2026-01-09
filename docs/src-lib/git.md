---
description: Git and GitHub CLI wrapper functions with consistent GitResult return type for error handling.
---

# git.ts - Git Operations

**Source:** `src/lib/git.ts`

## Overview

Provides synchronous wrappers for git and gh (GitHub CLI) commands. All operations return a `GitResult` object enabling consistent error handling.

## Types

### GitResult

```typescript
interface GitResult {
  success: boolean;  // true if exit code was 0
  stdout: string;    // trimmed stdout
  stderr: string;    // trimmed stderr
}
```

All git/gh functions return this type. Check `success` before using `stdout`.

## Core Functions

### git(args, cwd)

Execute a git command synchronously.

**Signature:**
```typescript
function git(args: string[], cwd: string): GitResult
```

**Parameters:**
- `args`: Array of git arguments (e.g., `['status', '--short']`)
- `cwd`: Working directory for the command

**Returns:** `GitResult` with command output

**Example:**
```typescript
import { git } from './lib/git';

const result = git(['log', '--oneline', '-5'], '/path/to/repo');
if (result.success) {
  console.log(result.stdout);
} else {
  console.error('Git failed:', result.stderr);
}
```

**Implementation Notes:**
- Uses `spawnSync` with 10MB buffer limit
- Output is automatically trimmed

---

### ghCli(args, cwd)

Execute a GitHub CLI command synchronously.

**Signature:**
```typescript
function ghCli(args: string[], cwd: string): GitResult
```

**Parameters:**
- `args`: Array of gh arguments (e.g., `['pr', 'list']`)
- `cwd`: Working directory for the command

**Returns:** `GitResult` with command output

**Example:**
```typescript
import { ghCli } from './lib/git';

const result = ghCli(['pr', 'view', '--json', 'title'], '/path/to/repo');
if (result.success) {
  const data = JSON.parse(result.stdout);
}
```

## Query Functions

### getCurrentBranch(repoPath)

Get the current branch name.

**Signature:**
```typescript
function getCurrentBranch(repoPath: string): string
```

**Returns:** Branch name, or empty string on failure.

---

### getRepoName(repoPath)

Get the repository name from the origin remote URL.

**Signature:**
```typescript
function getRepoName(repoPath: string): string
```

**Returns:** Repository name (without .git suffix), or directory name as fallback.

**Example:**
```typescript
// For remote: git@github.com:user/my-repo.git
getRepoName('/path/to/my-repo')  // Returns: "my-repo"
```

---

### getStagedFiles(repoPath)

Get the set of currently staged files.

**Signature:**
```typescript
function getStagedFiles(repoPath: string): Set<string>
```

**Returns:** Set of file paths staged for commit.

---

### isGitRepo(path)

Check if a path is inside a git repository.

**Signature:**
```typescript
function isGitRepo(path: string): boolean
```

**Returns:** `true` if the path is within a git repository.

## Availability Checks

### checkGitInstalled()

Check if git is available on the system.

**Signature:**
```typescript
function checkGitInstalled(): boolean
```

---

### checkGhInstalled()

Check if GitHub CLI is available on the system.

**Signature:**
```typescript
function checkGhInstalled(): boolean
```

## Error Handling

The module never throws exceptions for git failures. Instead:
- Command failures return `{ success: false, stderr: "error message" }`
- Query functions return empty values on failure (empty string, empty Set)
- Availability checks return `false` if tool not found

**Recommended pattern:**
```typescript
const result = git(['push'], repoPath);
if (!result.success) {
  // Handle error - check result.stderr for details
  return { error: result.stderr };
}
// Safe to use result.stdout
```

## Usage by Commands

This module is the foundation for:
- Distribution commands (commit hooks, file staging)
- GitHub integration (PR creation, issue lookup)
- Repository validation checks
