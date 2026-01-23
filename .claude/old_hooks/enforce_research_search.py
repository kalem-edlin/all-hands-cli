#!/usr/bin/env python3
"""PreToolUse hook: block WebSearch for non-research agents."""
import json
import sys

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "WebSearch blocked. Main agent: delegate to researcher agent. Subagent: respond to main agent requesting researcher delegation."
    }
}))
sys.exit(0)
