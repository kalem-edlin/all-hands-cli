"""Plan lifecycle management commands.

Direct Mode Branches
--------------------
Certain branches skip planning functionality entirely ("direct mode"):

- **Protected branches**: main, master, develop, staging, production
  These are deployment/integration branches where work should already
  be planned and reviewed before merging.

- **Quick branches**: quick/*
  Rapid iteration branches (e.g., quick/hotfix, quick/typo) that
  intentionally skip planning overhead for small, focused changes.

When on a direct mode branch:
- No plan directories are created
- Query capture is skipped
- File reference tracking is disabled

This keeps the planning system focused on feature development branches
where structured planning provides the most value.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from .base import BaseCommand

# Direct mode configuration - branches that skip planning
DIRECT_MODE_BRANCHES = {"main", "master", "develop", "staging", "production"}
DIRECT_MODE_PREFIXES = ("quick/",)


def get_branch() -> str:
    """Get current git branch name."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
        )
        return result.stdout.strip() or "main"
    except Exception:
        return "main"


def is_direct_mode_branch(branch: str) -> bool:
    """Check if branch should use direct mode (no planning).
    
    Direct mode branches include:
    - Protected branches: main, master, develop, staging, production
    - Quick branches: quick/* prefix
    
    Returns:
        True if planning should be skipped for this branch.
    """
    if not branch:
        return True
    if branch in DIRECT_MODE_BRANCHES:
        return True
    for prefix in DIRECT_MODE_PREFIXES:
        if branch.startswith(prefix):
            return True
    return False


def sanitize_branch(branch: str) -> str:
    """Sanitize branch name for directory (feat/auth -> feat-auth)."""
    return re.sub(r"[^a-zA-Z0-9_-]", "-", branch)


def get_plan_dir(cwd: Optional[str] = None) -> Path:
    """Get plan directory for current branch."""
    base = Path(cwd) if cwd else Path.cwd()
    branch = get_branch()
    return base / ".claude" / "plans" / sanitize_branch(branch)


class PlansCaptureCommand(BaseCommand):
    """Capture user prompt to branch-scoped plan directory."""

    name = "capture"
    description = "Capture user prompt (called by UserPromptSubmit hook)"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--prompt", help="Prompt text (reads from stdin if not provided)")

    def execute(self, prompt: Optional[str] = None, **kwargs) -> dict:
        # Read from stdin if no prompt provided (hook mode)
        if prompt is None:
            try:
                input_data = json.load(sys.stdin)
                prompt = input_data.get("prompt", "")
                cwd = input_data.get("cwd", ".")
            except (json.JSONDecodeError, EOFError):
                return self.success({})
        else:
            cwd = "."

        # Skip capture on direct mode branches
        branch = get_branch()
        if is_direct_mode_branch(branch):
            return self.success({})

        # Skip capture if plan is active or deactivated (only track during draft)
        plan_file = get_plan_dir(cwd) / "plan.md"
        if plan_file.exists():
            frontmatter = parse_frontmatter(plan_file.read_text())
            status = frontmatter.get("status", "draft")
            if status in ("active", "deactivated"):
                return self.success({})

        if not prompt:
            return self.success({"captured": False, "reason": "empty prompt"})

        plan_dir = get_plan_dir(cwd)
        plan_dir.mkdir(parents=True, exist_ok=True)

        # Append query
        queries_file = plan_dir / "queries.jsonl"
        with open(queries_file, "a") as f:
            f.write(json.dumps({"prompt": prompt}) + "\n")

        # Extract and save file references
        file_refs = self._extract_file_refs(prompt, cwd)
        if file_refs:
            files_file = plan_dir / "files.jsonl"
            with open(files_file, "a") as f:
                for fp in file_refs:
                    f.write(json.dumps({"path": fp}) + "\n")

        return self.success({})

    def _extract_file_refs(self, prompt: str, cwd: str) -> list[str]:
        """Extract file paths mentioned in prompt that actually exist."""
        patterns = re.findall(r"[\w./\-]+\.\w+", prompt)
        existing = []
        for p in patterns:
            full_path = os.path.join(cwd, p)
            if os.path.isfile(full_path):
                existing.append(p)
        return existing


class PlansCleanupCommand(BaseCommand):
    """Remove plan directories for branches that no longer exist."""

    name = "cleanup"
    description = "Remove orphaned plan directories"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        plans_dir = Path.cwd() / ".claude" / "plans"
        if not plans_dir.exists():
            return self.success({"removed": [], "message": "No plans directory"})

        # Get existing branches
        result = subprocess.run(
            ["git", "branch", "--format=%(refname:short)"],
            capture_output=True,
            text=True,
        )
        branches = set(result.stdout.strip().split("\n")) if result.returncode == 0 else set()
        sanitized_branches = {sanitize_branch(b) for b in branches if b}

        removed = []
        for plan_dir in plans_dir.iterdir():
            if plan_dir.is_dir() and plan_dir.name not in sanitized_branches:
                shutil.rmtree(plan_dir)
                removed.append(plan_dir.name)

        return self.success({
            "removed": removed,
            "message": f"Removed {len(removed)} orphaned plan directories",
        })


def parse_frontmatter(content: str) -> dict:
    """Parse YAML frontmatter from plan.md content."""
    if not content.startswith("---"):
        return {}
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}
    result = {}
    for line in parts[1].strip().split("\n"):
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip()
    return result


