#!/bin/sh
# Create plan directory structure for new branches
# Called from post-checkout hook

. "$(dirname "$0")/common.sh"

# post-checkout receives: $1=prev_HEAD, $2=new_HEAD, $3=branch_flag (1=branch checkout)
prev_ref="$1"
new_ref="$2"
branch_flag="$3"

# Only act on branch checkouts (not file checkouts)
[ "$branch_flag" = "1" ] || exit 0

branch=$(get_branch)

# Skip direct mode branches (main, master, develop, staging, production, quick/*, curator/*)
if is_direct_mode_branch "$branch"; then
    exit 0
fi

get_plan_dir

# Create directory structure if doesn't exist
if [ ! -d "$PLAN_DIR" ]; then
    # Create all subdirectories
    mkdir -p "$PLAN_DIR/prompts"
    mkdir -p "$PLAN_DIR/findings/research"
    mkdir -p "$PLAN_DIR/heal"

    # Create plan.md with minimal frontmatter for draft status
    cat > "$PLAN_DIR/plan.md" << EOF
---
status: draft
branch: $branch
---
EOF

    # Create empty user_input.md
    cat > "$PLAN_DIR/user_input.md" << EOF
# User Input
EOF

    echo "Created plan directory: $PLAN_DIR"
fi
