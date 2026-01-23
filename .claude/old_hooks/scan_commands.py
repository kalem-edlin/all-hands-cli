#!/usr/bin/env python3
"""Validate command files on startup."""
import json
import re
import sys
from pathlib import Path
from typing import Optional

COMMANDS_DIR = Path(".claude/commands")


def parse_frontmatter(content: str) -> Optional[dict]:
    """Parse YAML frontmatter from markdown file."""
    if not content.startswith("---"):
        return None
    match = re.search(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return None
    fm = {}
    for line in match.group(1).split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm


def main():
    errors = []

    if not COMMANDS_DIR.exists():
        sys.exit(0)

    for f in COMMANDS_DIR.glob("*.md"):
        content = f.read_text()
        fm = parse_frontmatter(content)

        if not fm:
            errors.append(f"⚠️ command/{f.name}: missing frontmatter")
            continue

        if "description" not in fm:
            errors.append(f"⚠️ command/{f.name}: missing description")

    if errors:
        print(json.dumps({"systemMessage": "\n".join(errors)}))
    sys.exit(0)


if __name__ == "__main__":
    main()
