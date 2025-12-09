#!/usr/bin/env python3
"""PreToolUse hook: block grep/find and suggest rg (only if rg available)."""
import json
import re
import shutil
import sys

RULES = [
    (r"\bgrep\b(?!.*\|)", "Ensure you use Bash with 'rg <pattern>' (ripgrep) instead of grep."),
    (r"\bfind\s+\S+\s+-name\b", "Ensure you use Bash with 'rg --files -g \"<pattern>\" <path>' instead of find -name."),
]

data = json.load(sys.stdin)
command = data.get("tool_input", {}).get("command", "")

if not command:
    sys.exit(0)

# Check for grep/find patterns
for pattern, message in RULES:
    if re.search(pattern, command):
        # Only enforce if rg is available
        if shutil.which("rg"):
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": message
                }
            }))
            sys.exit(0)
        break

sys.exit(0)
