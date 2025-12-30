#!/bin/bash

# Initialize claude-envoy (creates venv if needed)
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" info > /dev/null 2>&1

# Validate .claude/ artifacts (systemMessage JSON shown to user)
python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/scripts/validate_artifacts.py"

# Release all in_progress prompts (stale from previous sessions)
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" plan release-all-prompts > /dev/null 2>&1

# Cleanup orphaned git worktrees
"$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" git cleanup-worktrees > /dev/null 2>&1

# Sync claude-code-docs (clone if missing, pull if behind)
DOCS_DIR="$HOME/.claude-code-docs"
if [ ! -d "$DOCS_DIR" ]; then
    git clone --quiet https://github.com/ericbuess/claude-code-docs.git "$DOCS_DIR" 2>/dev/null &
else
    # Background sync - fetch and pull if behind
    (cd "$DOCS_DIR" && git fetch --quiet origin main 2>/dev/null && \
     [ "$(git rev-list HEAD..origin/main --count 2>/dev/null)" -gt 0 ] && \
     git pull --quiet origin main 2>/dev/null) &
fi

# Check for active plan on current branch
branch=$(git branch --show-current 2>/dev/null)
if [ -n "$branch" ]; then
    if [ "$branch" = "main" ] || [ "$branch" = "master" ] || [ "$branch" = "develop" ] || [ "$branch" = "development" ] || [ "$branch" = "dev" ] || [ "$branch" = "staging" ] || [ "$branch" = "stage" ] || [ "$branch" = "production" ] || [ "$branch" = "prod" ] || [[ "$branch" == quick/* ]] || [[ "$branch" == curator/* ]] || [[ "$branch" == docs/* ]]; then
        echo "Mode: Direct (no planning) - on $branch branch"
    else
        # Feature branch - ensure plan exists and get status
        result=$("$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" plans create 2>/dev/null)
        status=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status',''))" 2>/dev/null)

        plan_id=$(echo "$branch" | sed 's/[^a-zA-Z0-9_-]/-/g')
        plan_file=".claude/plans/$plan_id/plan.md"

        # Reset deactivated status on new session
        if [ "$status" = "deactivated" ]; then
            "$CLAUDE_PROJECT_DIR/.claude/envoy/envoy" plans set-status draft > /dev/null 2>&1
            status="draft"
        fi

        if [ "$status" = "draft" ]; then
            echo "Plan status: draft (planning required)"
            echo "Plan file: $plan_file"
        elif [ "$status" = "active" ]; then
            echo "Plan status: active (implementing)"
            echo "Plan file: $plan_file"
        fi
    fi
fi

echo "You are the Main Agent - Main Agent Rules apply to you"
