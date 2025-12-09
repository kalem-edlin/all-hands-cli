---
name: hook-development
description: Use when creating hooks, implementing PreToolUse/PostToolUse/Stop validation, setting up event-driven automation, or working with hook events and exit codes.
---

# Hook Development

Hooks are event-driven automation that execute at specific points in Claude Code's lifecycle. Use for deterministic control - ensuring certain actions always happen rather than relying on LLM choice.

## Quick Reference

| Event | When | Control |
|-------|------|---------|
| PreToolUse | Before tool execution | Approve/deny/modify |
| PostToolUse | After tool completes | Feedback to Claude |
| UserPromptSubmit | User submits prompt | Block/add context |
| Stop | Agent stopping | Continue/allow stop |
| SubagentStop | Subagent done | Continue/allow stop |
| SessionStart | Session begins | Load context/env vars |
| SessionEnd | Session ends | Cleanup |
| PreCompact | Before compaction | Preserve context |
| Notification | Notification sent | Custom handlers |

## Hook Types

### Prompt-Based (Recommended)

LLM evaluates decision - context-aware, flexible, easier to maintain:

```json
{
  "type": "prompt",
  "prompt": "Evaluate if Claude should stop: $ARGUMENTS. Check if all tasks complete.",
  "timeout": 30
}
```

**Best for**: Stop, SubagentStop, complex PreToolUse decisions

### Command Hooks

Bash/Python scripts for deterministic checks:

```json
{
  "type": "command",
  "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/validate.py",
  "timeout": 60
}
```

**Best for**: Fast validation, file ops, external tools, performance-critical

## Configuration Locations

| Location | Scope | Format |
|----------|-------|--------|
| `~/.claude/settings.json` | User-global | Direct in `hooks` key |
| `.claude/settings.json` | Project | Direct in `hooks` key |

## Output Formats

### Exit Codes (Command Hooks)

| Code | Behavior |
|------|----------|
| 0 | Success - stdout shown in verbose mode |
| 2 | Blocking error - stderr fed to Claude |
| Other | Non-blocking error - stderr logged |

### JSON Output (Exit 0)

```json
{
  "continue": true,
  "decision": "block",
  "reason": "Explanation for Claude",
  "systemMessage": "Warning shown to user",
  "hookSpecificOutput": { ... }
}
```

## Environment Variables

- `$CLAUDE_PROJECT_DIR` - Project root (always available)
- `$CLAUDE_ENV_FILE` - Persist env vars (SessionStart only)

## Deep References

- `references/event-reference.md` - All events with input/output specs
- `examples/prompt-hooks.md` - Prompt-based hook examples
- `examples/command-hooks.md` - Bash/Python script examples
- `~/.claude-code-docs/docs/hooks.md` - Official reference
- `~/.claude-code-docs/docs/hooks-guide.md` - Official guide

## Implementation Workflow

1. Identify event (PreToolUse, Stop, etc.)
2. Choose type: prompt (flexible) vs command (deterministic)
3. Configure in settings.json
4. For command hooks, create script in `.claude/hooks/scripts/`
5. Test with `claude --debug`
6. Use `/hooks` to verify registration
