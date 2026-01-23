#!/bin/bash
# Stop hook: notify user when agent finishes

# Send notification (ignore errors - notification is best-effort)
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" notify hook "Agent Stopped" "Ready for next prompt" 2>/dev/null || true

# Always continue
echo '{"continue": true}'
