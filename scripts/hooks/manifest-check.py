#!/usr/bin/env python3
"""Check that all files in managed directories are covered by manifest patterns.

This hook runs ONLY in the claude-all-hands source repo (not distributed).
Warns on commit if files exist that aren't covered by distribute or internal patterns.
"""

import json
import fnmatch
import sys
from pathlib import Path


def load_manifest(repo_root: Path) -> dict:
    """Load manifest file."""
    manifest_path = repo_root / ".allhands-manifest.json"
    if not manifest_path.exists():
        return {}
    with open(manifest_path) as f:
        return json.load(f)


def matches_pattern(path: str, pattern: str) -> bool:
    """Check if path matches glob pattern."""
    if "**" in pattern:
        parts = pattern.split("**")
        if len(parts) == 2:
            prefix, suffix = parts
            prefix = prefix.rstrip("/")
            suffix = suffix.lstrip("/")
            if path.startswith(prefix) or not prefix:
                remaining = path[len(prefix):].lstrip("/") if prefix else path
                if not suffix:
                    return True
                return fnmatch.fnmatch(remaining, f"*{suffix}") or fnmatch.fnmatch(remaining, f"*/{suffix}")
    return fnmatch.fnmatch(path, pattern)


def is_covered(path: str, patterns: list) -> bool:
    """Check if path is covered by any pattern."""
    for pattern in patterns:
        if matches_pattern(path, pattern):
            return True
    return False


def get_managed_files(repo_root: Path) -> list:
    """Get all files that should be checked for manifest coverage."""
    files = []

    # Check .claude/ directory (excluding plans which are gitignored)
    claude_dir = repo_root / ".claude"
    if claude_dir.exists():
        for f in claude_dir.rglob("*"):
            if f.is_file():
                rel = str(f.relative_to(repo_root))
                # Skip gitignored paths
                if "/plans/" in rel or "/.venv/" in rel or "__pycache__" in rel:
                    continue
                files.append(rel)

    # Check .husky/ directory
    husky_dir = repo_root / ".husky"
    if husky_dir.exists():
        for f in husky_dir.rglob("*"):
            if f.is_file():
                files.append(str(f.relative_to(repo_root)))

    # Check scripts/ directory
    scripts_dir = repo_root / "scripts"
    if scripts_dir.exists():
        for f in scripts_dir.rglob("*"):
            if f.is_file():
                rel = str(f.relative_to(repo_root))
                if "__pycache__" in rel:
                    continue
                files.append(rel)

    # Check root-level files that might need coverage
    for f in repo_root.iterdir():
        if f.is_file() and not f.name.startswith("."):
            # Skip common non-distributed files
            if f.suffix in {".lock", ".log"}:
                continue
            files.append(f.name)

    return files


def main():
    repo_root = Path.cwd()

    # Only run in source repo (has manifest at root)
    if not (repo_root / ".allhands-manifest.json").exists():
        return 0

    manifest = load_manifest(repo_root)
    if not manifest:
        return 0

    distribute = manifest.get("distribute", [])
    internal = manifest.get("internal", [])
    exclude = manifest.get("exclude", [])
    all_patterns = distribute + internal + exclude

    files = get_managed_files(repo_root)
    uncovered = []

    for f in files:
        if not is_covered(f, all_patterns):
            uncovered.append(f)

    if uncovered:
        print("\n⚠️  Manifest coverage warning:", file=sys.stderr)
        print("The following files are not covered by .allhands-manifest.json:", file=sys.stderr)
        for f in sorted(uncovered):
            print(f"  - {f}", file=sys.stderr)
        print("\nAdd patterns to 'distribute', 'internal', or 'exclude' in manifest.", file=sys.stderr)
        print("This is a warning only - commit will proceed.\n", file=sys.stderr)

    return 0  # Always succeed (warning only)


if __name__ == "__main__":
    sys.exit(main())
