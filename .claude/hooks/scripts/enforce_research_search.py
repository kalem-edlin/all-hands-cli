#!/usr/bin/env python3
"""PreToolUse hook: block WebSearch for non-research agents."""
import json
import sys

# JSON output with additionalContext for Claude self-correction
print(json.dumps({
    "continue": False,
    "additionalContext": "WebSearch blocked.\n\nMain agent: delegate to researcher agent.\nSubagent: respond to main agent requesting researcher delegation."
}))
sys.exit(0)
