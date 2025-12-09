# Prompt-Based Hook Examples

Prompt hooks use LLM evaluation for context-aware decisions. Recommended for complex logic.

## Stop Hook: Task Completion Check

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if Claude should stop working. Context: $ARGUMENTS\n\nCheck:\n1. All user-requested tasks complete\n2. No errors need addressing\n3. No obvious follow-up needed\n\nRespond: {\"decision\": \"approve\" or \"block\", \"reason\": \"explanation\"}",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## SubagentStop: Subagent Validation

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if this subagent completed its task. Input: $ARGUMENTS\n\nCheck:\n- Assigned task finished\n- No errors occurred\n- Results ready for parent\n\nReturn: {\"decision\": \"approve\" or \"block\", \"reason\": \"explanation\"}"
          }
        ]
      }
    ]
  }
}
```

## PreToolUse: File Write Safety

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Validate file write safety for: $ARGUMENTS\n\nCheck:\n- No system paths (/etc, /usr)\n- No credentials (.env, secrets)\n- No path traversal (..)\n- Content appropriate\n\nReturn: {\"decision\": \"approve\" or \"block\", \"reason\": \"explanation\"}"
          }
        ]
      }
    ]
  }
}
```

## UserPromptSubmit: Security Context

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if user prompt requires security guidance: $ARGUMENTS\n\nIf discussing auth, permissions, API keys, or security:\nReturn: {\"systemMessage\": \"relevant security warnings\"}\n\nOtherwise return: {}"
          }
        ]
      }
    ]
  }
}
```

## Response Schema

Prompt hooks must return JSON:

```json
{
  "decision": "approve|block",
  "reason": "Explanation shown to Claude when blocked",
  "continue": false,
  "stopReason": "Message shown when continue is false",
  "systemMessage": "Warning shown to user"
}
```

**Fields**:
- `decision`: `approve` allows, `block` prevents
- `reason`: Shown to Claude when decision is block
- `continue`: If false, stops Claude entirely
- `stopReason`: Message when continue is false
- `systemMessage`: Additional user-visible message

## Prompt Variable

Use `$ARGUMENTS` as placeholder for hook input JSON. If omitted, input is appended to prompt.

## Best Practices

1. **Be specific** - Clearly state evaluation criteria
2. **List checks** - Numbered criteria are clearer
3. **Require JSON response** - Explicit format in prompt
4. **Set timeouts** - Default 30s, adjust as needed
5. **Use for complex decisions** - Simple checks use command hooks
