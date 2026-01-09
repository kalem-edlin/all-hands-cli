---
description: Overview of src/lib utilities providing git operations, manifest handling, and path resolution for the allhands CLI.
---

# src/lib - Core Library Utilities

## Overview

The `src/lib/` directory contains foundational utilities used across the allhands CLI. These modules provide:

- **git.ts**: Git and GitHub CLI wrappers with consistent error handling
- **manifest.ts**: Manifest file parsing for distribution configuration
- **paths.ts**: Path resolution for locating the allhands package root

## Architecture

```
src/lib/
├── git.ts       # Git/gh command execution
├── manifest.ts  # .allhands-manifest.json handling
└── paths.ts     # Package root resolution
```

## Key Concepts

### GitResult Pattern
All git operations return a `GitResult` object with `success`, `stdout`, and `stderr` fields. Callers should check `success` before using output.

### Manifest-Based Distribution
The `Manifest` class reads `.allhands-manifest.json` to determine which files are distributable, internal, or excluded. Uses glob patterns via minimatch.

### Multi-Source Path Resolution
`getAllhandsRoot()` tries environment variable first, then falls back to package location for npx usage.

## Dependencies

These modules are consumed by:
- `src/commands/*.ts` - CLI command implementations
- `.claude/envoy/` - Agent coordination tooling

## Entry Points

| Module | Primary Export | Purpose |
|--------|----------------|---------|
| git.ts | `git()` | Execute git commands |
| manifest.ts | `Manifest` | Access manifest configuration |
| paths.ts | `getAllhandsRoot()` | Locate package root |

## Related Documentation

- [git.ts API](./git.md) - Full git module reference
- [manifest.ts API](./manifest.md) - Manifest class reference
- [paths.ts API](./paths.md) - Path utilities reference
