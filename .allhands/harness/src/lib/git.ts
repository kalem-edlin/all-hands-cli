/**
 * Git utilities for All Hands CLI.
 *
 * Provides git context for notifications and other features.
 */

import { execSync, spawnSync } from "child_process";
import { basename } from "path";

// Protected branches - no planning required
const PROTECTED_BRANCHES = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "staging",
  "stage",
  "production",
  "prod",
]);

// Prefixes that indicate direct mode (no planning)
const DIRECT_MODE_PREFIXES = ["quick/", "curator/"];

/**
 * Get current git branch name.
 * Uses CLAUDE_PROJECT_DIR if available (for hooks), else current directory.
 */
export function getBranch(): string {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const result = spawnSync("git", ["branch", "--show-current"], {
      encoding: "utf-8",
      cwd,
    });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Convert branch name to safe directory name (feat/auth -> feat-auth).
 */
export function sanitizeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Check if branch should skip planning.
 */
export function isDirectModeBranch(branch: string): boolean {
  if (PROTECTED_BRANCHES.has(branch)) {
    return true;
  }
  return DIRECT_MODE_PREFIXES.some((prefix) => branch.startsWith(prefix));
}

/**
 * Auto-detect base branch using merge-base.
 * Respects BASE_BRANCH env variable if set.
 */
export function getBaseBranch(): string {
  const envBase = process.env.BASE_BRANCH;
  if (envBase) {
    return envBase;
  }

  const candidates = ["main", "master", "develop", "staging", "production"];

  for (const base of candidates) {
    try {
      const result = spawnSync("git", ["merge-base", base, "HEAD"], {
        encoding: "utf-8",
      });
      if (result.status === 0) {
        return base;
      }
    } catch {
      continue;
    }
  }

  return "main";
}

/**
 * Get git diff against a reference.
 */
export function getDiff(ref: string): string {
  try {
    const result = spawnSync("git", ["diff", ref], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (result.status !== 0) {
      // Fallback to empty tree if ref doesn't exist (fresh repo)
      const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
      const fallback = spawnSync("git", ["diff", emptyTree], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      return fallback.stdout || "(No changes)";
    }

    return result.stdout || "(No changes)";
  } catch {
    return "(Unable to get diff)";
  }
}

/**
 * Get the project root directory (where .git is located).
 * Uses CLAUDE_PROJECT_DIR if available (for hooks), else current directory.
 */
export function getProjectRoot(): string {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      cwd,
    });
    return result.trim();
  } catch {
    return cwd;
  }
}

/**
 * Get the repo's root directory name (e.g., "claude-agents").
 */
export function getRepoName(): string {
  return basename(getProjectRoot()) || "";
}

/**
 * Get the plan directory path for current branch.
 */
export function getPlanDir(cwd?: string): string {
  const root = cwd ?? getProjectRoot();
  const branch = getBranch();
  const planId = sanitizeBranch(branch);
  return `${root}/.allhands/plans/${planId}`;
}

/**
 * Get diff from base branch to HEAD.
 * Combines getBaseBranch() and getDiff() for convenience.
 */
export function getDiffFromBase(cwd?: string): string {
  const workingDir = cwd || process.cwd();
  const baseBranch = getBaseBranch();

  try {
    // Use three-dot diff to show changes since divergence
    const result = spawnSync("git", ["diff", `${baseBranch}...HEAD`], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: workingDir,
    });

    if (result.status !== 0) {
      return getDiff(baseBranch);
    }

    return result.stdout || "(No changes from base)";
  } catch {
    return getDiff(baseBranch);
  }
}

/**
 * Get diff stat summary from base branch.
 */
export function getDiffStatFromBase(cwd?: string): string {
  const workingDir = cwd || process.cwd();
  const baseBranch = getBaseBranch();

  try {
    const result = spawnSync("git", ["diff", `${baseBranch}...HEAD`, "--stat"], {
      encoding: "utf-8",
      cwd: workingDir,
    });

    return result.status === 0 ? result.stdout.trim() : "(Unable to get diff stat)";
  } catch {
    return "(Unable to get diff stat)";
  }
}

/**
 * Get the current HEAD commit hash.
 */
export function getHeadCommit(cwd?: string): string {
  const workingDir = cwd || process.cwd();

  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf-8",
      cwd: workingDir,
    });

    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Get short commit hash (7 chars).
 */
export function getShortCommit(commitHash: string): string {
  return commitHash.substring(0, 7);
}

/**
 * Get list of changed file names from base branch to HEAD.
 * Returns just the file paths, one per line.
 */
export function getChangedFilesFromBase(cwd?: string): string[] {
  const workingDir = cwd || process.cwd();
  const baseBranch = getBaseBranch();

  try {
    const result = spawnSync("git", ["diff", `${baseBranch}...HEAD`, "--name-only"], {
      encoding: "utf-8",
      cwd: workingDir,
    });

    if (result.status !== 0 || !result.stdout.trim()) {
      return [];
    }

    return result.stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
