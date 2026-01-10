---
description: NPM CLI for syncing agent configurations between repositories using file distribution rather than git submodules, enabling bidirectional flow of improvements between source and consumer repos.
---

# Claude All-Hands

## Overview

Claude All-Hands solves the challenge of sharing Claude agent configurations across multiple repositories while allowing improvements to flow back to the source. The fundamental problem: when you improve an agent pattern in one project, how do you propagate that improvement to all other projects using the same framework?

The solution uses NPM distribution combined with file copying and a bidirectional sync mechanism. Rather than using git submodules which create tight coupling and merge complexity, or publishing immutable NPM packages which prevent improvement contributions, All-Hands treats the NPM package as a distribution vehicle for mutable configuration files.

## Key Decisions

### File Distribution Over Git Submodules

Git submodules were rejected because they create friction when consumer repos want to contribute improvements back. With submodules, changes require navigating nested repos, separate commits, and coordinated merges. The All-Hands approach copies files directly into consumer repos, making them first-class citizens that can be modified and committed normally. The trade-off is that updates require explicit sync commands rather than automatic submodule updates.

### Manifest-Based Distribution Control

The manifest system [ref:.allhands-manifest.json::469899d] defines three file categories: distributable files that get copied to consumer repos, internal files that stay in the source package, and excluded files like caches and local settings. This separation ensures consumers receive exactly what they need without package internals cluttering their repos.

The [ref:src/lib/manifest.ts:Manifest:08260ea] class implements pattern matching using minimatch globs, enabling flexible rules like distributing all agents while excluding Python bytecode.

### Project-Specific File Migration

When initializing a repo that already has Claude configurations, the system faces a conflict: existing files like CLAUDE.md would be overwritten by framework defaults. Rather than lose project-specific customizations, the init process migrates existing files to designated project-specific locations defined in [ref:src/commands/init.ts:MIGRATION_MAP:08260ea].

This preserves the user's work while still installing the framework. The migration targets like CLAUDE.project.md and .claude/settings.local.json are automatically added to .allhandsignore to prevent them from syncing back to source.

### Bidirectional Sync with PR Workflow

The sync-back mechanism [ref:src/commands/sync-back.ts:cmdSyncBack:08260ea] enables improvements made in consumer repos to flow back to the source. Rather than direct pushes which would bypass review, changes create PRs against the upstream repository. This ensures quality control while maintaining the improvement feedback loop.

The workflow clones the source repo to a temp directory [ref:src/commands/sync-back.ts:cloneAllhandsToTemp:08260ea] to avoid contaminating the consumer repo's git state, then commits changes and opens a PR via the GitHub CLI.

### Protected Branch Gating for Auto-Sync

In automated mode, sync-back only triggers on protected branches [ref:src/commands/sync-back.ts:PROTECTED_BRANCHES:08260ea] like main or master. This prevents noise from feature branch experiments while ensuring merged improvements get proposed upstream. Consumer repos can configure GitHub Actions to run sync-back on merge, creating an automatic contribution pipeline.

### Ignore Patterns for Customization Boundaries

The .allhandsignore file uses gitignore-style patterns to define what should NOT sync back to source. The [ref:src/lib/manifest.ts:loadIgnorePatterns:08260ea] function reads these patterns, and [ref:src/lib/manifest.ts:isIgnored:08260ea] filters files during sync-back.

This creates a clear contract: add patterns for project-specific customizations that only make sense locally. Anything not ignored is considered a potential contribution to the shared framework.

## Patterns

### Conflict Detection Before Operations

Both init and update commands check for potential conflicts before making changes. The update command specifically detects staged changes to managed files and aborts with guidance to stash or commit first. This prevents accidental loss of work-in-progress modifications.

### Source Resolution Priority

The [ref:src/lib/paths.ts:getAllhandsRoot:08260ea] function implements a resolution chain for finding the source files: first checking ALLHANDS_PATH environment variable for development workflows, then falling back to the installed package location for production use. This supports both npx execution and local development without configuration changes.

### Gitignore Synchronization

Framework files often need gitignore entries in consumer repos. Rather than requiring manual maintenance, [ref:src/commands/init.ts:syncGitignore:42312c4] merges source gitignore entries into the target, adding only what is missing. This ensures framework files like local settings stay untracked across all consumer repos.

## Technologies

The CLI uses yargs for command parsing, minimatch for glob pattern matching, and the GitHub CLI for PR creation. It bundles to a single executable via esbuild targeting Node 18+, enabling npx execution without manual installation.

## Use Cases

### Initial Framework Adoption

A team starting a new project runs init to copy the shared agent configurations into their repo. Existing project-specific settings migrate to designated locations, and they immediately have access to all shared agents, skills, and commands while retaining their customizations.

### Keeping Consumer Repos Current

When the source framework receives improvements from any contributor, maintainers of consumer repos run update to pull the latest files. The command shows what will change, prompts for confirmation on overwrites, and preserves project-specific files.

### Contributing Improvements Upstream

After improving an agent or skill during project work, the developer runs sync-back to propose the change to the source. The system identifies which managed files changed, creates a branch and PR with clear provenance indicating which repo and branch the changes came from.

### CI/CD Integration

Teams configure GitHub Actions to run sync-back automatically when PRs merge to protected branches. This creates a continuous improvement loop where battle-tested changes from production use flow back to benefit all consumer repos.
