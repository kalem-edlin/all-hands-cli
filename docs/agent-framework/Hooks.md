---
description: Hook enforcement patterns covering validation strategies, event types, blocking decisions, and the rationale for using hooks over prompt-based rules.
---

# Hook Enforcement

## Overview

Hooks are event-driven automation for Claude Code that execute shell commands or LLM prompts in response to tool usage, session events, and user interactions. They provide programmatic control over Claude's behavior that prompts alone cannot guarantee.

The framework uses hooks for critical behaviors - validation, redirection, and enforcement - where reliability matters more than flexibility.

## Design Rationale

### Why Hooks Over Prompts

Prompt instructions can be ignored under context pressure. As agent context fills, lower-priority instructions get dropped. Hooks execute programmatically regardless of context state.

**Critical for:**
- Security enforcement (blocking dangerous commands)
- Structural validation (ensuring artifacts follow patterns)
- Research redirection (routing to appropriate agents)

### Blocking vs Non-Blocking

Hooks on PreToolUse and similar events can return blocking decisions. The framework uses blocking sparingly - only when allowing the action would cause harm or violate fundamental principles.

Non-blocking hooks observe and log without interfering. This enables audit trails without workflow disruption.

### Shell vs LLM Prompts

Hooks can execute shell commands or trigger LLM evaluation:

| Type | Use When |
|------|----------|
| Shell command | Simple validation, logging, external tools |
| LLM prompt | Complex reasoning, natural language validation |

Most framework hooks use shell commands for speed and predictability.

## Implemented Hooks

### Session Validation

**validate_artifacts.py** [ref:.claude/hooks/scripts/validate_artifacts.py::abc1234]

**Event:** SessionStart
**Purpose:** Validate all .claude/ artifacts on session begin
**Behavior:** Checks agents, skills, and commands for structural issues

This hook validates:
- YAML frontmatter presence and required fields
- Name/filename consistency
- Skill references exist

**Why session start?** Catching issues early prevents compounding errors. Invalid artifacts discovered mid-task waste significant context.

### Research Enforcement

**enforce_research_fetch.py** [ref:.claude/hooks/scripts/enforce_research_fetch.py::abc1234]

**Event:** PreToolUse (WebFetch)
**Purpose:** Block direct URL fetching, redirect to researcher agent
**Behavior:** Returns blocking decision with guidance

This hook enforces the research agent boundary. Rather than allowing any agent to fetch URLs, the framework routes all external information gathering through the researcher.

**Why block?** Research requires synthesis and source evaluation. Direct fetching produces raw content without the researcher's curation.

**enforce_research_search.py** [ref:.claude/hooks/scripts/enforce_research_search.py::abc1234]

**Event:** PreToolUse (WebSearch)
**Purpose:** Block direct web search for non-research agents
**Behavior:** Returns guidance to delegate to researcher

Companion to the fetch hook - ensures web search also routes through the researcher.

### GitHub Redirection

**github_url_to_gh.py** [ref:.claude/hooks/scripts/github_url_to_gh.py::abc1234]

**Event:** PreToolUse (WebFetch, Bash)
**Purpose:** Block GitHub URL fetching, suggest gh CLI
**Behavior:** Detects GitHub domains, returns blocking decision with CLI guidance

This hook enforces using the GitHub CLI for GitHub content:

```
GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH
```

**Why redirect?** The gh CLI handles authentication and rate limiting properly. Direct fetching may hit auth walls or rate limits.

### Agent Scanning

**scan_agents.py** [ref:.claude/hooks/scripts/scan_agents.py::abc1234]

**Event:** SessionStart
**Purpose:** Validate agent files specifically
**Behavior:** Checks frontmatter, skill references

This hook provides focused agent validation, catching:
- Missing frontmatter
- Missing description field
- Name/filename mismatch
- References to non-existent skills

## Hook Patterns

### Blocking Decision Structure

Blocking hooks return JSON with decision and reason:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Why this was blocked"
  }
}
```

The reason appears in Claude's context, enabling self-correction on subsequent attempts.

### Non-Blocking Context Injection

SessionStart hooks can inject context without blocking:

```json
{
  "systemMessage": "Warning messages that appear in context"
}
```

The validate_artifacts hook uses this pattern - it warns about issues without blocking session start.

### Additional Context Pattern

Hooks can provide guidance for Claude's next action:

```json
{
  "continue": false,
  "additionalContext": "Main agent: delegate to researcher agent.\nSubagent: respond to main agent requesting researcher delegation."
}
```

This pattern enables graceful redirection rather than hard blocks.

## Event Types

### Blocking Events

| Event | When | Can Block |
|-------|------|-----------|
| PreToolUse | Before tool execution | Yes |
| UserPromptSubmit | User submits prompt | Yes |
| Stop | Claude attempts to stop | Yes |
| SubagentStop | Subagent attempts to stop | Yes |

### Non-Blocking Events

| Event | When | Use For |
|-------|------|---------|
| PostToolUse | After tool execution | Logging, formatting |
| SessionStart | Session begins | Validation, context injection |
| SessionEnd | Session ends | Cleanup |

### Matchers

Hooks filter by tool using matchers:

```json
{
  "matcher": "Bash",           // Exact match
  "matcher": "Write|Edit",     // Multiple tools
  "matcher": "mcp__.*"         // All MCP tools
}
```

The GitHub hook matches both WebFetch and Bash to catch curl/wget commands.

## Implementation Guidelines

### Security Checklist

- **Infinite loop prevention:** Check stop_hook_active in Stop hooks
- **Timeout configuration:** Set reasonable timeouts (default 60s)
- **Permission validation:** Ensure scripts are executable
- **Path safety:** Use absolute paths with $CLAUDE_PROJECT_DIR
- **JSON validation:** Validate config with jq before use

### Testing Hooks

Always test hooks with debug flag:

```bash
claude --debug
```

This shows which hooks matched, command execution, and output.

### Error Handling

Hook scripts should:
1. Exit 0 on success (even non-blocking)
2. Output valid JSON to stdout
3. Handle missing input gracefully
4. Not hang (respect timeouts)

## When to Use Hooks

### Good Hook Use Cases

- Blocking dangerous operations (force push, rm -rf)
- Redirecting to appropriate agents
- Validating artifact structure
- Logging for audit trails
- Injecting session context

### Poor Hook Use Cases

- Complex business logic (use agent prompts)
- User-facing messages (use commands)
- Workflow orchestration (use skills)
- Conditional behavior that changes frequently

Hooks are for reliable enforcement, not flexible behavior.

## Anti-Patterns

### Hook Overuse

Too many blocking hooks create workflow friction. Users disable hooks when they become annoying.

**Solution:** Block only critical violations. Use additionalContext for guidance on non-critical issues.

### Complex Prompt Hooks

LLM prompt hooks are slow and non-deterministic. Complex validation in prompt hooks delays operations and may produce inconsistent decisions.

**Solution:** Use shell commands for validation when possible. Reserve prompt hooks for genuinely complex reasoning.

### Missing Error Handling

Hooks that crash or hang block operations without clear guidance.

**Solution:** Always exit 0, handle edge cases, provide meaningful error messages.
