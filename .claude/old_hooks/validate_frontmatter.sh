#!/bin/bash
# PostToolUse hook: Validate frontmatter after Write/Edit to managed files
#
# Validates files in:
# - .planning/*/prompts/*.md (prompt schema)
# - .planning/*/alignment.md (alignment schema)
# - .planning/*/status.yaml (status schema)
# - specs/**/*.spec.md (spec schema)
#
# Uses: ah validate <file> --json
# Returns: non-zero exit code with error message if invalid

set -e

# Get the file path from tool input (JSON on stdin)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys, json; d = json.load(sys.stdin); print(d.get('file_path', d.get('filePath', '')))" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Check if file is in a managed directory
IS_MANAGED=false
SCHEMA_TYPE=""

case "$FILE_PATH" in
    *.planning/*/prompts/*.md)
        IS_MANAGED=true
        SCHEMA_TYPE="prompt"
        ;;
    *.planning/*/alignment.md)
        IS_MANAGED=true
        SCHEMA_TYPE="alignment"
        ;;
    *.planning/*/status.yaml)
        IS_MANAGED=true
        SCHEMA_TYPE="status"
        ;;
    *specs/*.spec.md)
        IS_MANAGED=true
        SCHEMA_TYPE="spec"
        ;;
esac

if [ "$IS_MANAGED" != "true" ]; then
    exit 0
fi

# Run validation
AH_CLI="$CLAUDE_PROJECT_DIR/.allhands/allhands"

if [ ! -x "$AH_CLI" ]; then
    # allhands CLI not available, skip validation
    exit 0
fi

RESULT=$("$AH_CLI" validate "$FILE_PATH" --type "$SCHEMA_TYPE" --json 2>&1) || true
SUCCESS=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null || echo "false")

if [ "$SUCCESS" != "True" ] && [ "$SUCCESS" != "true" ]; then
    # Extract error details
    ERRORS=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    errors = data.get('errors', [])
    for e in errors:
        print(f\"  - {e.get('field', '?')}: {e.get('message', 'unknown error')}\")
except:
    print('  - Validation failed')
" 2>/dev/null)

    echo "Frontmatter validation failed for $FILE_PATH (schema: $SCHEMA_TYPE)"
    echo "$ERRORS"
    exit 1
fi

exit 0
