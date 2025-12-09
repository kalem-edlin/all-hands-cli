# Hook Event Reference

Complete input/output specifications for all hook events.

## Common Input Fields (All Events)

All hooks receive JSON via stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default|plan|acceptEdits|bypassPermissions",
  "hook_event_name": "PreToolUse"
}
```

## PreToolUse

**When**: After Claude creates tool parameters, before execution

**Matchers**: `Task`, `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `mcp__*`

**Input**:
```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

**JSON Output (exit 0)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "Explanation",
    "updatedInput": {
      "file_path": "/modified/path.txt"
    }
  }
}
```

**Exit 2**: Blocks tool call, stderr shown to Claude

## PostToolUse

**When**: After tool completes successfully

**Matchers**: Same as PreToolUse

**Input** (adds to PreToolUse):
```json
{
  "tool_response": {
    "filePath": "/path/to/file.txt",
    "success": true
  }
}
```

**JSON Output (exit 0)**:
```json
{
  "decision": "block",
  "reason": "Explanation for Claude",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional info for Claude"
  }
}
```

**Exit 2**: Shows stderr to Claude (tool already ran)

## UserPromptSubmit

**When**: User submits prompt, before Claude processes

**Input**:
```json
{
  "prompt": "Write a function to calculate factorial"
}
```

**Output Options**:
1. Plain stdout (exit 0): Added as context
2. JSON with `additionalContext`: Structured context injection
3. JSON with `decision: "block"`: Prevents prompt processing

```json
{
  "decision": "block",
  "reason": "Shown to user (not Claude)",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Context added to conversation"
  }
}
```

**Exit 2**: Blocks prompt, erases it, shows stderr to user only

## Stop

**When**: Main agent finishes responding (not on user interrupt)

**Input**:
```json
{
  "stop_hook_active": true
}
```

Note: `stop_hook_active` is true when Claude is continuing from a previous stop hook. Check this to prevent infinite loops.

**JSON Output (exit 0)**:
```json
{
  "decision": "block",
  "reason": "Must continue because: [explanation for Claude]"
}
```

**Exit 2**: Blocks stopping, stderr shown to Claude

## SubagentStop

**When**: Subagent (Task tool) finishes

**Input**: Same as Stop

**Output**: Same as Stop

## SessionStart

**When**: New session or resume

**Matchers**: `startup`, `resume`, `clear`, `compact`

**Input**:
```json
{
  "source": "startup|resume|clear|compact"
}
```

**Special**: Write to `$CLAUDE_ENV_FILE` to persist env vars:
```bash
echo 'export MY_VAR=value' >> "$CLAUDE_ENV_FILE"
```

**JSON Output (exit 0)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Context loaded at startup"
  }
}
```

Plain stdout also added as context.

## SessionEnd

**When**: Session ends

**Input**:
```json
{
  "reason": "clear|logout|prompt_input_exit|other"
}
```

Cannot block termination. Use for cleanup/logging.

## PreCompact

**When**: Before context compaction

**Matchers**: `manual` (from `/compact`), `auto` (context full)

**Input**:
```json
{
  "trigger": "manual|auto",
  "custom_instructions": ""
}
```

## Notification

**When**: Claude sends notifications

**Matchers**: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`

**Input**:
```json
{
  "message": "Claude needs your permission to use Bash",
  "notification_type": "permission_prompt"
}
```

Output logged to debug only.

## Matcher Patterns

```json
"matcher": "Write"           // Exact match
"matcher": "Write|Edit"      // Multiple tools
"matcher": "*"               // All tools (or omit)
"matcher": "mcp__memory__.*" // Regex: all memory MCP tools
"matcher": "mcp__.*__delete" // Regex: all MCP delete tools
```

Case-sensitive. Supports regex.
