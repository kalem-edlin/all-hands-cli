#!/usr/bin/env python3
"""Validate all .claude/ artifacts on startup."""
import json
import re
import sys
from pathlib import Path
from typing import Optional

AGENTS_DIR = Path(".claude/agents")
SKILLS_DIR = Path(".claude/skills")
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


def validate_agents() -> list[str]:
    """Validate agent files."""
    errors = []
    if not AGENTS_DIR.exists():
        return errors

    for f in AGENTS_DIR.glob("*.md"):
        content = f.read_text()
        fm = parse_frontmatter(content)
        name = f.stem

        if not fm:
            errors.append(f"agent/{f.name}: missing frontmatter")
            continue

        if "description" not in fm:
            errors.append(f"agent/{f.name}: missing description")

        if fm.get("name") and fm["name"] != name:
            errors.append(f"agent/{f.name}: name '{fm['name']}' != filename")

        if "skills" in fm:
            for skill in fm["skills"].split(","):
                skill = skill.strip()
                if skill and not (SKILLS_DIR / skill).exists():
                    errors.append(f"agent/{f.name}: skill '{skill}' not found")

    return errors


def validate_skills() -> list[str]:
    """Validate skill directories."""
    errors = []
    if not SKILLS_DIR.exists():
        return errors

    for skill_dir in SKILLS_DIR.iterdir():
        if not skill_dir.is_dir():
            continue

        skill_file = skill_dir / "SKILL.md"
        name = skill_dir.name

        if not skill_file.exists():
            errors.append(f"skill/{name}/: missing SKILL.md")
            continue

        content = skill_file.read_text()
        fm = parse_frontmatter(content)

        if not fm:
            errors.append(f"skill/{name}/SKILL.md: missing frontmatter")
            continue

        if "name" not in fm:
            errors.append(f"skill/{name}/SKILL.md: missing name")
        elif fm["name"] != name:
            errors.append(f"skill/{name}/SKILL.md: name '{fm['name']}' != dir")

        if "description" not in fm:
            errors.append(f"skill/{name}/SKILL.md: missing description")

    return errors


def validate_commands() -> list[str]:
    """Validate command files."""
    errors = []
    if not COMMANDS_DIR.exists():
        return errors

    for f in COMMANDS_DIR.glob("*.md"):
        content = f.read_text()
        fm = parse_frontmatter(content)

        if not fm:
            errors.append(f"command/{f.name}: missing frontmatter")
            continue

        if "description" not in fm:
            errors.append(f"command/{f.name}: missing description")

    return errors


def main():
    errors = []
    errors.extend(validate_agents())
    errors.extend(validate_skills())
    errors.extend(validate_commands())

    if errors:
        msg = "⚠️ .claude/ validation errors:\n• " + "\n• ".join(errors)
        print(json.dumps({"systemMessage": msg}))

    sys.exit(0)


if __name__ == "__main__":
    main()
