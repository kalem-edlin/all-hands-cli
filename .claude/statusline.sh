#!/bin/bash
# Project status line - uses ccline if available, adds validation errors

PROJECT_DIR=$(printf '%s' "$input" | jq -r '.workspace.project_dir // empty')

# Check for validation errors first
ERROR_COUNT=0
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/.claude/hooks/validate_artifacts.py" ]; then
    RESULT=$(cd "$PROJECT_DIR" && python3 .claude/hooks/validate_artifacts.py 2>/dev/null)
    if [ -n "$RESULT" ]; then
        ERROR_COUNT=$(printf '%s' "$RESULT" | jq -r '.systemMessage // empty' | grep -c "•" 2>/dev/null || echo "0")
    fi
fi

STATUS=$(ccline)
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo -e "${STATUS} \033[31m⚠ ${ERROR_COUNT} errors\033[0m"
else
    echo "$STATUS"
fi
