---
description: Overview of claude-all-hands CLI tool for syncing Claude agent configurations across repositories. Covers architecture, installation, and quick start guide.
---

# claude-all-hands CLI

A CLI tool for distributing and synchronizing Claude agent configurations across multiple repositories. Enables centralized management of agents, skills, commands, hooks, and envoy tooling.

## Overview

claude-all-hands solves the problem of maintaining consistent Claude configurations across multiple projects. It provides:

- **Distribution**: Copy framework files (agents, skills, hooks) to target repositories
- **Updates**: Pull latest changes from the central allhands repository
- **Sync-back**: Contribute improvements back to the central repo via PR
- **Isolation**: Project-specific configurations remain separate from shared framework

## Architecture

```
claude-all-hands (central repo)
    |
    |-- .allhands-manifest.json  (controls distribution)
    |-- .claude/                  (framework files)
    |-- .husky/                   (git hooks)
    |-- src/                      (CLI source - internal only)
    |
    v
target-repo (your project)
    |
    |-- .allhandsignore           (project-specific exclusions)
    |-- CLAUDE.project.md         (project-specific instructions)
    |-- .claude/settings.local.json
    |-- .husky/project/           (project-specific hooks)
```

### Key Concepts

**Distributable Files**: Files marked in manifest that sync to target repos. Defined by glob patterns in `.allhands-manifest.json`.

**Internal Files**: Source code, build artifacts, docs - remain in central repo only.

**Project-Specific Files**: Configurations unique to each target repo. Migrated to dedicated paths (`CLAUDE.project.md`, `.husky/project/`) and excluded from sync-back via `.allhandsignore`.

**Manifest**: Central configuration at `.allhands-manifest.json` defining what gets distributed vs what stays internal.

## Installation

### Via npx (recommended)

```bash
npx claude-all-hands init /path/to/target-repo
```

### Via npm global install

```bash
npm install -g claude-all-hands
claude-all-hands init /path/to/target-repo
```

### Local Development

```bash
# Clone the repo
git clone https://github.com/kalem-edlin/claude-all-hands

# Set ALLHANDS_PATH for local testing
export ALLHANDS_PATH=/path/to/claude-all-hands

# Run commands
npx tsx src/cli.ts init /path/to/target-repo
```

## Quick Start

### 1. Initialize a Target Repository

```bash
npx claude-all-hands init ./my-project
```

This will:
- Migrate existing `CLAUDE.md` to `CLAUDE.project.md`
- Migrate existing hooks to `.husky/project/`
- Copy framework files
- Create `.allhandsignore` template
- Setup husky and envoy shell function

### 2. Update from Central Repo

```bash
cd my-project
npx claude-all-hands update
```

Pulls latest framework files. Warns before overwriting modified files.

### 3. Sync Changes Back

```bash
npx claude-all-hands sync-back
```

Creates PR to contribute improvements to the central repo. Files in `.allhandsignore` are excluded.

### 4. Check Ignored Files

```bash
npx claude-all-hands check-ignored .claude/agents/my-agent.md
```

Filters files through `.allhandsignore` patterns. Outputs files that would sync.

## Entry Points

| File | Purpose |
|------|---------|
| `src/cli.ts` | Main entry point, yargs command setup |
| `src/commands/init.ts` | Initialize target repository |
| `src/commands/update.ts` | Pull updates from central repo |
| `src/commands/sync-back.ts` | Create PR with changes |
| `src/commands/check-ignored.ts` | Filter through ignore patterns |
| `src/lib/git.ts` | Git and GitHub CLI wrappers |
| `src/lib/manifest.ts` | Manifest parsing and file filtering |
| `src/lib/paths.ts` | Path resolution utilities |

## Dependencies

- **Node.js**: >= 18
- **git**: Required for all commands
- **gh** (GitHub CLI): Required for `sync-back` (except `--list` mode)
- **yargs**: CLI argument parsing
- **minimatch**: Glob pattern matching

## Related Documentation

- [Commands Reference](./Commands.md) - Detailed command documentation
- [Internals](./Internals.md) - Implementation details
- [Configuration](./Configuration.md) - Manifest and ignore file format
