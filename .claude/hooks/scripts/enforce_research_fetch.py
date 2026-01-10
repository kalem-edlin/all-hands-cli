#!/usr/bin/env python3
"""PreToolUse hook: intercept WebFetch → redirect to researcher agent."""
import json
import sys

data = json.load(sys.stdin)
url = data.get("tool_input", {}).get("url", "")

if not url:
    sys.exit(0)

# JSON output with additionalContext for Claude self-correction
print(json.dumps({
    "continue": False,
    "additionalContext": "WebFetch blocked.\n\nMain agent: delegate to researcher agent.\nSubagent: use `envoy tavily extract \"<url>\"` instead."
}))
sys.exit(0)
