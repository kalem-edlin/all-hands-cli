#!/bin/sh
# Clean up orphaned plan directories for branches that no longer exist
# Called from Claude startup hook (not post-merge)

. "$(dirname "$0")/common.sh"

PLANS_DIR=".claude/plans"

# Exit if plans directory doesn't exist
[ -d "$PLANS_DIR" ] || exit 0

# Get list of local branches (sanitized)
local_branches=$(git branch --format='%(refname:short)' 2>/dev/null | while read branch; do
    sanitize_branch "$branch"
done)

# Check each plan directory
for plan_dir in "$PLANS_DIR"/*/; do
    [ -d "$plan_dir" ] || continue

    dir_name=$(basename "$plan_dir")

    # Check if any local branch matches this plan dir
    found=0
    for branch in $local_branches; do
        if [ "$branch" = "$dir_name" ]; then
            found=1
            break
        fi
    done

    # Remove orphaned plan directory
    if [ "$found" = "0" ]; then
        rm -rf "$plan_dir"
        echo "Cleaned up orphaned plan: $dir_name"
    fi
done
