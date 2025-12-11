#!/bin/sh
# Warn about changes that will sync to claude-all-hands on merge
# This hook runs in TARGET repos only (where .allhandsignore exists)

# Only run if this is a target repo (has .allhandsignore)
if [ ! -f ".allhandsignore" ]; then
    exit 0
fi

# Get staged files in managed directories
MANAGED_CHANGES=$(git diff --cached --name-only | grep -E '^(\.claude/|\.husky/|CLAUDE\.md)' || true)

if [ -z "$MANAGED_CHANGES" ]; then
    exit 0
fi

# Load ignore patterns
IGNORED=""
if [ -f ".allhandsignore" ]; then
    while IFS= read -r pattern || [ -n "$pattern" ]; do
        # Skip comments and empty lines
        case "$pattern" in
            \#*|"") continue ;;
        esac
        IGNORED="$IGNORED $pattern"
    done < .allhandsignore
fi

# Filter out ignored files
SYNC_FILES=""
for file in $MANAGED_CHANGES; do
    is_ignored=false
    for pattern in $IGNORED; do
        case "$file" in
            $pattern) is_ignored=true; break ;;
        esac
    done
    if [ "$is_ignored" = false ]; then
        SYNC_FILES="$SYNC_FILES
  → $file"
    fi
done

if [ -z "$(echo "$SYNC_FILES" | tr -d '[:space:]')" ]; then
    exit 0
fi

# Show warning
echo ""
echo "┌────────────────────────────────────────────────────────────────┐"
echo "│  ⚠️  CLAUDE-ALL-HANDS SYNC WARNING                              │"
echo "├────────────────────────────────────────────────────────────────┤"
echo "│  These changes will sync to claude-all-hands on merge:        │"
echo "└────────────────────────────────────────────────────────────────┘"
echo "$SYNC_FILES"
echo ""
echo "────────────────────────────────────────────────────────────────"
echo "  If these are TARGET-SPECIFIC, add to .allhandsignore before commit"
echo "  If these are FRAMEWORK IMPROVEMENTS, proceed with commit"
echo "────────────────────────────────────────────────────────────────"
echo ""

# Don't block - just warn
exit 0