class PlansStatusCommand(BaseCommand):
    """Show status of current branch's plan."""

    name = "status"
    description = "Show plan status for current branch"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        branch = get_branch()

        if is_direct_mode_branch(branch):
            return self.success({
                "branch": branch,
                "mode": "direct",
                "has_plan": False,
                "message": "Direct mode - planning disabled",
            })

        plan_dir = get_plan_dir()

        if not plan_dir.exists():
            return self.success({
                "branch": branch,
                "has_plan": False,
            })

        queries_count = 0
        queries_file = plan_dir / "queries.jsonl"
        if queries_file.exists():
            with open(queries_file) as f:
                queries_count = sum(1 for _ in f)

        files_count = 0
        files_file = plan_dir / "files.jsonl"
        if files_file.exists():
            with open(files_file) as f:
                files_count = sum(1 for _ in f)

        plan_file = plan_dir / "plan.md"
        has_plan_md = plan_file.exists()
        frontmatter = {}
        if has_plan_md:
            frontmatter = parse_frontmatter(plan_file.read_text())

        return self.success({
            "branch": branch,
            "has_plan": True,
            "plan_dir": str(plan_dir),
            "queries_count": queries_count,
            "files_referenced": files_count,
            "has_plan_md": has_plan_md,
            "status": frontmatter.get("status"),
        })


class PlansCreateCommand(BaseCommand):
    """Create plan.md with frontmatter template."""

    name = "create"
    description = "Create plan.md with draft frontmatter"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        branch = get_branch()
        if is_direct_mode_branch(branch):
            return self.error("direct_mode", f"Planning disabled on {branch}")

        plan_dir = get_plan_dir()
        plan_file = plan_dir / "plan.md"

        if plan_file.exists():
            frontmatter = parse_frontmatter(plan_file.read_text())
            return self.success({
                "created": False,
                "exists": True,
                "path": str(plan_file),
                "status": frontmatter.get("status"),
            })

        plan_dir.mkdir(parents=True, exist_ok=True)
        template = f"""---
status: draft
branch: {branch}
---

# Plan: [Feature Name]

[Summary and notes]

---

## Step 1: [Title]
Step details (may include: pseudocode, context, research, `/plan-checkpoint --last-commit` for complex steps)

---

## Steps

- [ ] Step 1: [Title]
- [ ] `/plan-checkpoint` (reviews all commits against base branch)

## Unresolved Questions

"""
        plan_file.write_text(template)

        return self.success({
            "created": True,
            "path": str(plan_file),
            "status": "draft",
        })


class PlansSetStatusCommand(BaseCommand):
    """Update plan frontmatter status."""

    name = "set-status"
    description = "Set plan status (draft|active|deactivated)"

    def add_arguments(self, parser) -> None:
        parser.add_argument("status", choices=["draft", "active", "deactivated"])

    def execute(self, *, status: str, **kwargs) -> dict:
        branch = get_branch()
        if is_direct_mode_branch(branch):
            return self.error("direct_mode", f"Planning disabled on {branch}")

        plan_file = get_plan_dir() / "plan.md"
        if not plan_file.exists():
            return self.error("not_found", "No plan file exists")

        content = plan_file.read_text()
        new_content = re.sub(
            r"^(status:\s*)\w+",
            f"\\g<1>{status}",
            content,
            flags=re.MULTILINE,
        )
        plan_file.write_text(new_content)

        return self.success({
            "status": status,
            "path": str(plan_file),
        })


def is_worker_subprocess() -> bool:
    """Check if running inside a parallel worker subprocess."""
    depth = os.environ.get("PARALLEL_WORKER_DEPTH", "0")
    try:
        return int(depth) > 0
    except ValueError:
        return False


class PlansFrontmatterCommand(BaseCommand):
    """Get plan frontmatter as JSON."""

    name = "frontmatter"
    description = "Get plan frontmatter"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        branch = get_branch()

        # Worker subprocess mode - planning disabled, use injected plan
        if is_worker_subprocess():
            plan_file = get_plan_dir() / "plan.md"
            return self.success({
                "mode": "worker",
                "exists": plan_file.exists(),
                "path": str(plan_file) if plan_file.exists() else None,
                "branch": branch,
                "message": "/plan command disabled in worker subprocess. Use injected plan file.",
                "planning_disabled": True,
            })

        if is_direct_mode_branch(branch):
            return self.success({
                "mode": "direct",
                "exists": False,
            })

        plan_file = get_plan_dir() / "plan.md"
        if not plan_file.exists():
            return self.success({
                "exists": False,
                "branch": branch,
            })

        frontmatter = parse_frontmatter(plan_file.read_text())
        return self.success({
            "exists": True,
            "path": str(plan_file),
            "frontmatter": frontmatter,
        })


class PlansClearQueriesCommand(BaseCommand):
    """Clear captured queries for current branch."""

    name = "clear-queries"
    description = "Clear captured queries (called when plan activated)"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        branch = get_branch()
        if is_direct_mode_branch(branch):
            return self.success({})

        plan_dir = get_plan_dir()
        queries_file = plan_dir / "queries.jsonl"
        files_file = plan_dir / "files.jsonl"

        cleared = []
        last_query = None

        # Keep last query before clearing
        if queries_file.exists():
            lines = queries_file.read_text().strip().split("\n")
            if lines and lines[-1]:
                last_query = lines[-1]
            queries_file.unlink()
            cleared.append("queries.jsonl")

        if files_file.exists():
            files_file.unlink()
            cleared.append("files.jsonl")

        return self.success({"cleared": cleared, "last_query": last_query})


COMMANDS = {
    "capture": PlansCaptureCommand,
    "cleanup": PlansCleanupCommand,
    "status": PlansStatusCommand,
    "create": PlansCreateCommand,
    "set-status": PlansSetStatusCommand,
    "frontmatter": PlansFrontmatterCommand,
    "clear-queries": PlansClearQueriesCommand,
}
