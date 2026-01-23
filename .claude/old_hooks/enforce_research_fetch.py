#!/usr/bin/env python3
"""PreToolUse hook: intercept WebFetch → redirect to researcher agent."""
import json
import sys

data = json.load(sys.stdin)
url = data.get("tool_input", {}).get("url", "")

if not url:
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "WebFetch blocked. Main agent: delegate to researcher agent. Subagent: use `envoy tavily extract \"<url>\"` instead."
    }
}))
sys.exit(0)
