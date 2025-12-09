#!/usr/bin/env python3
"""PostToolUse hook: validate SKILL.md files on edit."""
import json
import re
import sys
from pathlib import Path


def parse_frontmatter(content):
    """Parse YAML frontmatter from content."""
    if not content.startswith("---"):
        return None
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None
    result = {}
    for line in parts[1].strip().split("\n"):
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def validate_skill_file(file_path):
    """Validate a SKILL.md file. Returns list of errors."""
    errors = []

    if not file_path.exists():
        return errors

    try:
        content = file_path.read_text()
    except Exception as e:
        errors.append(f"Error reading file: {e}")
        return errors

    fm = parse_frontmatter(content)
    if fm is None:
        errors.append("Missing or invalid YAML frontmatter")
        return errors

    # Validate name
    if "name" not in fm:
        errors.append("Missing 'name' field in frontmatter")
    else:
        n = fm["name"]
        if len(n) > 64:
            errors.append(f"'name' exceeds 64 chars ({len(n)})")
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", n):
            errors.append(f"'name' must be kebab-case: '{n}'")

    # Validate description
    if "description" not in fm:
        errors.append("Missing 'description' field in frontmatter")
    elif len(fm["description"]) > 1024:
        errors.append(f"'description' exceeds 1024 chars ({len(fm['description'])})")

    return errors


data = json.load(sys.stdin)
file_path = data.get("tool_input", {}).get("file_path", "")

if not file_path:
    sys.exit(0)

# Only validate skill files
if "/skills/" not in file_path and not file_path.endswith("SKILL.md"):
    sys.exit(0)

# Only validate SKILL.md files specifically
if not file_path.endswith("SKILL.md"):
    sys.exit(0)

errors = validate_skill_file(Path(file_path))

if errors:
    print("❌ SKILL.md Validation Failed:", file=sys.stderr)
    for error in errors:
        print(f"  • {error}", file=sys.stderr)
    sys.exit(2)
