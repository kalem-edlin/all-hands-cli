#!/bin/sh
# Shared utilities for claude-related git hooks

# Direct mode branches - no planning for these branches
# Protected/deployment branches and rapid iteration branches
DIRECT_MODE_BRANCHES="main master develop development dev staging stage production prod"
DIRECT_MODE_PREFIXES="quick/ curator/"

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

# Get plan directory for current branch (sets PLAN_DIR variable)
get_plan_dir() {
    sanitized=$(sanitize_branch "$(get_branch)")
    PLAN_DIR=".claude/plans/$sanitized"
}

# Get plan directory for a specific branch (sets PLAN_DIR variable)
get_plan_dir_for_branch() {
    sanitized=$(sanitize_branch "$1")
    PLAN_DIR=".claude/plans/$sanitized"
}
