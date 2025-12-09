"""Parallel worker management via git worktrees and headless Claude sessions."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from .base import BaseCommand

# Configurable via settings.json env block (defaults below)
PARALLEL_MAX_WORKERS = int(os.environ.get("PARALLEL_MAX_WORKERS", "3"))
PARALLEL_WORKER_PREFIX = os.environ.get("PARALLEL_WORKER_PREFIX", "claude-worker-")


def get_project_root() -> Path:
    """Get project root from git."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Not a git repository or git not found: {result.stderr.strip()}")
    return Path(result.stdout.strip())


def get_workers_dir() -> Path:
    """Get parent directory for worktrees (sibling to project)."""
    return get_project_root().parent


def get_worker_path(worker_name: str) -> Path:
    """Get path for a specific worker worktree."""
    return get_workers_dir() / f"{PARALLEL_WORKER_PREFIX}{worker_name}"


def sanitize_branch_name(name: str) -> str:
    """Sanitize string for use in branch/worker names.

    Git branch names cannot contain: ~ ^ : ? * [ \\ @{ consecutive dots (..)
    Also removes control characters and leading/trailing dots/slashes.
    """
    import re
    # Replace forbidden characters with dash
    result = re.sub(r'[~^:?*\[\]\\@{}\s/]', '-', name)
    # Remove consecutive dots
    result = re.sub(r'\.{2,}', '.', result)
    # Remove consecutive dashes
    result = re.sub(r'-{2,}', '-', result)
    # Remove leading/trailing dots, dashes, slashes
    result = result.strip('.-/')
    # Lowercase
    return result.lower()


