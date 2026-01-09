---
description: Path resolution utilities for locating the allhands package root in both development and npx usage scenarios.
---

# paths.ts - Path Resolution

**Source:** `src/lib/paths.ts`

## Overview

Provides utilities for locating the allhands package root directory. Handles both local development (via environment variable) and production usage (via npx).

## Constants

### UPSTREAM_REPO

```typescript
const UPSTREAM_REPO = 'kalem-edlin/claude-all-hands'
```

Full repository identifier for the upstream allhands repo.

---

### UPSTREAM_OWNER

```typescript
const UPSTREAM_OWNER = 'kalem-edlin'
```

GitHub owner of the upstream repository.

## Functions

### getAllhandsRoot()

Locate the allhands package root directory.

**Signature:**
```typescript
function getAllhandsRoot(): string
```

**Returns:** Absolute path to the allhands package root.

**Throws:** `Error` if package cannot be located.

**Resolution Order:**

1. **Environment Variable** (`ALLHANDS_PATH`)
   - Checks if `ALLHANDS_PATH` env var is set
   - Validates the path exists and contains `.allhands-manifest.json`
   - Used for local development/testing

2. **Package Location** (npx usage)
   - Resolves path relative to the executing script
   - Tries one level up from `bin/` directory
   - Falls back to two levels up for `dist/lib/` structure

**Example:**
```typescript
import { getAllhandsRoot } from './lib/paths';

// In development with ALLHANDS_PATH=/home/user/dev/allhands
const root = getAllhandsRoot();
// Returns: "/home/user/dev/allhands"

// Via npx (package at /tmp/.npx/allhands)
const root = getAllhandsRoot();
// Returns: "/tmp/.npx/allhands"
```

## Environment Variables

### ALLHANDS_PATH

Set this environment variable to override package root detection.

**Usage:**
```bash
# For local development
export ALLHANDS_PATH=/path/to/local/allhands

# Or inline
ALLHANDS_PATH=/path/to/dev allhands sync
```

**Validation:**
- Path must exist
- Path must contain `.allhands-manifest.json`
- If validation fails, falls back to package location

## Directory Structure Assumptions

The resolution logic assumes one of these structures:

**npx/installed package:**
```
package-root/
├── .allhands-manifest.json
├── bin/
│   └── cli.js          <- import.meta.url resolves here
└── ...
```

**Alternative (dist build):**
```
package-root/
├── .allhands-manifest.json
├── dist/
│   └── lib/
│       └── paths.js    <- import.meta.url resolves here
└── ...
```

## Error Handling

The function throws a descriptive error if the package cannot be located:

```
Error: Could not locate allhands package. Ensure you are running via npx or set ALLHANDS_PATH for local dev.
```

**Common causes:**
- Running from an unexpected directory structure
- Missing `.allhands-manifest.json` file
- Incomplete package installation

## Usage by Other Modules

This module is imported by:
- `src/lib/manifest.ts` - Needs root to locate manifest file
- `src/commands/*.ts` - Commands that read package files

**Typical pattern:**
```typescript
import { getAllhandsRoot } from './lib/paths';
import { Manifest } from './lib/manifest';

const root = getAllhandsRoot();
const manifest = new Manifest(root);
```

## ESM Considerations

Uses ES module features for path resolution:
- `import.meta.url` - Gets URL of current module
- `fileURLToPath` - Converts file:// URL to path
- `dirname` - Extracts directory from path

This requires the package to be running in ESM mode (`"type": "module"` in package.json or `.mjs` extension).
