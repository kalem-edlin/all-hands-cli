---
description: "Observability system with dual-storage trace events (SQLite + JSONL), structured logging across all harness subsystems (hooks, commands, TUI, agents), and CLI querying with filtering, stats aggregation, and real-time tailing."
---

## Intent

When multiple agents run concurrently across tmux windows, debugging failures requires structured observability. The trace system captures events from every harness subsystem -- hooks, CLI commands, TUI actions, agent spawning -- and stores them in both a queryable SQLite database and a greppable JSONL file. The dual-storage design reflects the two access patterns: SQL for filtered queries and aggregation, JSONL for `grep`/`tail -f` workflows.

## Event Model

Every trace event carries agent context derived from environment variables (AGENT_ID, AGENT_TYPE, PROMPT_NUMBER, SPEC_NAME, BRANCH), enabling filtering by which agent produced the event. The `viaDaemon` flag distinguishes events from the CLI daemon vs direct tsx execution.

### Event Types

```mermaid
graph LR
    subgraph Session
        ss[session.start]
        se[session.end]
    end

    subgraph Tools
        tp[tool.pre]
        tpost[tool.post]
        tf[tool.failure]
        td[tool.denied]
        be[bash.error]
    end

    subgraph Hooks
        hs[hook.start]
        hok[hook.success]
        he[hook.error]
    end

    subgraph Commands
        cs[command.start]
        cok[command.success]
        ce[command.error]
    end

    subgraph TUI
        ta[tui.action]
        tl[tui.lifecycle]
        te[tui.error]
    end

    subgraph Agents
        as2[agent.spawn]
        ast[agent.stop]
        ac[agent.compact]
    end

    subgraph Prompts
        ps[prompt.submit]
    end

    subgraph Harness
        herr[harness.error]
    end
```

Error events are explicitly enumerated for fast filtering: `tool.failure`, `tool.denied`, `bash.error`, `hook.error`, `harness.error`, `tui.error`, `command.error`.

## Storage Architecture

[ref:.allhands/harness/src/lib/trace-store.ts:logEvent:36af65f] writes to both backends on every event:

- **SQLite** (`.allhands/harness/.cache/trace/trace.db`): Indexed columns for agent_id, agent_type, event_type, tool_name, timestamp, is_error. Enables efficient filtered queries.
- **JSONL** (`.allhands/harness/.cache/trace/trace.jsonl`): Append-only file, one JSON object per line. Enables `grep`, `jq`, and file-watching workflows.

Both writes use silent failure -- trace errors never break the operation being traced.

## Payload Sanitization

To prevent log bloat from large tool inputs/outputs, payloads are trimmed before storage:

| Control | Default | Env Override |
|---------|---------|--------------|
| Max string length | 200 chars | `TRACE_MAX_STRING_LENGTH` |
| Max nesting depth | 3 levels | `TRACE_MAX_DEPTH` |
| Max array items | 5 | `TRACE_MAX_ARRAY_ITEMS` |
| Max object keys | 8 | `TRACE_MAX_OBJECT_KEYS` |

[ref:.allhands/harness/src/lib/trace-store.ts:sanitizePayload:36af65f] applies [ref:.allhands/harness/src/lib/trace-store.ts:trimStrings:36af65f] and [ref:.allhands/harness/src/lib/trace-store.ts:truncateStructure:36af65f] to enforce these limits with cycle detection via WeakSet.

## Structured Logging Helpers

The trace store provides typed logging functions that construct appropriate event payloads:

| Function | Event Type | Use Case |
|----------|-----------|----------|
| [ref:.allhands/harness/src/lib/trace-store.ts:logHarnessError:36af65f] | `harness.error` | Internal harness failures |
| [ref:.allhands/harness/src/lib/trace-store.ts:logHookStart:36af65f] | `hook.start` | Hook execution begins |
| [ref:.allhands/harness/src/lib/trace-store.ts:logHookSuccess:36af65f] | `hook.success` | Hook completes |
| [ref:.allhands/harness/src/lib/trace-store.ts:logCommandStart:36af65f] | `command.start` | CLI command begins |
| [ref:.allhands/harness/src/lib/trace-store.ts:logCommandSuccess:36af65f] | `command.success` | CLI command completes |
| [ref:.allhands/harness/src/lib/trace-store.ts:logCommandError:36af65f] | `command.error` | CLI command fails |
| [ref:.allhands/harness/src/lib/trace-store.ts:logTuiError:36af65f] | `tui.error` | TUI runtime error |
| [ref:.allhands/harness/src/lib/trace-store.ts:logTuiAction:36af65f] | `tui.action` | User action in TUI |

## Query Interface

[ref:.allhands/harness/src/lib/trace-store.ts:queryEvents:36af65f] builds parameterized SQL queries from filter options:

- `agentId`, `agentType` -- Filter by agent identity
- `eventType` -- Single event type filter
- `toolName` -- Filter by tool
- `since` -- Time filter supporting relative strings (`1h`, `30m`, `2d`) and ISO timestamps
- `errorsOnly` -- Boolean flag that filters on `is_error = 1`
- `limit`/`offset` -- Pagination (default limit: 100)

[ref:.allhands/harness/src/lib/trace-store.ts:getStats:36af65f] provides aggregate statistics with breakdowns by event type, agent type, and tool name, all supporting the `since` time filter.

## CLI Commands

[ref:.allhands/harness/src/commands/trace.ts:register:089fb26] exposes four subcommands:

- **`ah trace list`** -- Query events with full filter support. Human-readable output highlights errors in red, shows truncated payloads for tool events, and displays prompt text for `prompt.submit` events.
- **`ah trace errors`** -- Shortcut for `list --errors`. Prominently displays error messages, command summaries, hook names, and truncated stack traces.
- **`ah trace stats`** -- Aggregate statistics with breakdowns. Useful for understanding activity patterns and error rates across agents.
- **`ah trace tail`** -- Real-time event watching via filesystem change detection on the JSONL file. Supports `--agent` and `--type` filters. Uses `fs.watch` with position tracking to read only new lines.
