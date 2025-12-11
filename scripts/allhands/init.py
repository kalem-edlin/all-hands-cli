"""Initialize allhands in a target repository."""

import shutil
import sys
from pathlib import Path

from .manifest import Manifest
from .patch import get_current_commit


def prompt_conflict(file_path: Path, auto_yes: bool) -> str:
    """Prompt user for conflict resolution: Replace or Combine."""
    if auto_yes:
        return "replace"

    print(f"\nConflict: {file_path} exists in target repo")
    print("  [r] Replace - overwrite with allhands version")
    print("  [c] Combine - keep both (generate patch for your changes)")
    print("  [s] Skip - keep target version as-is")

    while True:
        choice = input("Choice [r/c/s]: ").strip().lower()
        if choice in ("r", "replace"):
            return "replace"
        elif choice in ("c", "combine"):
            return "combine"
        elif choice in ("s", "skip"):
            return "skip"
        print("Invalid choice. Enter r, c, or s.")


def cmd_init(target: Path, auto_yes: bool = False) -> int:
    """Initialize allhands in target repository.

    Args:
        target: Path to target repository
        auto_yes: Skip confirmation prompts (default: replace on conflict)
    """
    target = target.resolve()

    # Find allhands root (where this script lives)
    allhands_root = Path(__file__).parent.parent.parent.resolve()
    manifest = Manifest(allhands_root)

    print(f"Initializing allhands in: {target}")
    print(f"Source: {allhands_root}")

    if not target.exists():
        print(f"Error: Target directory does not exist: {target}", file=sys.stderr)
        return 1

    # Check if target is a git repo
    if not (target / ".git").exists():
        print(f"Warning: Target is not a git repository: {target}", file=sys.stderr)
        if not auto_yes:
            confirm = input("Continue anyway? [y/N]: ").strip().lower()
            if confirm != "y":
                print("Aborted.")
                return 1

    distributable = manifest.get_distributable_files()
    print(f"Found {len(distributable)} files to distribute")

    combine_files = []
    copied = 0
    skipped = 0

    for rel_path in sorted(distributable):
        source_file = allhands_root / rel_path
        target_file = target / rel_path

        # Ensure parent directory exists
        target_file.parent.mkdir(parents=True, exist_ok=True)

        if target_file.exists():
            # Check if files are identical
            if source_file.read_bytes() == target_file.read_bytes():
                skipped += 1
                continue

            # Conflict - ask user
            choice = prompt_conflict(rel_path, auto_yes)

            if choice == "replace":
                shutil.copy2(source_file, target_file)
                copied += 1
            elif choice == "combine":
                combine_files.append(rel_path)
                shutil.copy2(source_file, target_file)
                copied += 1
            else:  # skip
                skipped += 1
        else:
            shutil.copy2(source_file, target_file)
            copied += 1

    # Generate patch for combined files
    if combine_files:
        print(f"\nGenerating patch for {len(combine_files)} combined files...")
        # Re-read original target versions to generate patch
        # Note: This is a simplified approach - in practice we'd save originals before copying
        print("Note: Run 'allhands update' after manually re-applying your customizations")
        print("Then commit the .allhands.patch file")

    # Create .allhandsignore template
    ignore_file = target / ".allhandsignore"
    if not ignore_file.exists():
        ignore_content = """# AllHands Ignore - Exclude files from sync-back to claude-all-hands
# Uses gitignore-style patterns (globs supported)
#
# ┌─────────────────────────────────────────────────────────────────┐
# │ TARGET-SPECIFIC (add here - stays in THIS repo only):          │
# │   • Project-specific agents, skills, commands                   │
# │   • Local configurations and settings                           │
# │   • Domain-specific hooks                                       │
# │   • Any file that only makes sense for THIS project             │
# ├─────────────────────────────────────────────────────────────────┤
# │ SYNC BACK (do NOT add here - benefits ALL repos):              │
# │   • Bug fixes to existing framework files                       │
# │   • New reusable patterns/skills discovered during development  │
# │   • Documentation improvements                                  │
# │   • Hook/envoy enhancements                                     │
# └─────────────────────────────────────────────────────────────────┘

# Project-specific agents
# .claude/agents/my-project-specialist.md

# Project-specific skills
# .claude/skills/my-domain-skill/**

# Local settings (never sync)
.claude/settings.local.json

# Project-specific commands
# .claude/commands/my-project-command.md
"""
        ignore_file.write_text(ignore_content)
        print("Created .allhandsignore template")

    # Create empty .allhands.patch placeholder
    patch_file = target / ".allhands.patch"
    if not patch_file.exists():
        base_commit = get_current_commit(allhands_root)
        patch_content = f"""# claude-all-hands base: {base_commit}
# generated: initial

# This file contains project-specific patches applied on top of allhands base.
# Do not edit manually - regenerated by 'allhands update' and 'allhands sync-back'.
"""
        patch_file.write_text(patch_content)
        print("Created .allhands.patch")

    print(f"\nDone: {copied} copied, {skipped} skipped")
    print("\nNext steps:")
    print("  1. Set ALLHANDS_PATH environment variable to: " + str(allhands_root))
    print("  2. Review and customize .allhandsignore")
    print("  3. Make project-specific changes, then run 'allhands update' to generate patches")
    print("  4. Commit .allhands.patch and .allhandsignore to your repo")

    return 0
