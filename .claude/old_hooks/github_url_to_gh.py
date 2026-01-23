#!/usr/bin/env python3
"""PreToolUse hook: block GitHub URLs in fetch commands - suggest gh CLI instead."""
import json
import sys

GITHUB_DOMAINS = ("github.com", "raw.githubusercontent.com", "gist.github.com")

def deny(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }))
    sys.exit(0)

data = json.load(sys.stdin)
tool_name = data.get("tool_name", "")
tool_input = data.get("tool_input", {})

# Check WebFetch URLs
if tool_name == "WebFetch":
    url = tool_input.get("url", "")
    for domain in GITHUB_DOMAINS:
        if domain in url:
            deny("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH")
    sys.exit(0)

# Check Bash commands for curl, wget, envoy tavily extract
if tool_name == "Bash":
    command = tool_input.get("command", "")

    # Check for fetch-like commands
    is_fetch_cmd = any(cmd in command for cmd in ["curl", "wget", "tavily extract"])
    if not is_fetch_cmd:
        sys.exit(0)

    # Check for GitHub URLs
    for domain in GITHUB_DOMAINS:
        if domain in command:
            deny("GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH")

sys.exit(0)
