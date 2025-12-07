"""Plan lifecycle management commands.

Direct Mode Branches
--------------------
Certain branches skip planning functionality entirely ("direct mode"):

- **Protected branches**: main, master, staging, production
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
DIRECT_MODE_BRANCHES = {"main", "master", "staging", "production"}
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
    - Protected branches: main, master, staging, production
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
                return self.error("invalid_input", "No prompt provided and stdin empty")
        else:
            cwd = "."

        # Skip capture on direct mode branches
        branch = get_branch()
        if is_direct_mode_branch(branch):
            return self.success({
                "captured": False,
                "reason": f"direct mode branch ({branch})",
            })

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

        return self.success({
            "captured": True,
            "plan_dir": str(plan_dir),
            "files_referenced": file_refs,
        })

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


class PlansStatusCommand(BaseCommand):
    """Show status of current branch's plan."""

    name = "status"
    description = "Show plan status for current branch"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        branch = get_branch()
        
        # Check for direct mode branches first
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

        has_plan_md = (plan_dir / "plan.md").exists()

        return self.success({
            "branch": get_branch(),
            "has_plan": True,
            "plan_dir": str(plan_dir),
            "queries_count": queries_count,
            "files_referenced": files_count,
            "has_plan_md": has_plan_md,
        })


COMMANDS = {
    "capture": PlansCaptureCommand,
    "cleanup": PlansCleanupCommand,
    "status": PlansStatusCommand,
}
