#!/bin/bash
# Skill File Validator
# Validates SKILL.md files for correct structure and content

set -euo pipefail

# Usage
if [ $# -eq 0 ]; then
  echo "Usage: $0 <path/to/SKILL.md>"
  echo ""
  echo "Validates skill file for:"
  echo "  - YAML frontmatter structure"
  echo "  - Required fields (name, description)"
  echo "  - Field formats and constraints"
  echo "  - Body word count"
  echo "  - Progressive disclosure check"
  exit 1
fi

SKILL_FILE="$1"
error_count=0
warning_count=0

echo "Validating skill: $SKILL_FILE"
echo ""

# Check: File exists
if [ ! -f "$SKILL_FILE" ]; then
  echo "ERROR: File not found: $SKILL_FILE"
  exit 1
fi

# Check: Starts with ---
FIRST_LINE=$(head -1 "$SKILL_FILE")
if [ "$FIRST_LINE" != "---" ]; then
  echo "ERROR: File must start with YAML frontmatter (---)"
  exit 1
fi

# Check: Has closing ---
if ! tail -n +2 "$SKILL_FILE" | grep -q '^---$'; then
  echo "ERROR: Frontmatter not closed (missing second ---)"
  exit 1
fi

# Extract frontmatter and body
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$SKILL_FILE")
BODY=$(awk '/^---$/{i++; next} i>=2' "$SKILL_FILE")

# Validate: name field
NAME=$(echo "$FRONTMATTER" | grep '^name:' | sed 's/name: *//' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")

if [ -z "$NAME" ]; then
  echo "ERROR: Missing required field: name"
  ((error_count++))
else
  # Name length (max 64 chars)
  name_length=${#NAME}
  if [ $name_length -gt 64 ]; then
    echo "ERROR: name too long ($name_length chars, max 64)"
    ((error_count++))
  fi

  # Name format: lowercase-hyphenated
  if ! echo "$NAME" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$'; then
    echo "ERROR: name must be lowercase-hyphenated (kebab-case): '$NAME'"
    ((error_count++))
  fi
fi

# Validate: description field
DESCRIPTION=$(echo "$FRONTMATTER" | grep '^description:' | sed 's/description: *//')

if [ -z "$DESCRIPTION" ]; then
  echo "ERROR: Missing required field: description"
  ((error_count++))
else
  desc_length=${#DESCRIPTION}

  # Max 1024 chars
  if [ $desc_length -gt 1024 ]; then
    echo "ERROR: description too long ($desc_length chars, max 1024)"
    ((error_count++))
  fi

  # Warn >300 chars
  if [ $desc_length -gt 300 ]; then
    echo "WARN: description is long ($desc_length chars, recommend <300)"
    ((warning_count++))
  fi
fi

# Validate: body word count
if [ -n "$BODY" ]; then
  word_count=$(echo "$BODY" | wc -w | tr -d ' ')

  if [ "$word_count" -gt 3000 ]; then
    echo "ERROR: body too long ($word_count words, max 3000)"
    ((error_count++))
  elif [ "$word_count" -gt 2000 ]; then
    echo "WARN: body is long ($word_count words, target 1500-2000)"
    ((warning_count++))
  fi

  # Progressive disclosure check for long bodies
  if [ "$word_count" -gt 1500 ]; then
    SKILL_DIR=$(dirname "$SKILL_FILE")

    # Check for references/ or examples/ subdirs
    has_progressive=0
    if [ -d "$SKILL_DIR/references" ] || [ -d "$SKILL_DIR/examples" ] || [ -d "$SKILL_DIR/docs" ]; then
      has_progressive=1
    fi

    # Also check for any .md files besides SKILL.md
    other_md_count=$(find "$SKILL_DIR" -maxdepth 2 -name "*.md" ! -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$other_md_count" -gt 0 ]; then
      has_progressive=1
    fi

    if [ $has_progressive -eq 0 ]; then
      echo "WARN: Long body ($word_count words) without progressive disclosure"
      echo "      Consider adding references/ or examples/ subdirectories"
      ((warning_count++))
    fi
  fi
else
  echo "WARN: Body is empty"
  ((warning_count++))
fi

echo ""
echo "---"

if [ $error_count -eq 0 ] && [ $warning_count -eq 0 ]; then
  echo "OK: All checks passed"
  exit 0
elif [ $error_count -eq 0 ]; then
  echo "OK: Passed with $warning_count warning(s)"
  exit 0
else
  echo "FAIL: $error_count error(s), $warning_count warning(s)"
  exit 1
fi
