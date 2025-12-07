#!/bin/bash

# Initialize claude-envoy (creates venv if needed)
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" info > /dev/null 2>&1

# Check for active plan on current branch
branch=$(git branch --show-current 2>/dev/null)
if [ -n "$branch" ]; then
    if [ "$branch" = "main" ] || [ "$branch" = "master" ] || [ "$branch" = "staging" ] || [ "$branch" = "production" ] || [[ "$branch" == quick/* ]]; then
        echo "Mode: Direct (no planning) - on $branch branch"
    else
        plan_id=$(echo "$branch" | sed 's/[^a-zA-Z0-9_-]/-/g')
        plan_file="$CLAUDE_PROJECT_DIR/.claude/plans/$plan_id/plan.md"
        if [ -f "$plan_file" ] && [ -s "$plan_file" ]; then
            echo "Active plan: .claude/plans/$plan_id/plan.md"
        else
            echo "Mode: Feature branch ($branch) - no plan file yet"
        fi
    fi
fi