---
description: NPM CLI for syncing agent configurations from source to consumer repositories using file distribution, with conflict handling and project-specific file preservation.
---

# Claude All-Hands

## Overview

Claude All-Hands solves the challenge of sharing Claude agent configurations across multiple repositories. The fundamental problem: how do you distribute a shared framework of agents, skills, hooks, and commands to multiple projects while preserving project-specific customizations?

The solution uses NPM distribution combined with file copying. Rather than using git submodules which create tight coupling and merge complexity, All-Hands treats the NPM package as a distribution vehicle for configuration files that get copied directly into consumer repos.

## Key Decisions

### File Distribution Over Git Submodules

Git submodules were rejected because they create friction and merge complexity. The All-Hands approach copies files directly into consumer repos, making them first-class citizens. The trade-off is that updates require explicit sync commands rather than automatic submodule updates.

### Manifest-Based Distribution Control

The manifest system [ref:.allhands-manifest.json::469899d] defines three file categories: distributable files that get copied to consumer repos, internal files that stay in the source package, and excluded files like caches and local settings. This separation ensures consumers receive exactly what they need without package internals cluttering their repos.

The [ref:src/lib/manifest.ts:Manifest:08260ea] class implements pattern matching using minimatch globs, enabling flexible rules like distributing all agents while excluding Python bytecode.

### Project-Specific File Preservation

When initializing or updating a repo, the system handles CLAUDE.md specially:
- If user has CLAUDE.md but no CLAUDE.project.md → migrates theirs to CLAUDE.project.md, then distributes framework CLAUDE.md
- If user has both and CLAUDE.md differs → treated as a conflict
- If user has neither → distributes both files

Project-specific files like CLAUDE.project.md and .claude/settings.local.json are excluded from distribution and preserved during updates.

### Conflict Handling with User Choice

When distributable files conflict with existing target files (content differs), the CLI presents three options:
1. **Backup**: Create `file.backup_N.ext` (auto-incrementing N) and overwrite
2. **Overwrite**: Replace all conflicting files
3. **Cancel**: Abort operation, make no changes

This ensures users never lose work unexpectedly while still enabling updates.

## Patterns

### Conflict Detection Before Operations

Both init and update commands check for potential conflicts before making changes. The update command specifically detects staged changes to managed files and aborts with guidance to stash or commit first. This prevents accidental loss of work-in-progress modifications.

### Source Resolution Priority

The [ref:src/lib/paths.ts:getAllhandsRoot:08260ea] function implements a resolution chain for finding the source files: first checking ALLHANDS_PATH environment variable for development workflows, then falling back to the installed package location for production use. This supports both npx execution and local development without configuration changes.

### Gitignore Synchronization

Framework files often need gitignore entries in consumer repos. Rather than requiring manual maintenance, [ref:src/commands/init.ts:syncGitignore:42312c4] merges source gitignore entries into the target, adding only what is missing. This ensures framework files like local settings stay untracked across all consumer repos.

## Technologies

The CLI uses yargs for command parsing, minimatch for glob pattern matching. It bundles to a single executable via esbuild targeting Node 18+, enabling npx execution without manual installation.

## Use Cases

### Initial Framework Adoption

A team starting a new project runs `init` to copy the shared agent configurations into their repo. Existing CLAUDE.md migrates to CLAUDE.project.md, and they immediately have access to all shared agents, skills, and commands while retaining their customizations.

### Keeping Consumer Repos Current

When the source framework receives improvements, maintainers of consumer repos run `update` to pull the latest files. The command detects conflicts, offers backup/overwrite/cancel options, and preserves project-specific files.

### Commands

```bash
# Initialize allhands in a target repo
claude-all-hands init <target-path>
claude-all-hands init <target-path> --yes  # Auto-overwrite conflicts

# Update current repo from allhands source
claude-all-hands update
claude-all-hands update --yes  # Auto-overwrite conflicts
```
