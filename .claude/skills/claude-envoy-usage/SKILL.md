---
name: claude-envoy-usage
description: Use when building skills that need external tool access (APIs, LLMs, web). claude-envoy replaces MCP servers with agent-scoped integrations.
---

# claude-envoy Usage

For agents/skills needing external tool access via claude-envoy.

## Discovery

claude-envoy is self-documenting. Always discover available commands dynamically:

```bash
# List all commands and API status
envoy info

# Get help for a command group
envoy <group> --help

# Get help for specific command
envoy <group> <command> --help
```

## Integration

1. Run `envoy info` to see available command groups
2. Run `--help` on relevant commands to learn arguments
3. Include specific invocations in skill workflow sections
4. Parse JSON response - all commands return `{"status": "success|error", "data": {...}}`

## Context Preservation

envoy reads files directly and passes to external LLMs. Claude only receives JSON output, keeping file contents out of context window.

## When to Extend

If needed functionality doesn't exist, use the `claude-envoy-curation` skill to add new commands.
