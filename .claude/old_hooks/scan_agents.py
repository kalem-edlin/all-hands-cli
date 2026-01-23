#!/usr/bin/env python3
"""Validate agent files on startup."""
import json
import re
import sys
from pathlib import Path
from typing import Optional

AGENTS_DIR = Path(".claude/agents")
SKILLS_DIR = Path(".claude/skills")


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

    if not AGENTS_DIR.exists():
        sys.exit(0)

    for f in AGENTS_DIR.glob("*.md"):
        content = f.read_text()
        fm = parse_frontmatter(content)
        name = f.stem

        if not fm:
            errors.append(f"⚠️ agent/{f.name}: missing frontmatter")
            continue

        if "description" not in fm:
            errors.append(f"⚠️ agent/{f.name}: missing description")

        if fm.get("name") and fm["name"] != name:
            errors.append(f"⚠️ agent/{f.name}: name '{fm['name']}' doesn't match filename")

        # Check skills references
        if "skills" in fm:
            for skill in fm["skills"].split(","):
                skill = skill.strip()
                if skill and not (SKILLS_DIR / skill).exists():
                    errors.append(f"⚠️ agent/{f.name}: skill '{skill}' not found")

    if errors:
        print(json.dumps({"systemMessage": "\n".join(errors)}))
    sys.exit(0)


if __name__ == "__main__":
    main()
