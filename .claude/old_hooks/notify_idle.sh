#!/bin/bash
# Stop hook variant: notify user when agent is waiting for input

# Send notification
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" notify hook idle "Waiting for input" 2>/dev/null || true

# Always continue
echo '{"continue": true}'
