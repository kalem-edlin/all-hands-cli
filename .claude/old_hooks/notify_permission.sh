#!/bin/bash
# PreToolUse hook for tools requiring permission: notify user

# Read stdin to get tool info
input=$(cat)
tool_name=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name','unknown'))" 2>/dev/null || echo "unknown")

# Send notification
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" notify hook permission "Permission requested for \"$tool_name\"" 2>/dev/null || true

# Always continue (let Claude's permission system handle it)
echo '{"continue": true}'
