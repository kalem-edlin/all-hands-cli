# Tools, Commands, MCP & Hooks

Per **Context is Precious** and **Agentic Validation Tooling**, the harness extends Claude Code through hooks, CLI commands, and MCP integrations — all sharing an auto-discovery pattern.

## Auto-Discovery Pattern

Hooks, commands, and MCP servers share the same extension model:
1. Create a module in the appropriate `src/` subdirectory
2. Export a `register(parent: Command)` function
3. The harness auto-discovers and registers at startup

This pattern applies to:
- **Hooks**: `[ref:.allhands/harness/src/hooks]` — Claude Code lifecycle integration
- **Commands**: `[ref:.allhands/harness/src/commands]` — CLI subcommands under `ah`
- **MCP Servers**: `[ref:.allhands/harness/src/mcp]` — External tool integrations

## Hooks System

Per **Context is Precious** and **Agentic Validation Tooling**, hooks bridge Claude Code and the harness.

### Categories

| Category | Purpose | Key Hooks |
|----------|---------|-----------|
| **Context** | Token-efficient context injection | `tldr-inject`, `read-enforcer`, `edit-inject`, `signature` |
| **Enforcement** | Guide toward appropriate tools | `github-url`, `research-fetch`, `research-search` |
| **Validation** | Quality gates on edits | `diagnostics`, `schema`, `format` |
| **Lifecycle** | Handle agent events | `agent-stop`, `agent-compact` |
| **Notification** | Desktop alerts | `elicitation`, `stop`, `compact` |
| **Session** | Startup tasks | `tldr-warm` |

### Hook Events (`[ref:.claude/settings.json::e246ecd]`)

| Event | Purpose |
|-------|---------|
| **PreToolUse** | Context injection, enforcement, blocking |
| **PostToolUse** | Diagnostics, validation |
| **SessionStart** | TLDR daemon warm-up |
| **Stop/SessionEnd** | Notifications, cleanup |
| **PreCompact** | Compaction handling |

### Design Rules
- Graceful degradation: hooks allow tool execution even if analysis fails
- Enforcement blocks include helpful redirect messages
- All optional dependencies (TLDR, pyright) have fallback behavior

### Compaction Hook (Critical)
Per **Knowledge Compounding**, `agent-compact` preserves work:
1. Parse agent transcript for session summary
2. Get git status (file changes)
3. Call oracle to generate summary with decision (CONTINUE/RESTART/BLOCKED)
4. Append summary to prompt file (allows re-run with learnings)
5. Kill agent window

## Commands Architecture

Entry point: `[ref:.allhands/harness/src/cli.ts::13330fb]` (default action launches TUI). Auto-discovers commands from `[ref:.allhands/harness/src/commands]`.

### Core Commands

| Command | Domain | First Principle |
|---------|--------|-----------------|
| `ah knowledge` | Semantic search | **Context is Precious** |
| `ah schema` | File structure | **Frontier Models are Capable** |
| `ah validate` | Quality gates | **Agentic Validation Tooling** |
| `ah oracle` | LLM inference | **Context is Precious** (saves caller context) |
| `ah spawn` | Sub-agents | **Context is Precious** (isolated work) |
| `ah tools` | MCP integration | **Agentic Validation Tooling** |

### Command Design Rules
- Use `--json` flag for machine-readable output
- Graceful degradation when optional deps missing
- Help text explains first principle motivation

## MCP Server Integration

Per **Agentic Validation Tooling**, MCP servers extend the harness with external tool capabilities.

### Adding a New MCP Server

Follow `.allhands/flows/shared/WRITING_HARNESS_MCP_TOOLS.md` for the full process. Key phases:

1. **Research**: Investigate package requirements (transport type, auth, env vars)
2. **Build Config**: Copy `[ref:.allhands/harness/src/mcp/_template.ts::ce02241]`, fill in researched values
3. **Environment**: Document required env vars (do NOT add values)
4. **Validate**: Build harness, verify with `ah tools --list` and `ah tools <server-name>`

### Config Structure
- `name`: Short identifier (used in `ah tools <name>:tool`)
- `type`: Transport ('stdio', 'http', 'sse')
- `command`/`args`: For stdio transport
- `env`: Environment variables (`${VAR_NAME}` syntax)
- `stateful`: Whether server maintains session state
- `toolHints`: Helpful hints for key tools

## Extension Points

### Adding New Hooks
1. Create file in `[ref:.allhands/harness/src/hooks]`
2. Export `register(parent: Command)` function
3. Add matcher to `[ref:.claude/settings.json::e246ecd]`

### Adding New Commands
1. Create file in `[ref:.allhands/harness/src/commands]`
2. Export `register(parent: Command)` function
3. Document in `README.md`

### Adding New Template Variables
1. Add to `TemplateVars` registry in `[ref:.allhands/harness/src/lib/schemas/template-vars.ts:TemplateVars:aa2cf15]`
2. Include Zod schema and description

## When to Update This Reference

- Update when adding or modifying `ah` CLI commands or their design rules
- Update when creating new hook categories or changing hook registration patterns
- Update when adding or modifying MCP server configurations or the `_template.ts` convention
- Update when the auto-discovery `register()` export pattern changes
- Update when modifying hook event matchers in `.claude/settings.json`. For project settings structure changes, see `core-architecture.md` instead

## Related References

- [`core-architecture.md`](core-architecture.md) — When your hook or command integrates with TUI lifecycle or platform settings
- [`validation-tooling.md`](validation-tooling.md) — When adding validation hooks or quality gate tooling
