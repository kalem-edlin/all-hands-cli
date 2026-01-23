#!/usr/bin/env python3
"""Validate skill directories on startup."""
import json
import re
import sys
from pathlib import Path
from typing import Optional

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

    if not SKILLS_DIR.exists():
        sys.exit(0)

    for skill_dir in SKILLS_DIR.iterdir():
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / "SKILL.md"
        name = skill_dir.name

        if not skill_file.exists():
            errors.append(f"⚠️ skill/{name}/: missing SKILL.md")
            continue

        content = skill_file.read_text()
        fm = parse_frontmatter(content)

        if not fm:
            errors.append(f"⚠️ skill/{name}/SKILL.md: missing frontmatter")
            continue

        if "name" not in fm:
            errors.append(f"⚠️ skill/{name}/SKILL.md: missing name")
        elif fm["name"] != name:
            errors.append(f"⚠️ skill/{name}/SKILL.md: name '{fm['name']}' doesn't match directory")

        if "description" not in fm:
            errors.append(f"⚠️ skill/{name}/SKILL.md: missing description")

    if errors:
        print(json.dumps({"systemMessage": "\n".join(errors)}))
    sys.exit(0)


if __name__ == "__main__":
    main()
