#!/bin/bash
# Agent File Validator
# Validates agent markdown files for correct structure and content

set -euo pipefail

# Usage
if [ $# -eq 0 ]; then
  echo "Usage: $0 <path/to/agent.md>"
  echo ""
  echo "Validates agent file for:"
  echo "  - YAML frontmatter structure"
  echo "  - Required fields (name, description)"
  echo "  - Field formats and constraints"
  echo "  - System prompt presence"
  exit 1
fi

AGENT_FILE="$1"
error_count=0
warning_count=0

echo "Validating agent: $AGENT_FILE"
echo ""

# Check: File exists
if [ ! -f "$AGENT_FILE" ]; then
  echo "ERROR: File not found: $AGENT_FILE"
  exit 1
fi

# Check: Starts with ---
FIRST_LINE=$(head -1 "$AGENT_FILE")
if [ "$FIRST_LINE" != "---" ]; then
  echo "ERROR: File must start with YAML frontmatter (---)"
  exit 1
fi

# Check: Has closing ---
if ! tail -n +2 "$AGENT_FILE" | grep -q '^---$'; then
  echo "ERROR: Frontmatter not closed (missing second ---)"
  exit 1
fi

# Extract frontmatter and system prompt
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$AGENT_FILE")
SYSTEM_PROMPT=$(awk '/^---$/{i++; next} i>=2' "$AGENT_FILE")

# Validate: name field
NAME=$(echo "$FRONTMATTER" | grep '^name:' | sed 's/name: *//' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")

if [ -z "$NAME" ]; then
  echo "ERROR: Missing required field: name"
  ((error_count++))
else
  # Name length (3-50 chars)
  name_length=${#NAME}
  if [ $name_length -lt 3 ]; then
    echo "ERROR: name too short ($name_length chars, min 3)"
    ((error_count++))
  elif [ $name_length -gt 50 ]; then
    echo "ERROR: name too long ($name_length chars, max 50)"
    ((error_count++))
  fi

  # Name format: lowercase-hyphenated, alphanumeric start/end
  if ! echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*[a-z0-9]$' && ! echo "$NAME" | grep -qE '^[a-z0-9]$'; then
    echo "ERROR: name must be lowercase-hyphenated, start/end alphanumeric: '$NAME'"
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
  if [ $desc_length -lt 10 ]; then
    echo "WARN: description too short ($desc_length chars, recommend >10)"
    ((warning_count++))
  fi

  # Check for example blocks
  if ! echo "$DESCRIPTION" | grep -q '<example>'; then
    echo "WARN: description should include <example> blocks for triggering"
    ((warning_count++))
  fi
fi

# Validate: model field (optional but recommended)
MODEL=$(echo "$FRONTMATTER" | grep '^model:' | sed 's/model: *//')

if [ -n "$MODEL" ]; then
  case "$MODEL" in
    inherit|sonnet|opus|haiku)
      ;;
    *)
      echo "WARN: Unknown model: $MODEL (valid: inherit, sonnet, opus, haiku)"
      ((warning_count++))
      ;;
  esac
fi

# Validate: system prompt
if [ -z "$SYSTEM_PROMPT" ] || [ -z "$(echo "$SYSTEM_PROMPT" | tr -d '[:space:]')" ]; then
  echo "ERROR: System prompt is empty"
  ((error_count++))
else
  prompt_length=${#SYSTEM_PROMPT}
  if [ $prompt_length -lt 20 ]; then
    echo "ERROR: System prompt too short ($prompt_length chars, min 20)"
    ((error_count++))
  fi

  # Check for second person
  if ! echo "$SYSTEM_PROMPT" | grep -qE "You are|You will|Your"; then
    echo "WARN: System prompt should use second person (You are..., You will...)"
    ((warning_count++))
  fi
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
