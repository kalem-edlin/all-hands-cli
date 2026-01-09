---
description: Configuration reference for claude-all-hands including .allhands-manifest.json schema, .allhandsignore patterns, and .gitignore integration.
---

# Configuration

## .allhands-manifest.json

Central configuration file defining file distribution behavior.

**Location**: Repository root (allhands source)

### Schema

```json
{
  "$comment": "Description of manifest purpose",
  "distribute": ["pattern1", "pattern2"],
  "exclude": ["pattern1", "pattern2"],
  "internal": ["pattern1", "pattern2"]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$comment` | string | No | Documentation comment |
| `distribute` | string[] | Yes | Glob patterns for distributable files |
| `exclude` | string[] | No | Glob patterns to exclude from all operations |
| `internal` | string[] | No | Glob patterns for internal-only files |

### Pattern Syntax

Uses [minimatch](https://github.com/isaacs/minimatch) glob patterns with `dot: true`.

| Pattern | Matches |
|---------|---------|
| `*.md` | Root-level markdown files |
| `**/*.ts` | All TypeScript files recursively |
| `.claude/**` | Everything under `.claude/` |
| `!.git/**` | Negation (exclude `.git/`) |
| `.husky/*` | Direct children of `.husky/` |

### Example Manifest

```json
{
  "$comment": "AllHands Distribution Manifest",
  "distribute": [
    ".claude/agents/**",
    ".claude/skills/**",
    ".claude/commands/**",
    ".claude/hooks/**",
    ".claude/envoy/**",
    ".claude/output-styles/**",
    ".claude/settings.json",
    ".husky/**",
    ".github/workflows/allhands-sync.yml",
    "CLAUDE.md",
    "CLAUDE.project.md"
  ],
  "exclude": [
    "**/.venv/**",
    "**/__pycache__/**",
    "**/*.pyc",
    "**/.git/**",
    "**/.DS_Store",
    ".claude/settings.local.json",
    ".claude/plans/**",
    "pnpm-lock.yaml"
  ],
  "internal": [
    "src/**",
    "bin/**",
    "tsconfig.json",
    "scripts/**",
    ".allhands-manifest.json",
    ".github/**",
    "docs/**",
    "README.md",
    "package.json",
    "package-lock.json"
  ]
}
```

### Distribution Logic

A file is distributable if:
1. Path matches at least one `distribute` pattern
2. Path does NOT match any `exclude` pattern

The `internal` field is informational - helps document what stays in the source repo.

---

## .allhandsignore

Project-specific exclusions from sync-back.

**Location**: Target repository root

### Purpose

Prevents project-specific files from being synced back to the central allhands repo. Similar to `.gitignore` but for the sync-back operation.

### Syntax

- One pattern per line
- Lines starting with `#` are comments
- Empty lines are ignored
- Uses gitignore-style glob patterns

### Default Template

Created by `claude-all-hands init`:

```gitignore
# AllHands Ignore - Exclude files from sync-back to claude-all-hands

# Project-specific files (auto-added)
CLAUDE.project.md
.claude/settings.local.json
.husky/project/**

# Project-specific agents
# .claude/agents/my-project-specialist.md

# Project-specific skills
# .claude/skills/my-domain-skill/**

# Project-specific commands
# .claude/commands/my-project-command.md
```

### Guidelines

**Add to .allhandsignore** (project-specific):
- Project-specific agents and skills
- Local configurations
- Domain-specific hooks
- Files only relevant to this project

**Do NOT add** (should sync back):
- Bug fixes to framework files
- Reusable patterns discovered during development
- Documentation improvements
- Hook/envoy enhancements

### Pattern Examples

```gitignore
# Single file
.claude/agents/my-company-agent.md

# Directory with all contents
.claude/skills/domain-specific/**

# All files with extension
.claude/commands/*.local.md

# Complex patterns
.husky/project/**
.claude/**/local-*
```

---

## .gitignore Integration

### Sync Behavior

During `init`, allhands syncs `.gitignore` entries from source to target:

1. Reads source repo's `.gitignore`
2. Extracts non-comment, non-empty lines
3. Compares with target's `.gitignore`
4. Appends missing entries with header

### Example Output

Target `.gitignore` after init:

```gitignore
# Existing project ignores
node_modules/
dist/

# AllHands framework ignores
.claude/plans/
*.pyc
.DS_Store
```

### Important Entries

Typical allhands `.gitignore` entries:

```gitignore
# Claude plans (temporary)
.claude/plans/

# Python artifacts
**/.venv/**
**/__pycache__/**
**/*.pyc

# OS files
**/.DS_Store

# Local settings
.claude/settings.local.json
```

---

## Environment Variables

### ALLHANDS_PATH

Override the allhands source location for local development.

```bash
export ALLHANDS_PATH=/home/user/dev/claude-all-hands
claude-all-hands update
```

When set:
- Must point to directory containing `.allhands-manifest.json`
- Takes precedence over package location
- Useful for testing changes before publishing

When not set:
- CLI locates manifest relative to installed package

---

## Auto-Sync Configuration

### GitHub Secret

For automatic sync-back on protected branches, configure:

```bash
gh secret set ALL_HANDS_SYNC_TOKEN --repo <your-repo>
```

This PAT needs `repo` scope for creating PRs.

### Workflow File

Distributed via manifest: `.github/workflows/allhands-sync.yml`

Triggers sync-back automatically when:
- PR merged to main/master
- Direct push to protected branch

---

## Troubleshooting

### "Manifest not found" Error

**Cause**: Can't locate `.allhands-manifest.json`

**Solutions**:
1. If local dev: Set `ALLHANDS_PATH`
2. If npx: Reinstall with `npx --ignore-existing claude-all-hands@latest`

### Files Not Syncing

**Cause**: Pattern mismatch or ignore rule

**Debug**:
```bash
# Check if file would sync
claude-all-hands check-ignored path/to/file.md
# No output = ignored
# Path output = would sync

# List all files that would sync
claude-all-hands sync-back --list
```

### Update Blocked by Staged Changes

**Cause**: You have staged changes to files managed by allhands

**Solutions**:
```bash
# Commit your changes first
git commit -m "..."

# Or stash them
git stash

# Then update
claude-all-hands update

# Pop stash if needed
git stash pop
```
