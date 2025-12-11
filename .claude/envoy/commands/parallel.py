"""Parallel worker management via git worktrees and synchronous Claude sessions."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from .base import BaseCommand

# Configurable via settings.json env block (defaults below)
PARALLEL_MAX_WORKERS = int(os.environ.get("PARALLEL_MAX_WORKERS", "3"))
HEARTBEAT_INTERVAL = 30  # seconds between heartbeat emissions


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
    """Get .trees/ directory for worktrees (inside project, gitignored)."""
    trees_dir = get_project_root() / ".trees"
    trees_dir.mkdir(exist_ok=True)
    return trees_dir


def get_worker_path(worker_name: str) -> Path:
    """Get path for a specific worker worktree."""
    return get_workers_dir() / worker_name


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
    description = "Create worktree + inject plan + run synchronous Claude session"

    def add_arguments(self, parser) -> None:
        parser.add_argument("--branch", required=True, help="Branch name for worker")
        parser.add_argument("--task", required=True, help="Task description for the worker")
        parser.add_argument("--from", dest="from_branch", default="HEAD", help="Base branch (default: HEAD)")
        parser.add_argument("--plan", help="Mini-plan markdown to inject into worktree")

    def execute(
        self,
        branch: str,
        task: str,
        from_branch: str = "HEAD",
        plan: Optional[str] = None,
        **kwargs,
    ) -> dict:
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

            # Create plan file if --plan provided
            if plan:
                plan_dir = worker_path / ".claude" / "plans" / worker_name
                plan_dir.mkdir(parents=True, exist_ok=True)
                plan_file = plan_dir / "plan.md"
                plan_content = f"---\nstatus: active\nbranch: {branch}\n---\n\n{plan}"
                plan_file.write_text(plan_content)

            # Build Claude command
            cmd = ["claude", "--print"]

            # Prepend anti-nesting directive to task
            worker_prompt = (
                "IMPORTANT: Do not use `envoy parallel spawn` - nested workers are not allowed. "
                "You may use Task tool for subagents if needed.\n\n"
                f"{task}"
            )
            cmd.extend(["-p", worker_prompt])

            # Set worker depth env var to prevent nesting and block planning
            worker_env = os.environ.copy()
            worker_env["PARALLEL_WORKER_DEPTH"] = "1"

            # Log file for debugging (full output)
            log_file = worker_path / ".claude-worker.log"

            # Save worker metadata before running
            metadata = {
                "branch": branch,
                "task": task,
                "from_branch": from_branch,
                "worker_path": str(worker_path),
                "started_at": time.time(),
            }
            with open(worker_path / ".claude-worker-meta.json", "w") as f:
                json.dump(metadata, f, indent=2)

            # Run synchronously - block until completion
            # Emit heartbeats to caller while waiting, write full log to file
            with open(log_file, "w") as log:
                process = subprocess.Popen(
                    cmd,
                    cwd=str(worker_path),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=worker_env,
                )

                last_heartbeat = time.time()
                output_lines = []

                # Stream output: write to log, emit heartbeats to caller
                while True:
                    line = process.stdout.readline()
                    if not line and process.poll() is not None:
                        break

                    if line:
                        # Write full output to log file
                        log.write(line)
                        log.flush()
                        output_lines.append(line)

                        # Emit heartbeat every HEARTBEAT_INTERVAL seconds
                        now = time.time()
                        if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                            # Heartbeat to stderr so it doesn't pollute JSON output
                            print(f"[heartbeat] {worker_name} - {len(output_lines)} lines", file=sys.stderr)
                            last_heartbeat = now

                exit_code = process.returncode

            # Update metadata with completion info
            metadata["completed_at"] = time.time()
            metadata["exit_code"] = exit_code
            metadata["output_lines"] = len(output_lines)
            with open(worker_path / ".claude-worker-meta.json", "w") as f:
                json.dump(metadata, f, indent=2)

            # Extract final summary (last non-empty lines)
            summary_lines = [l.strip() for l in output_lines[-10:] if l.strip()]
            summary = "\n".join(summary_lines[-3:]) if summary_lines else "(no output)"

            return self.success({
                "worker": worker_name,
                "branch": branch,
                "path": str(worker_path),
                "exit_code": exit_code,
                "status": "success" if exit_code == 0 else "failed",
                "summary": summary,
                "log_path": str(log_file),
                "output_lines": len(output_lines),
            })

        except Exception as e:
            # Cleanup on failure
            if worker_path.exists():
                subprocess.run(["git", "worktree", "remove", "--force", str(worker_path)], capture_output=True)
            return self.error("spawn_error", str(e))

    def _list_workers(self) -> list[str]:
        """List existing worker names."""
        workers_dir = get_workers_dir()
        if not workers_dir.exists():
            return []
        return [
            d.name
            for d in workers_dir.iterdir()
            if d.is_dir() and (d / ".claude-worker-meta.json").exists()
        ]


class StatusCommand(BaseCommand):
    name = "status"
    description = "List all parallel workers and their status"

    def add_arguments(self, parser) -> None:
        pass

    def execute(self, **kwargs) -> dict:
        workers_dir = get_workers_dir()
        workers = []

        if not workers_dir.exists():
            return self.success({"workers": [], "count": 0, "max_workers": PARALLEL_MAX_WORKERS})

        for d in workers_dir.iterdir():
            meta_file = d / ".claude-worker-meta.json"
            if not d.is_dir() or not meta_file.exists():
                continue

            worker_name = d.name
            log_file = d / ".claude-worker.log"

            worker_info = {
                "name": worker_name,
                "path": str(d),
                "status": "unknown",
            }

            # Load metadata
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

        if not workers_dir.exists():
            if worker:
                return self.error("not_found", f"Worker '{worker}' not found")
            return self.success({"results": []})

        for d in workers_dir.iterdir():
            meta_file = d / ".claude-worker-meta.json"
            if not d.is_dir() or not meta_file.exists():
                continue

            worker_name = d.name
            if worker and worker_name != worker:
                continue

            log_file = d / ".claude-worker.log"

            result = {"name": worker_name, "path": str(d)}

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

        if not workers_dir.exists():
            return self.success({"removed": [], "skipped": [], "errors": []})

        for d in workers_dir.iterdir():
            meta_file = d / ".claude-worker-meta.json"
            if not d.is_dir() or not meta_file.exists():
                continue

            worker_name = d.name
            if worker and worker_name != worker:
                continue

            # Check if running
            is_running = False
            pid = None
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
            branch_name = meta.get("branch")

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