class SpawnCommand(BaseCommand):
    name = "spawn"
    description = "Create worktree + copy .env + launch headless Claude session"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--branch", required=True, help="Branch name for worker (auto-prefixed if needed)")
        parser.add_argument("--task", required=True, help="Task description for the worker")
        parser.add_argument("--from", dest="from_branch", default="HEAD", help="Base branch (default: HEAD)")
        parser.add_argument("--tools", help="Comma-separated allowed tools (default: all tools)")

    def execute(self, branch: str, task: str, from_branch: str = "HEAD", tools: Optional[str] = None, **kwargs) -> dict:
        # Check for nested worker prevention
        if os.environ.get("PARALLEL_WORKER_DEPTH"):
            return self.error(
                "nesting_blocked",
                "Cannot spawn workers from within a worker",
                suggestion="Use Task tool for subagents if needed"
            )

        # Check worker limit
        existing = self._list_workers()
        if len(existing) >= PARALLEL_MAX_WORKERS:
            return self.error(
                "limit_exceeded",
                f"Max {PARALLEL_MAX_WORKERS} concurrent workers. Run 'envoy parallel cleanup' first.",
                suggestion=f"Active workers: {', '.join(existing)}"
            )

        # Sanitize and create worker name
        worker_name = sanitize_branch_name(branch)
        worker_path = get_worker_path(worker_name)

        if worker_path.exists():
            return self.error(
                "already_exists",
                f"Worker '{worker_name}' already exists at {worker_path}",
                suggestion="Use 'envoy parallel status' to check or 'envoy parallel cleanup' to remove"
            )

        try:
            # Create worktree with new branch
            result = subprocess.run(
                ["git", "worktree", "add", "-b", branch, str(worker_path), from_branch],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                return self.error("git_error", f"Failed to create worktree: {result.stderr}")

            # Copy .env if exists
            project_root = get_project_root()
            env_file = project_root / ".env"
            if env_file.exists():
                shutil.copy(env_file, worker_path / ".env")

            # Launch headless Claude session in background
            log_file = worker_path / ".claude-worker.log"
            with open(log_file, "w") as log:
                # Build command - no tool restrictions by default
                cmd = ["claude", "--print"]
                if tools:
                    cmd.extend(["--allowedTools", tools])

                # Prepend anti-nesting directive to task
                worker_prompt = (
                    "IMPORTANT: Do not use `envoy parallel spawn` - nested workers are not allowed. "
                    "You may use Task tool for subagents if needed.\n\n"
                    f"{task}"
                )
                cmd.append(worker_prompt)

                # Set worker depth env var to prevent nesting
                worker_env = os.environ.copy()
                worker_env["PARALLEL_WORKER_DEPTH"] = "1"

                process = subprocess.Popen(
                    cmd,
                    cwd=str(worker_path),
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,  # Detach from parent
                    env=worker_env,
                )

            # Save worker metadata
            metadata = {
                "branch": branch,
                "task": task,
                "from_branch": from_branch,
                "pid": process.pid,
                "worker_path": str(worker_path),
            }
            with open(worker_path / ".claude-worker-meta.json", "w") as f:
                json.dump(metadata, f, indent=2)

            return self.success({
                "worker": worker_name,
                "branch": branch,
                "path": str(worker_path),
                "pid": process.pid,
                "task": task,
            })

        except Exception as e:
            # Cleanup on failure
            if worker_path.exists():
                subprocess.run(["git", "worktree", "remove", "--force", str(worker_path)], capture_output=True)
            return self.error("spawn_error", str(e))

    def _list_workers(self) -> list[str]:
        """List existing worker names."""
        workers_dir = get_workers_dir()
        return [
            d.name.replace(PARALLEL_WORKER_PREFIX, "")
            for d in workers_dir.iterdir()
            if d.is_dir() and d.name.startswith(PARALLEL_WORKER_PREFIX)
        ]


class StatusCommand(BaseCommand):
    name = "status"
    description = "List all parallel workers and their status"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        workers_dir = get_workers_dir()
        workers = []

        for d in workers_dir.iterdir():
            if not d.is_dir() or not d.name.startswith(PARALLEL_WORKER_PREFIX):
                continue

            worker_name = d.name.replace(PARALLEL_WORKER_PREFIX, "")
            meta_file = d / ".claude-worker-meta.json"
            log_file = d / ".claude-worker.log"

            worker_info = {
                "name": worker_name,
                "path": str(d),
                "status": "unknown",
            }

            # Load metadata
            if meta_file.exists():
                with open(meta_file) as f:
                    meta = json.load(f)
                    worker_info.update({
                        "branch": meta.get("branch"),
                        "task": meta.get("task"),
                        "pid": meta.get("pid"),
                    })

                # Check if process still running
                pid = meta.get("pid")
                if pid:
                    try:
                        os.kill(pid, 0)  # Check if process exists
                        worker_info["status"] = "running"
                    except OSError:
                        worker_info["status"] = "completed"

            # Get log tail
            if log_file.exists():
                with open(log_file) as f:
                    lines = f.readlines()
                    worker_info["log_lines"] = len(lines)
                    worker_info["log_tail"] = "".join(lines[-5:]) if lines else ""

            workers.append(worker_info)

        return self.success({
            "workers": workers,
            "count": len(workers),
            "max_workers": PARALLEL_MAX_WORKERS,
        })


class ResultsCommand(BaseCommand):
    name = "results"
    description = "Get output from worker(s)"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--worker", help="Specific worker name (default: all)")
        parser.add_argument("--tail", type=int, default=50, help="Number of log lines (default: 50)")

    def execute(self, worker: Optional[str] = None, tail: int = 50, **kwargs) -> dict:
        workers_dir = get_workers_dir()
        results = []

        for d in workers_dir.iterdir():
            if not d.is_dir() or not d.name.startswith(PARALLEL_WORKER_PREFIX):
                continue

            worker_name = d.name.replace(PARALLEL_WORKER_PREFIX, "")
            if worker and worker_name != worker:
                continue

            log_file = d / ".claude-worker.log"
            meta_file = d / ".claude-worker-meta.json"

            result = {"name": worker_name, "path": str(d)}

            if meta_file.exists():
                with open(meta_file) as f:
                    meta = json.load(f)
                    result["task"] = meta.get("task")
                    result["branch"] = meta.get("branch")

            if log_file.exists():
                with open(log_file) as f:
                    lines = f.readlines()
                    result["output"] = "".join(lines[-tail:])
                    result["total_lines"] = len(lines)
            else:
                result["output"] = "(no output yet)"

            results.append(result)

        if worker and not results:
            return self.error("not_found", f"Worker '{worker}' not found")

        return self.success({"results": results})


class CleanupCommand(BaseCommand):
    name = "cleanup"
    description = "Remove worker worktrees"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--worker", help="Specific worker to remove (default: all completed)")
        parser.add_argument("--all", action="store_true", dest="remove_all", help="Remove all workers including running")
        parser.add_argument("--force", action="store_true", help="Force removal even with uncommitted changes")

    def execute(self, worker: Optional[str] = None, remove_all: bool = False, force: bool = False, **kwargs) -> dict:
        workers_dir = get_workers_dir()
        removed = []
        skipped = []
        errors = []

        for d in workers_dir.iterdir():
            if not d.is_dir() or not d.name.startswith(PARALLEL_WORKER_PREFIX):
                continue

            worker_name = d.name.replace(PARALLEL_WORKER_PREFIX, "")
            if worker and worker_name != worker:
                continue

            meta_file = d / ".claude-worker-meta.json"

            # Check if running
            is_running = False
            pid = None
            if meta_file.exists():
                with open(meta_file) as f:
                    meta = json.load(f)
                    pid = meta.get("pid")
                    if pid:
                        try:
                            os.kill(pid, 0)
                            is_running = True
                        except OSError:
                            pass

            # Skip running workers unless --all
            if is_running and not remove_all:
                skipped.append({"name": worker_name, "reason": "still running"})
                continue

            # Kill process if running
            if is_running and pid:
                try:
                    os.kill(pid, 9)
                except OSError:
                    pass

            # Get branch name for cleanup
            branch_name = None
            if meta_file.exists():
                with open(meta_file) as f:
                    branch_name = json.load(f).get("branch")

            # Remove worktree
            cmd = ["git", "worktree", "remove", str(d)]
            if force:
                cmd.append("--force")

            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                errors.append({"name": worker_name, "error": result.stderr})
                continue

            # Delete the branch
            if branch_name:
                subprocess.run(
                    ["git", "branch", "-D", branch_name],
                    capture_output=True,
                    text=True,
                )

            removed.append(worker_name)

        return self.success({
            "removed": removed,
            "skipped": skipped,
            "errors": errors,
        })


COMMANDS = {
    "spawn": SpawnCommand,
    "status": StatusCommand,
    "results": ResultsCommand,
    "cleanup": CleanupCommand,
}
