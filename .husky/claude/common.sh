#!/bin/sh
# Shared utilities for claude-related git hooks

# Direct mode branches - no planning for these branches
# - main, master, staging, production: protected/deployment branches
# - quick/*: rapid iteration branches that skip planning overhead
DIRECT_MODE_BRANCHES="main master staging production"
DIRECT_MODE_PREFIXES="quick/"

# Check if a branch should use direct mode (no planning)
is_direct_mode_branch() {
    branch="$1"
    [ -z "$branch" ] && return 0  # Empty/detached = direct mode
    
    # Check exact matches
    for b in $DIRECT_MODE_BRANCHES; do
        [ "$branch" = "$b" ] && return 0
    done
    
    # Check prefixes
    for prefix in $DIRECT_MODE_PREFIXES; do
        case "$branch" in
            "$prefix"*) return 0 ;;
        esac
    done
    
    return 1
}

# Sanitize branch name for plan directory (feat/auth -> feat-auth)
sanitize_branch() {
    echo "$1" | sed 's/[^a-zA-Z0-9_-]/-/g'
}

# Get current branch name
get_branch() {
    git branch --show-current 2>/dev/null || echo "detached"
}

# Get plan directory for current branch
get_plan_dir() {
    echo ".claude/plans/$(sanitize_branch "$(get_branch)")"
}
