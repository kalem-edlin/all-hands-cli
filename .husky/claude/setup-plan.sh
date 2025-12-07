#!/bin/sh
# Create plan directory for new branches
# Called from post-checkout hook

. "$(dirname "$0")/common.sh"

# post-checkout receives: $1=prev_HEAD, $2=new_HEAD, $3=branch_flag (1=branch checkout)
prev_ref="$1"
new_ref="$2"
branch_flag="$3"

# Only act on branch checkouts (not file checkouts)
[ "$branch_flag" = "1" ] || exit 0

branch=$(get_branch)

# Skip direct mode branches (main, master, staging, production, quick/*)
if is_direct_mode_branch "$branch"; then
    exit 0
fi

plan_dir=$(get_plan_dir)

# Create directory and required files if doesn't exist
if [ ! -d "$plan_dir" ]; then
    mkdir -p "$plan_dir"
    touch "$plan_dir/plan.md"
    touch "$plan_dir/queries.jsonl"
    touch "$plan_dir/files.jsonl"
    echo "Created plan directory: $plan_dir"
fi
