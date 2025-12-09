# Command Hook Examples

Command hooks execute bash/Python scripts for deterministic validation.

## Configuration Pattern

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/your_script.py",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Python: Bash Command Validator

**Config** (settings.json):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/validate_bash.py"
          }
        ]
      }
    ]
  }
}
```

**Script** (`.claude/hooks/scripts/validate_bash.py`):
```python
#!/usr/bin/env python3
"""PreToolUse hook: validate Bash commands."""
import json
import re
import sys

BLOCKED_PATTERNS = [
    (r"\brm\s+-rf\s+/", "Cannot rm -rf root"),
    (r"\bsudo\b", "sudo not allowed"),
    (r">\s*/etc/", "Cannot write to /etc"),
]

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)

tool_name = data.get("tool_name", "")
if tool_name != "Bash":
    sys.exit(0)

command = data.get("tool_input", {}).get("command", "")
if not command:
    sys.exit(0)

for pattern, message in BLOCKED_PATTERNS:
    if re.search(pattern, command):
        print(f"Blocked: {message}", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
```

## Python: File Protection

**Config**:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/protect_files.py"
          }
        ]
      }
    ]
  }
}
```

**Script** (`.claude/hooks/scripts/protect_files.py`):
```python
#!/usr/bin/env python3
"""PreToolUse hook: protect sensitive files."""
import json
import sys

PROTECTED = [".env", "package-lock.json", ".git/", "secrets/"]

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)

file_path = data.get("tool_input", {}).get("file_path", "")
if not file_path:
    sys.exit(0)

for pattern in PROTECTED:
    if pattern in file_path:
        print(f"Protected file: {pattern}", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
```

## Python: JSON Output (Advanced Control)

**Script** with JSON output for fine-grained control:
```python
#!/usr/bin/env python3
"""PreToolUse hook: auto-approve doc files."""
import json
import sys

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(1)

tool_name = data.get("tool_name", "")
file_path = data.get("tool_input", {}).get("file_path", "")

# Auto-approve doc file reads
if tool_name == "Read" and file_path.endswith((".md", ".txt", ".json")):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": "Doc file auto-approved"
        }
    }))
    sys.exit(0)

sys.exit(0)
```

## Bash: SessionStart Context Loading

**Config**:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/startup.sh"
          }
        ]
      }
    ]
  }
}
```

**Script** (`.claude/hooks/startup.sh`):
```bash
#!/bin/bash

# Persist environment variables
if [ -n "$CLAUDE_ENV_FILE" ]; then
    echo 'export NODE_ENV=development' >> "$CLAUDE_ENV_FILE"
fi

# Output context (added to conversation)
echo "Project: $(basename "$CLAUDE_PROJECT_DIR")"
echo "Branch: $(git branch --show-current 2>/dev/null || echo 'not a git repo')"

exit 0
```

## Bash: PostToolUse Formatter

**Config**:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/format.sh"
          }
        ]
      }
    ]
  }
}
```

**Script** (`.claude/hooks/scripts/format.sh`):
```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

case "$file_path" in
    *.ts|*.tsx|*.js|*.jsx)
        npx prettier --write "$file_path" 2>/dev/null || true
        ;;
    *.py)
        python3 -m black "$file_path" 2>/dev/null || true
        ;;
    *.go)
        gofmt -w "$file_path" 2>/dev/null || true
        ;;
esac

exit 0
```

## Python: UserPromptSubmit Context Injection

**Config**:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scripts/inject_context.py"
          }
        ]
      }
    ]
  }
}
```

**Script**:
```python
#!/usr/bin/env python3
"""UserPromptSubmit hook: inject context based on prompt."""
import json
import sys

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)

prompt = data.get("prompt", "").lower()

# Add relevant context
context_parts = []

if "test" in prompt:
    context_parts.append("Test command: npm test")

if "deploy" in prompt:
    context_parts.append("Deploy requires: npm run build && npm run deploy")

if context_parts:
    print("\n".join(context_parts))

sys.exit(0)
```

## Best Practices

1. **Always quote paths**: `"$CLAUDE_PROJECT_DIR"` not `$CLAUDE_PROJECT_DIR`
2. **Use absolute paths**: Reference `$CLAUDE_PROJECT_DIR` for all scripts
3. **Handle missing input**: Check for empty values before processing
4. **Exit codes matter**: 0 = success, 2 = block, other = warning
5. **JSON for control**: Use JSON stdout for fine-grained decisions
6. **Make executable**: `chmod +x script.sh`
7. **Set timeouts**: Default 60s, shorter for fast checks
