---
description: Manifest class for parsing .allhands-manifest.json and determining file distribution rules via glob patterns.
---

# manifest.ts - Manifest Handling

**Source:** `src/lib/manifest.ts`

## Overview

Provides the `Manifest` class for reading and querying `.allhands-manifest.json` configuration. Also includes standalone functions for `.allhandsignore` file handling.

## Manifest File Format

The `.allhands-manifest.json` file defines which files should be distributed:

```json
{
  "distribute": ["src/**/*.ts", "bin/*"],
  "internal": ["src/internal/**"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

All patterns use glob syntax (via minimatch with `dot: true`).

## Manifest Class

### Constructor

```typescript
class Manifest {
  constructor(allhandsRoot: string)
}
```

**Parameters:**
- `allhandsRoot`: Absolute path to the allhands package root

**Throws:** `Error` if `.allhands-manifest.json` not found at expected location.

**Example:**
```typescript
import { Manifest } from './lib/manifest';

const manifest = new Manifest('/path/to/allhands');
```

### Properties

#### distributePatterns

```typescript
get distributePatterns(): string[]
```

Glob patterns for files that should be distributed. Defaults to empty array.

---

#### internalPatterns

```typescript
get internalPatterns(): string[]
```

Glob patterns for internal-only files. Defaults to empty array.

---

#### excludePatterns

```typescript
get excludePatterns(): string[]
```

Glob patterns for files to exclude from distribution. Defaults to empty array.

### Query Methods

#### isDistributable(path)

Check if a file path matches distribution patterns.

```typescript
isDistributable(path: string): boolean
```

**Parameters:**
- `path`: Relative file path to check

**Returns:** `true` if path matches any distribute pattern.

---

#### isInternal(path)

Check if a file path matches internal patterns.

```typescript
isInternal(path: string): boolean
```

---

#### isExcluded(path)

Check if a file path matches exclusion patterns.

```typescript
isExcluded(path: string): boolean
```

### File Collection

#### getDistributableFiles()

Get all files that should be distributed.

```typescript
getDistributableFiles(): Set<string>
```

**Returns:** Set of relative file paths that:
1. Match at least one `distribute` pattern
2. Do NOT match any `exclude` pattern

**Implementation Notes:**
- Recursively walks directory starting from allhandsRoot
- Skips `.git` and `node_modules` directories
- Returns paths relative to allhandsRoot

**Example:**
```typescript
const manifest = new Manifest('/path/to/allhands');
const files = manifest.getDistributableFiles();
// Set { "src/index.ts", "src/lib/git.ts", "bin/cli.js", ... }
```

## Standalone Functions

### loadIgnorePatterns(targetRoot)

Load patterns from a `.allhandsignore` file.

**Signature:**
```typescript
function loadIgnorePatterns(targetRoot: string): string[]
```

**Parameters:**
- `targetRoot`: Directory containing `.allhandsignore`

**Returns:** Array of glob patterns. Empty array if file not found.

**File Format:**
```
# Comment lines are ignored
*.log
temp/**
build/
```

---

### isIgnored(path, patterns)

Check if a path matches any ignore pattern.

**Signature:**
```typescript
function isIgnored(path: string, patterns: string[]): boolean
```

**Parameters:**
- `path`: File path to check
- `patterns`: Array of glob patterns

**Returns:** `true` if path matches any pattern.

## Pattern Matching

All pattern matching uses [minimatch](https://github.com/isaacs/minimatch) with options:
- `dot: true` - Matches dotfiles (e.g., `.gitignore`)

**Common patterns:**
- `**/*.ts` - All TypeScript files in any directory
- `src/**` - Everything under src/
- `*.md` - Markdown files in root only
- `!test/**` - Negation not supported (use exclude array instead)

## Error Handling

- Constructor throws if manifest file not found
- JSON parse errors propagate as-is
- Pattern arrays default to empty if not specified

## Usage Example

```typescript
import { Manifest, loadIgnorePatterns, isIgnored } from './lib/manifest';

const manifest = new Manifest('/path/to/allhands');
const ignorePatterns = loadIgnorePatterns('/path/to/target');

// Get files to distribute, excluding ignored
const distributable = manifest.getDistributableFiles();
const toSync: string[] = [];

for (const file of distributable) {
  if (!isIgnored(file, ignorePatterns)) {
    toSync.push(file);
  }
}
```
