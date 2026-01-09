---
description: Overview of Claude Code hooks system and slash command definitions. Covers validation scripts, tool interception, and command interfaces.
---

# Hooks and Commands

## Overview

This domain covers two core Claude Code extension systems:

1. **Hooks**: Python scripts that intercept tool usage and validate artifacts at runtime
2. **Commands**: Markdown-based slash command definitions that orchestrate complex workflows

## Architecture

### Hook System

Hooks are registered in `.claude/settings.json` and triggered at specific lifecycle events:

| Event | When Triggered | Purpose |
|-------|----------------|---------|
| SessionStart | Agent initialization | Setup, validation, status reporting |
| PreToolUse | Before tool execution | Intercept, redirect, or block tools |

Hooks communicate via JSON on stdin/stdout. Output format depends on hook type:
- **SessionStart**: `{ systemMessage: string }` - shown to agent
- **PreToolUse**: `{ continue: boolean, additionalContext?: string }` or permission decision

### Command System

Commands are markdown files in `.claude/commands/` with:
- YAML frontmatter (`description`, `argument-hint`)
- Process steps defining workflow
- Success criteria and constraints
- Knowledge banks for domain expertise

## Entry Points

- **Startup**: `.claude/hooks/startup.sh` - main session initialization
- **Settings**: `.claude/settings.json` - hook registration and configuration
- **Commands**: `.claude/commands/*.md` - slash command definitions

## Hook Categories

### Validation Hooks (SessionStart)

Run at session startup to ensure artifact integrity:

| Script | Validates |
|--------|-----------|
| `validate_artifacts.py` | Agents, skills, commands (frontmatter, naming) |
| `scan_agents.py` | Agent files only |
| `scan_skills.py` | Skill directories only |
| `scan_commands.py` | Command files only |

### Tool Interception Hooks (PreToolUse)

Intercept and redirect tool usage:

| Script | Blocks | Redirects To |
|--------|--------|--------------|
| `github_url_to_gh.py` | GitHub URLs in WebFetch/curl/wget | `gh` CLI |
| `enforce_research_fetch.py` | WebFetch calls | Researcher agent |
| `enforce_research_search.py` | WebSearch calls | Researcher agent |

## Command Categories

### Workflow Commands

| Command | Purpose | Modes |
|---------|---------|-------|
| `/plan` | Feature planning workflow | `--quick`, `--create`, `--refine` |
| `/continue` | Execute plan prompts | - |
| `/debug` | Bug investigation workflow | `--quick`, `--create`, `--refine` |
| `/whats-next` | Post-completion suggestions | - |

### Artifact Creation Commands

| Command | Creates |
|---------|---------|
| `/create-specialist` | New specialist agent |
| `/create-skill` | New skill directory |

### Documentation Commands

| Command | Purpose |
|---------|---------|
| `/docs-init` | Full codebase documentation |
| `/docs-adjust` | Incremental doc updates |
| `/docs-audit` | Validate symbol references |

### Utility Commands

| Command | Purpose |
|---------|---------|
| `/validate` | Run artifact validation |
| `/curator-audit` | Placeholder (not implemented) |
