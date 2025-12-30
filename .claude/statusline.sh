#!/bin/bash
# Project status line - uses ccline if available, adds validation errors

input=$(cat)
PROJECT_DIR=$(printf '%s' "$input" | jq -r '.workspace.project_dir // empty')

# Check for validation errors first
ERROR_COUNT=0
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/.claude/hooks/scripts/validate_artifacts.py" ]; then
    RESULT=$(cd "$PROJECT_DIR" && python3 .claude/hooks/scripts/validate_artifacts.py 2>/dev/null)
    if [ -n "$RESULT" ]; then
        ERROR_COUNT=$(printf '%s' "$RESULT" | jq -r '.systemMessage // empty' | grep -c "•" 2>/dev/null || echo "0")
    fi
fi

# Try ccline (global install)
CCLINE="$HOME/.claude/ccline/ccline"
if [ -x "$CCLINE" ]; then
    printf '%s' "$input" | "$CCLINE" 2>/dev/null
    [ "$ERROR_COUNT" -gt 0 ] && echo -e "\033[31m⚠ ${ERROR_COUNT} errors (run /validate to view)\033[0m"
else
    # No ccline - only show validation errors if any
    [ "$ERROR_COUNT" -gt 0 ] && echo -e "\033[31m⚠ ${ERROR_COUNT} errors (run /validate to view)\033[0m"
fi
