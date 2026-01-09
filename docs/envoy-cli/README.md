---
description: Core documentation for the envoy CLI tool - a command-line interface providing agent-scoped external tool access for Claude agents. Covers architecture, command groups, and usage patterns.
---

# Envoy CLI

## Overview

Envoy is a CLI tool (`npx envoy <command>`) that provides Claude agents with structured access to external tools and plan orchestration. It serves as the primary interface between agents and:

- External AI APIs (Gemini, Perplexity, Tavily, xAI Grok)
- Git operations and GitHub integration
- Plan lifecycle management
- Knowledge base search
- Code documentation utilities

All commands return JSON responses with a consistent structure:

```typescript
interface CommandResult {
  status: "success" | "error";
  data?: Record<string, unknown>;
  error?: {
    type: string;
    message: string;
    command?: string;
    suggestion?: string;
  };
  metadata?: Record<string, unknown>;
}
```

## Architecture

### Command Discovery

Commands are auto-discovered from `.claude/envoy/src/commands/`. Each command module exports a `COMMANDS` object mapping subcommand names to command classes:

```typescript
export const COMMANDS = {
  search: SearchCommand,
  extract: ExtractCommand,
};
```

The CLI router (`cli.ts`) dynamically loads all command modules and registers them with Commander.js.

### Base Command Pattern

All commands extend `BaseCommand` which provides:

- **Argument definition**: `defineArguments(cmd: Command): void`
- **Execution**: `execute(args: Record<string, unknown>): Promise<CommandResult>`
- **Instrumented execution**: `executeWithLogging()` wraps execution with observability
- **Response helpers**: `success()`, `error()` for consistent responses
- **Utilities**: `readFile()`, `readFiles()`, `timedExecute()`

### Command Groups

| Group | Description | Key Commands |
|-------|-------------|--------------|
| `docs` | Documentation symbol references | format-reference, validate, complexity, tree |
| `git` | Git/GitHub operations | get-base-branch, diff-base, create-pr, merge-worktree |
| `gemini` | Gemini AI integration | ask, validate, architect, audit, review |
| `knowledge` | Semantic search | search, reindex-all, reindex-from-changes, status |
| `plan` | Plan lifecycle | init, status, write-prompt, next, complete |
| `perplexity` | Deep research | research |
| `tavily` | Web search/extract | search, extract |
| `xai` | X/Twitter search | search |
| `repomix` | Code extraction | estimate, extract |

## Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVOY_TIMEOUT_MS` | 120000 | Default command timeout |
| `PERPLEXITY_TIMEOUT_MS` | 300000 | Perplexity deep research timeout |
| `BLOCKING_GATE_TIMEOUT_MS` | 43200000 | Gate blocking timeout (12h) |
| `PERPLEXITY_API_KEY` | - | Perplexity API key |
| `TAVILY_API_KEY` | - | Tavily API key |
| `VERTEX_API_KEY` | - | Google Gemini API key |
| `X_AI_API_KEY` | - | xAI Grok API key |
| `N_PARALLEL_WORKERS` | 1 | Parallel prompt workers |
| `BASE_BRANCH` | auto-detect | Override base branch detection |

## Entry Points

- **CLI Entry**: `.claude/envoy/src/cli.ts` - Main entry point
- **Command Registry**: `.claude/envoy/src/commands/index.ts` - Auto-discovery
- **Base Class**: `.claude/envoy/src/commands/base.ts` - Command interface

## Related Documentation

- [Command Reference](./Commands.md) - All commands with usage
- [Plan Lifecycle](./Plan.md) - Plan system deep dive
- [Library Reference](./Library.md) - Utility functions
- [External APIs](./ExternalAPIs.md) - AI API integrations
